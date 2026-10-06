<?php
declare(strict_types=1);

// Never leak PHP warnings/notices as raw HTML — the frontend expects JSON.
ini_set('display_errors', '0');
error_reporting(E_ALL);
ob_start();
register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        while (ob_get_level() > 0) { ob_end_clean(); }
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Server error. Please try again.']);
    }
});

// Bump whenever schema changes are added to migrate() — the gate uses it to
// decide whether the (idempotent) migration set must re-run. Declared before
// the CLI hook because `const` is a runtime statement, not hoisted.
const SCHEMA_VERSION = 8;

// CLI deploy hook — `php api/index.php migrate [--force]` applies schema
// migrations at deploy time so no HTTP request ever pays the cost.
if (PHP_SAPI === 'cli') {
    if (($_SERVER['argv'][1] ?? '') === 'migrate') {
        migrate(db(), in_array('--force', $_SERVER['argv'], true));
        $v = (int)db()->query('SELECT COALESCE(MAX(version),0) FROM schema_migrations')->fetchColumn();
        echo "Schema migrations applied (v{$v}).\n";
        exit(0);
    }
    fwrite(STDERR, "SCIM API runs over HTTP. Usage: php api/index.php migrate [--force]\n");
    exit(1);
}

session_name('scim_session');
session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => isset($_SERVER['HTTPS'])
]);
session_start();

header('Content-Type: application/json; charset=utf-8');

// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================
function reply(mixed $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function body(): array {
    return json_decode(file_get_contents('php://input'), true) ?: [];
}

function currentUser(): ?array {
    // Per-tab bearer token takes precedence — isolates concurrent logins in the
    // same browser. The PHP session cookie is only a legacy fallback.
    static $cached;
    if ($cached === null) {
        $cached = tokenUser(db()) ?? ($_SESSION['user'] ?? null) ?? false;
    }
    return $cached ?: null;
}

function auth(array $roles = []): array {
    $u = currentUser();
    if (!$u) {
        reply(['error' => 'Authentication required.'], 401);
    }
    if ($roles && !in_array($u['role'], $roles, true)) {
        reply(['error' => 'Insufficient permission.'], 403);
    }
    return $u;
}

function audit(PDO $d, string $email, bool $ok, ?int $id = null): void {
    $q = $d->prepare('INSERT INTO login_history(user_id, email, success, ip_address) VALUES(?, ?, ?, ?)');
    $q->execute([$id, $email, $ok ? 1 : 0, $_SERVER['REMOTE_ADDR'] ?? null]);
}

// ==========================================
// EMAIL / SMTP FUNCTIONS
// ==========================================

// Read a config value from env var (checks getenv, $_SERVER, $_ENV)
function envVal(string $key, string $fallback = ''): string {
    $v = getenv($key);
    if ($v === false || $v === '') $v = $_SERVER[$key] ?? $_ENV[$key] ?? '';
    return ($v === false || $v === '') ? $fallback : $v;
}

// Load SMTP config from environment or config.php
function smtpConfig(): array {
    static $config = null;
    if ($config !== null) return $config;
    
    // Try config.php first (create this file on the server with SMTP credentials)
    $configFile = __DIR__ . '/../config.php';
    $fileConfig = [];
    if (file_exists($configFile)) {
        $fileConfig = require $configFile;
    }
    
    $config = [
        'host' => $fileConfig['smtp_host'] ?? envVal('SMTP_HOST'),
        'port' => (int)($fileConfig['smtp_port'] ?? envVal('SMTP_PORT', '587')),
        'user' => $fileConfig['smtp_user'] ?? envVal('SMTP_USER'),
        'pass' => $fileConfig['smtp_pass'] ?? envVal('SMTP_PASS'),
        'from' => $fileConfig['smtp_from'] ?? envVal('SMTP_FROM'),
        'from_name' => $fileConfig['smtp_from_name'] ?? envVal('SMTP_FROM_NAME', 'Great Solomon SCIM'),
    ];
    return $config;
}

// Minimal SMTP client supporting SSL (465) and STARTTLS (587)
function sendSmtpMail(string $to, string $subject, string $body, string $contentType = 'text/plain'): bool {
    $cfg = smtpConfig();
    
    // No SMTP configured - fall back to PHP mail()
    if (empty($cfg['host']) || empty($cfg['user']) || empty($cfg['pass'])) {
        $from = $cfg['from'] ?: 'noreply@greatsolomonmpservices.com';
        $headers = "From: {$cfg['from_name']} <{$from}>\r\n";
        return @mail($to, $subject, $body, $headers);
    }
    
    try {
        $useSsl = ($cfg['port'] === 465);
        $remote = ($useSsl ? 'ssl://' : '') . $cfg['host'];
        $socket = fsockopen($remote, $cfg['port'], $errno, $errstr, 20);
        if (!$socket) {
            error_log("SMTP connect failed: $errstr ($errno)");
            return false;
        }
        
        $read = function() use ($socket) {
            $data = '';
            while ($line = fgets($socket, 515)) {
                $data .= $line;
                if (isset($line[3]) && $line[3] === ' ') break;
            }
            return $data;
        };
        
        $send = function($cmd) use ($socket, $read) {
            fwrite($socket, $cmd . "\r\n");
            return $read();
        };
        
        $read(); // greeting
        $send('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
        
        if (!$useSsl) {
            $send('STARTTLS');
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($socket);
                error_log('SMTP STARTTLS failed');
                return false;
            }
            $send('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
        }
        
        $send('AUTH LOGIN');
        $send(base64_encode($cfg['user']));
        $resp = $send(base64_encode($cfg['pass']));
        if (strpos($resp, '235') === false) {
            fclose($socket);
            error_log("SMTP auth failed: $resp");
            return false;
        }
        
        $from = $cfg['from'] ?: $cfg['user'];
        $send("MAIL FROM: <$from>");
        $send("RCPT TO: <$to>");
        $resp = $send('DATA');
        if (strpos($resp, '354') === false) {
            fclose($socket);
            error_log("SMTP DATA failed: $resp");
            return false;
        }
        
        $headers = "From: {$cfg['from_name']} <$from>\r\n";
        $headers .= "To: <$to>\r\n";
        $headers .= "Subject: $subject\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: $contentType; charset=UTF-8\r\n";
        
        fwrite($socket, $headers . "\r\n" . $body . "\r\n.\r\n");
        $resp = $read();
        $send('QUIT');
        fclose($socket);
        
        if (strpos($resp, '250') === false) {
            error_log("SMTP send failed: $resp");
            return false;
        }
        return true;
    } catch (Throwable $e) {
        error_log('SMTP error: ' . $e->getMessage());
        return false;
    }
}

// Send OTP email to user
function sendOtpEmail(string $toEmail, string $toName, string $otp): bool {
    $subject = 'SCIM Login Verification Code';
    $name = htmlspecialchars($toName, ENT_QUOTES, 'UTF-8');
    
    $body = <<<HTML
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:12px;padding:40px;border:1px solid #e5e7eb;">
    <p style="font-size:15px;color:#111827;margin:0 0 16px;">Hello {$name},</p>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;">
      You are receiving this email because a login request was made for your account.
    </p>
    <p style="font-size:15px;color:#374151;margin:0 0 8px;">Your verification code is:</p>
    <div style="text-align:center;margin:0 0 24px;">
      <span style="display:inline-block;font-size:36px;font-weight:bold;letter-spacing:8px;color:#4f46e5;background:#eef2ff;border:2px dashed #c7d2fe;border-radius:10px;padding:16px 32px;">{$otp}</span>
    </div>
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px;">
      This code is highly sensitive and will expire in <strong>5 minutes</strong>.
    </p>
    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 24px;">
      If you did not initiate this login request, please ignore this email or contact your system administrator immediately to secure your account.
    </p>
    <p style="font-size:15px;color:#374151;margin:0;">
      Regards,<br><strong>Great Solomon Manpower Service, Inc.</strong>
    </p>
  </div>
</body>
</html>
HTML;
    
    return sendSmtpMail($toEmail, $subject, $body, 'text/html');
}


// ==========================================
// 2. DATABASE MIGRATION & CONNECTION
// ==========================================

function migrate(PDO $d, bool $force = false): void {
    // Perf: version-gated migrations. Without this, ~109 DDL statements ran on
    // every request (~700ms–1.5s measured). The sentinel keeps the check to two
    // cheap statements; a crashed migration never writes its version, so an
    // incomplete schema always retries rather than being skipped.
    $d->exec("CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    if (!$force) {
        $applied = (int)$d->query("SELECT COALESCE(MAX(version),0) FROM schema_migrations")->fetchColumn();
        if ($applied >= SCHEMA_VERSION) return;
    }

    // Core tables
    $d->exec("CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(40) UNIQUE NOT NULL
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(160) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(40) NOT NULL DEFAULT 'WarehouseStaff',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
        mfa_secret VARCHAR(255),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS login_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        email VARCHAR(160) NOT NULL,
        success TINYINT(1) NOT NULL,
        ip_address VARCHAR(64),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    
    // Asset & Warehouse tables
    $d->exec("CREATE TABLE IF NOT EXISTS assets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        qr_code VARCHAR(50) UNIQUE,
        name VARCHAR(120),
        category VARCHAR(60),
        value DECIMAL(12,2),
        status VARCHAR(40),
        location VARCHAR(80),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS warehouse_zones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        zone VARCHAR(20) UNIQUE NOT NULL,
        capacity INT NOT NULL DEFAULT 100,
        occupied INT NOT NULL DEFAULT 0
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS warehouse_rows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        zone VARCHAR(20) NOT NULL,
        row_num VARCHAR(10) NOT NULL,
        capacity INT NOT NULL DEFAULT 20,
        occupied INT NOT NULL DEFAULT 0,
        FOREIGN KEY (zone) REFERENCES warehouse_zones(zone)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS asset_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT,
        action VARCHAR(60),
        zone VARCHAR(20),
        created_at DATETIME,
        FOREIGN KEY(asset_id) REFERENCES assets(id)
    )");
    
    // Vendor & Procurement tables
    $d->exec("CREATE TABLE IF NOT EXISTS vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160),
        phone VARCHAR(20),
        address TEXT,
        category VARCHAR(60),
        on_time_rate INT DEFAULT 95,
        defect_rate DECIMAL(4,1) DEFAULT 0.0,
        rating DECIMAL(3,1) DEFAULT 4.0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_number VARCHAR(30) UNIQUE NOT NULL,
        vendor_id INT,
        vendor VARCHAR(120),
        items TEXT,
        total DECIMAL(12,2),
        status VARCHAR(40) DEFAULT 'Draft',
        expected_delivery DATE,
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_id INT,
        item_name VARCHAR(120),
        quantity INT,
        unit_price DECIMAL(12,2),
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS requisitions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        req_number VARCHAR(30) UNIQUE NOT NULL,
        title VARCHAR(200) NOT NULL,
        department VARCHAR(60),
        description TEXT,
        estimated_cost DECIMAL(12,2),
        actual_cost DECIMAL(12,2),
        priority VARCHAR(20) DEFAULT 'Medium',
        status VARCHAR(40) DEFAULT 'Draft',
        needed_by DATE,
        created_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS supplier_quotes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requisition_id INT,
        vendor_id INT,
        quote_amount DECIMAL(12,2),
        status VARCHAR(40) DEFAULT 'Pending',
        valid_until DATE,
        notes TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requisition_id) REFERENCES requisitions(id),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )");
    
    // Document tables - Handle existing document_logs table
    // Add missing columns to document_logs if they don't exist
    try {
        $d->exec("ALTER TABLE document_logs ADD COLUMN description TEXT");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE document_logs ADD COLUMN related_po VARCHAR(30)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE document_logs ADD COLUMN updated_at DATETIME");
    } catch (Exception $e) {
        // Column might already exist
    }
    
    // Check if documents table exists, if not create it and migrate from document_logs
    $documentsTableExists = $d->query("SHOW TABLES LIKE 'documents'")->fetch();
    if (!$documentsTableExists) {
        // Create documents table
        $d->exec("CREATE TABLE documents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            document_type VARCHAR(80) NOT NULL,
            reference_no VARCHAR(40) UNIQUE NOT NULL,
            owner VARCHAR(100) NOT NULL,
            description TEXT,
            related_po VARCHAR(30),
            due_date DATE,
            status VARCHAR(40) DEFAULT 'Pending Verification',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )");
        
        // Migrate data from document_logs to documents (skip on fresh DBs
        // where the legacy table never existed)
        if ($d->query("SHOW TABLES LIKE 'document_logs'")->fetch()) {
            $d->exec("INSERT INTO documents (document_type, reference_no, owner, description, related_po, due_date, status, created_at)
                SELECT document_type, reference_no, owner, description, related_po, due_date, status, created_at
                FROM document_logs");
        }
    }
    
    $d->exec("CREATE TABLE IF NOT EXISTS document_signatures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT,
        signer_name VARCHAR(120),
        signature_data TEXT,
        signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
    )");
    
    // Activity tracking tables
    $d->exec("CREATE TABLE IF NOT EXISTS po_activity (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_id INT,
        action VARCHAR(100),
        details TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS document_activity (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT,
        action VARCHAR(100),
        details TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id)
    )");
    
    // Migrate existing document_activity if it references document_logs
    try {
        $d->exec("UPDATE document_activity da 
            SET document_id = (SELECT id FROM documents WHERE reference_no = (SELECT reference_no FROM document_logs WHERE id = da.document_id))
            WHERE document_id IN (SELECT id FROM document_logs)");
    } catch (Exception $e) {
        // Migration might fail if foreign key constraints prevent it
    }
    
    // Insert default roles
    $d->exec("INSERT IGNORE INTO roles(name) VALUES ('Admin'),('Manager'),('WarehouseStaff'),('Staff')");
    
    // Create default admin user if not exists
    if (!(int)$d->query('SELECT COUNT(*) FROM users')->fetchColumn()) {
        $q = $d->prepare('INSERT INTO users(full_name, email, password_hash, role) VALUES(?, ?, ?, ?)');
        $q->execute(['System Administrator', 'admin@greatsolomon.test', password_hash('Welcome123!', PASSWORD_DEFAULT), 'Admin']);
    }

    // No demo accounts are seeded — standalone approval resolves purely by
    // RBAC role: any active Manager may approve departments that have no
    // department_approvers mappings yet (see isDeptApprover()).

    // Zone categorization column must exist before the seed below writes it.
    try { $d->exec("ALTER TABLE warehouse_zones ADD COLUMN category VARCHAR(60) NULL"); } catch (Exception $e) {}

    // Insert sample warehouse zones if not exists
    if (!(int)$d->query('SELECT COUNT(*) FROM warehouse_zones')->fetchColumn()) {
        $d->exec("INSERT INTO warehouse_zones(zone, capacity, occupied, category) VALUES
            ('A', 100, 32, 'IT Equipment'), ('B', 100, 68, 'Laptops'), ('C', 100, 91, 'Monitors'),
            ('D', 100, 48, 'Peripheral'), ('E', 100, 0, 'Office Supplies')");
        $d->exec("INSERT INTO warehouse_rows(zone, row_num, capacity, occupied) VALUES 
            ('A', '1', 20, 6), ('A', '2', 20, 8), ('A', '3', 20, 10), ('A', '4', 20, 8),
            ('B', '1', 20, 12), ('B', '2', 20, 14), ('B', '3', 20, 18), ('B', '4', 20, 24),
            ('C', '1', 20, 20), ('C', '2', 20, 19), ('C', '3', 20, 18), ('C', '4', 20, 17),
            ('D', '1', 20, 10), ('D', '2', 20, 12), ('D', '3', 20, 13), ('D', '4', 20, 13)");
    }
    
    // Insert sample vendors if not exists
    if (!(int)$d->query('SELECT COUNT(*) FROM vendors')->fetchColumn()) {
        $d->exec("INSERT INTO vendors(name, email, phone, address, category, on_time_rate, defect_rate, rating) VALUES 
            ('TechSource Asia', 'sales@techsource.asia', '+63-2-8123-4567', 'Makati City, Metro Manila', 'IT Equipment', 96, 1.2, 4.8),
            ('Prime Devices Co.', 'orders@primedevices.com', '+63-2-8765-4321', 'Quezon City, Metro Manila', 'IT Equipment', 91, 2.1, 4.4),
            ('Metro IT Supply', 'info@metroit.com', '+63-2-8234-5678', 'Taguig City, Metro Manila', 'Office Supplies', 87, 3.8, 4.0)");
    }
    
    // Add MFA columns to users table if they don't exist (for existing databases)
    try {
        $d->exec("ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(255)");
    } catch (Exception $e) {
        // Column might already exist
    }
    
    // Integration tables
    $d->exec("CREATE TABLE IF NOT EXISTS system_integrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        system_name VARCHAR(80) NOT NULL,
        system_type VARCHAR(40) NOT NULL,
        api_endpoint VARCHAR(255),
        api_key VARCHAR(255) NOT NULL,
        api_secret VARCHAR(255) NOT NULL,
        status VARCHAR(40) DEFAULT 'Active',
        contact_email VARCHAR(160),
        last_sync DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS external_references (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scim_entity_type VARCHAR(40) NOT NULL,
        scim_entity_id INT NOT NULL,
        external_system VARCHAR(80) NOT NULL,
        external_reference_id VARCHAR(100) NOT NULL,
        reference_type VARCHAR(40) NOT NULL,
        sync_status VARCHAR(40) DEFAULT 'Synced',
        last_synced DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_external_ref (external_system, external_reference_id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS equipment_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_number VARCHAR(30) UNIQUE NOT NULL,
        external_request_id VARCHAR(100),
        requesting_system VARCHAR(80) NOT NULL,
        employee_name VARCHAR(120) NOT NULL,
        employee_id VARCHAR(100),
        department VARCHAR(60),
        equipment_needed TEXT NOT NULL,
        needed_by DATE,
        business_justification TEXT,
        cost_center VARCHAR(40),
        priority VARCHAR(20) DEFAULT 'Medium',
        status VARCHAR(40) DEFAULT 'Pending',
        estimated_cost DECIMAL(12,2),
        actual_cost DECIMAL(12,2),
        rejection_reason TEXT,
        requested_date DATETIME,
        approved_by INT,
        approved_date DATETIME,
        fulfilled_date DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (approved_by) REFERENCES users(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS equipment_request_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        category VARCHAR(60) NOT NULL,
        specifications TEXT,
        quantity INT NOT NULL,
        priority VARCHAR(20) DEFAULT 'Medium',
        assigned_asset_id INT,
        assigned_qr_code VARCHAR(50),
        unit_cost DECIMAL(12,2),
        total_cost DECIMAL(12,2),
        fulfillment_status VARCHAR(40) DEFAULT 'Pending',
        fulfilled_date DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES equipment_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_asset_id) REFERENCES assets(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS equipment_request_activity (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        performed_by VARCHAR(120),
        performed_by_system VARCHAR(80),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES equipment_requests(id) ON DELETE CASCADE
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS webhooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        webhook_id VARCHAR(30) UNIQUE NOT NULL,
        system_integration_id INT,
        event_types TEXT NOT NULL,
        target_url VARCHAR(255) NOT NULL,
        webhook_secret VARCHAR(255) NOT NULL,
        active TINYINT(1) DEFAULT 1,
        retry_policy VARCHAR(40) DEFAULT 'exponential',
        max_retries INT DEFAULT 3,
        last_triggered DATETIME,
        success_count INT DEFAULT 0,
        failure_count INT DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (system_integration_id) REFERENCES system_integrations(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS webhook_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        webhook_id INT NOT NULL,
        event_id VARCHAR(50),
        event_type VARCHAR(80) NOT NULL,
        payload TEXT NOT NULL,
        response_code INT,
        response_body TEXT,
        delivery_status VARCHAR(40) DEFAULT 'Pending',
        attempt_number INT DEFAULT 1,
        next_retry_at DATETIME,
        sent_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (webhook_id) REFERENCES webhooks(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS integration_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        system_integration_id INT,
        external_system VARCHAR(80),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(40),
        entity_id INT,
        request_data TEXT,
        response_data TEXT,
        status VARCHAR(40) NOT NULL,
        error_message TEXT,
        ip_address VARCHAR(64),
        user_agent VARCHAR(255),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (system_integration_id) REFERENCES system_integrations(id)
    )");
    
    $d->exec("CREATE TABLE IF NOT EXISTS integration_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(80) UNIQUE NOT NULL,
        config_value TEXT,
        config_type VARCHAR(40) DEFAULT 'string',
        description TEXT,
        is_encrypted TINYINT(1) DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    
    // Add integration columns to existing tables
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN assigned_to_system VARCHAR(80)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN external_employee_id VARCHAR(100)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN external_employee_name VARCHAR(120)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN assignment_date DATE");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN assignment_notes TEXT");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN cost_center VARCHAR(40)");
    } catch (Exception $e) {
        // Column might already exist
    }
    // Centralized archive + deletion bin (TRD §7): archived rows are hidden
    // but restorable; deleted rows sit in a retention bin before purge.
    foreach (['assets', 'purchase_orders', 'requisitions', 'vendors', 'documents'] as $t) {
        try { $d->exec("ALTER TABLE $t ADD COLUMN archived_at DATETIME NULL"); } catch (Exception $e) {}
        try { $d->exec("ALTER TABLE $t ADD COLUMN deleted_at DATETIME NULL"); } catch (Exception $e) {}
    }
    // Zone categorization (TRD §2): every zone stores its assigned category.
    try { $d->exec("ALTER TABLE warehouse_zones ADD COLUMN category VARCHAR(60) NULL"); } catch (Exception $e) {}
    // Dedicated disposal zone for write-offs.
    $d->exec("INSERT IGNORE INTO warehouse_zones(zone, capacity, occupied, category)
              SELECT 'DISPOSAL', 200, 0, 'Disposed Assets' FROM DUAL
              WHERE NOT EXISTS (SELECT 1 FROM warehouse_zones WHERE zone = 'DISPOSAL')");
    // Item specifications captured at generation time.
    try { $d->exec("ALTER TABLE assets ADD COLUMN specs TEXT NULL"); } catch (Exception $e) {}
    // Comprehensive user activity log (TRD §7).
    $d->exec("CREATE TABLE IF NOT EXISTS activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        user_name VARCHAR(120),
        action VARCHAR(80) NOT NULL,
        entity VARCHAR(40),
        entity_ref VARCHAR(80),
        details TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_user (user_id),
        INDEX idx_activity_created (created_at)
    )");

    // Requisition purpose code (§5): checkbox-driven purpose + custom text.
    try { $d->exec("ALTER TABLE requisitions ADD COLUMN purpose VARCHAR(200) NULL"); } catch (Exception $e) {}

    // Supplier governance (§6): active flag, pre-cleared auto-PO approval,
    // tax/legal compliance, anti-bribery clearance, certifications,
    // certificate-of-insurance expiry, and contract reference.
    try { $d->exec("ALTER TABLE vendors ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active'"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN auto_approve TINYINT(1) NOT NULL DEFAULT 0"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN tax_compliant TINYINT(1) NOT NULL DEFAULT 0"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN anti_bribery_clear TINYINT(1) NOT NULL DEFAULT 0"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN certs VARCHAR(255) NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN coi_expiry DATE NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN contract_ref VARCHAR(200) NULL"); } catch (Exception $e) {}

    // Internal logistics transport requests routed to Fleet & Vehicle
    // Management (§4) — inventory submits, fleet fulfills.
    $d->exec("CREATE TABLE IF NOT EXISTS fleet_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        req_number VARCHAR(30) UNIQUE NOT NULL,
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        origin VARCHAR(120) DEFAULT 'Warehouse',
        destination VARCHAR(200) NOT NULL,
        notes TEXT,
        status VARCHAR(40) DEFAULT 'Submitted',
        requested_by INT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    // Internal delivery detail fields (§Fleet): asset link, recipient,
    // requested delivery date, priority, and special instructions.
    foreach ([
        'asset_ref VARCHAR(60) NULL',
        'recipient_name VARCHAR(120) NULL',
        'recipient_dept VARCHAR(80) NULL',
        'requested_date DATE NULL',
        "priority VARCHAR(20) NOT NULL DEFAULT 'Normal'",
        'special_instructions TEXT NULL',
    ] as $col) {
        try { $d->exec("ALTER TABLE fleet_requests ADD COLUMN $col"); } catch (Exception $e) {}
    }

    // Static asset attributes (QR/Asset Profile): manufacturer, model,
    // serial number, and warranty — fixed at registration, while zone,
    // assigned user, and status remain dynamic.
    foreach (['assets'] as $t) {
        try { $d->exec("ALTER TABLE $t ADD COLUMN manufacturer VARCHAR(120) NULL"); } catch (Exception $e) {}
        try { $d->exec("ALTER TABLE $t ADD COLUMN model VARCHAR(120) NULL"); } catch (Exception $e) {}
        try { $d->exec("ALTER TABLE $t ADD COLUMN serial_number VARCHAR(60) NULL"); } catch (Exception $e) {}
        try { $d->exec("ALTER TABLE $t ADD COLUMN warranty_expiry DATE NULL"); } catch (Exception $e) {}
    }

    // Archive audit trail (§8): who archived the record and why.
    foreach (['assets', 'purchase_orders', 'requisitions', 'vendors', 'documents'] as $t) {
        try { $d->exec("ALTER TABLE $t ADD COLUMN archived_by VARCHAR(160) NULL"); } catch (Exception $e) {}
        try { $d->exec("ALTER TABLE $t ADD COLUMN archive_reason VARCHAR(255) NULL"); } catch (Exception $e) {}
    }

    // Supplier onboarding (§Supplier Qualification): Vendor ID, verification
    // status, onboarding stage, contract expiry, and delivery lead time.
    try { $d->exec("ALTER TABLE vendors ADD COLUMN vendor_code VARCHAR(30) NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN verification_status VARCHAR(40) NOT NULL DEFAULT 'Pending'"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN onboarding_stage VARCHAR(60) NOT NULL DEFAULT 'Supplier Intake'"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN contract_expiry DATE NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE vendors ADD COLUMN lead_time_days INT NULL"); } catch (Exception $e) {}
    $d->exec("UPDATE vendors SET vendor_code = CONCAT('VND-', LPAD(id, 4, '0')) WHERE vendor_code IS NULL OR vendor_code = ''");

    // Document repository metadata (§Documents): searchable record links.
    foreach ([
        'batch_no VARCHAR(60) NULL',
        'sku VARCHAR(60) NULL',
        'asset_ref VARCHAR(60) NULL',
        'po_number VARCHAR(30) NULL',
        'sto_ref VARCHAR(40) NULL',
        'transport_ref VARCHAR(40) NULL',
        'carrier_tracking VARCHAR(80) NULL',
        'zone VARCHAR(20) NULL',
        'expiry_date DATE NULL',
        'updated_by VARCHAR(120) NULL',
    ] as $col) {
        try { $d->exec("ALTER TABLE documents ADD COLUMN $col"); } catch (Exception $e) {}
    }

    // Fixed category → zone mapping (§3): Zone A IT Equipment, B Laptops,
    // C Monitors, D Peripheral, E Office Supplies, DISPOSAL for write-offs.
    $zoneCategories = ['A' => 'IT Equipment', 'B' => 'Laptops', 'C' => 'Monitors',
                       'D' => 'Peripheral', 'E' => 'Office Supplies', 'DISPOSAL' => 'Disposed Assets'];
    foreach ($zoneCategories as $z => $cat) {
        $d->prepare("UPDATE warehouse_zones SET category = ? WHERE zone = ? AND (category IS NULL OR category = '')")
          ->execute([$cat, $z]);
    }
    $d->exec("INSERT IGNORE INTO warehouse_zones(zone, capacity, occupied, category)
              SELECT 'E', 100, 0, 'Office Supplies' FROM DUAL
              WHERE NOT EXISTS (SELECT 1 FROM warehouse_zones WHERE zone = 'E')");

    // TRD §4 schema: consumable quantity, custom low-stock threshold,
    // acquisition date, and usable lifespan (months) per asset record
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN quantity INT NOT NULL DEFAULT 1");
    } catch (Exception $e) {}
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN low_stock_threshold INT NULL");
    } catch (Exception $e) {}
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN date_purchased DATE NULL");
    } catch (Exception $e) {}
    try {
        $d->exec("ALTER TABLE assets ADD COLUMN lifespan_months INT NULL");
    } catch (Exception $e) {}
    
    try {
        $d->exec("ALTER TABLE purchase_orders ADD COLUMN budget_code VARCHAR(40)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE purchase_orders ADD COLUMN budget_status VARCHAR(40)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE purchase_orders ADD COLUMN budget_approved_by VARCHAR(120)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE purchase_orders ADD COLUMN budget_approved_date DATETIME");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE purchase_orders ADD COLUMN external_po_reference VARCHAR(100)");
    } catch (Exception $e) {
        // Column might already exist
    }
    try {
        $d->exec("ALTER TABLE purchase_orders ADD COLUMN requesting_system VARCHAR(80)");
    } catch (Exception $e) {
        // Column might already exist
    }
    
    // Insert default integration configuration
    $d->exec("INSERT IGNORE INTO integration_config (config_key, config_value, config_type, description) VALUES
        ('integration.enabled', 'true', 'boolean', 'Enable/disable all integrations'),
        ('webhook.retry.max_attempts', '3', 'integer', 'Maximum webhook retry attempts'),
        ('webhook.retry.backoff_seconds', '60', 'integer', 'Initial backoff for webhook retries'),
        ('api.rate_limit.requests_per_minute', '100', 'integer', 'Standard rate limit per minute'),
        ('api.rate_limit.burst_requests', '200', 'integer', 'Burst rate limit per minute'),
        ('equipment_request.auto_approve_threshold', '50000', 'decimal', 'Auto-approve threshold for equipment requests'),
        ('sync.batch_size', '1000', 'integer', 'Batch size for data synchronization'),
        ('export.retention_days', '30', 'integer', 'Retention period for export files')");
    
    // Create stored procedures for integration
    $d->exec("DROP PROCEDURE IF EXISTS log_equipment_request_activity");
    $d->exec("CREATE PROCEDURE log_equipment_request_activity(
        IN p_request_id INT,
        IN p_action VARCHAR(100),
        IN p_details TEXT,
        IN p_performed_by VARCHAR(120),
        IN p_performed_by_system VARCHAR(80)
    )
    BEGIN
        INSERT INTO equipment_request_activity (request_id, action, details, performed_by, performed_by_system)
        VALUES (p_request_id, p_action, p_details, p_performed_by, p_performed_by_system);
    END");
    
    $d->exec("DROP PROCEDURE IF EXISTS generate_equipment_request_number");
    $d->exec("CREATE PROCEDURE generate_equipment_request_number(OUT p_request_number VARCHAR(30))
    BEGIN
        DECLARE v_count INT;
        SELECT COUNT(*) + 1 INTO v_count 
        FROM equipment_requests 
        WHERE YEAR(created_at) = YEAR(NOW());
        
        SET p_request_number = CONCAT('SCIM-REQ-', YEAR(NOW()), '-', LPAD(v_count, 3, '0'));
    END");
    
    // Avatar support for profile pictures
    try {
        $d->exec("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL");
    } catch (Exception $e) {
        // Column might already exist
    }
    
    // Admin notification queue (password reset requests, alerts)
    $d->exec("CREATE TABLE IF NOT EXISTS admin_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(40) NOT NULL,
        title VARCHAR(200) NOT NULL,
        details TEXT,
        user_email VARCHAR(160),
        status VARCHAR(20) DEFAULT 'Pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    
    // Immutable compliance scan log (every QR scan, append-only)
    $d->exec("CREATE TABLE IF NOT EXISTS scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        asset_id INT,
        qr_code VARCHAR(50),
        action VARCHAR(60) NOT NULL,
        details TEXT,
        scanned_by VARCHAR(120),
        user_id INT,
        ip_address VARCHAR(64),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    
    // Minimum stock thresholds per category (auto-reorder triggers)
    $d->exec("CREATE TABLE IF NOT EXISTS stock_thresholds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(60) UNIQUE NOT NULL,
        min_quantity INT NOT NULL DEFAULT 3
    )");
    $d->exec("INSERT IGNORE INTO stock_thresholds(category, min_quantity) VALUES
        ('Laptop', 5), ('Monitor', 5), ('Peripheral', 8), ('Office Supplies', 10), ('IT Equipment', 5)");
    
    // Per-tab session tokens (sessionStorage-held, isolates concurrent logins)
    $d->exec("CREATE TABLE IF NOT EXISTS session_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
    )");

    // Core 3 exit-clearance tokens (outbound stream, blueprint §3.3)
    $d->exec("CREATE TABLE IF NOT EXISTS clearance_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_name VARCHAR(120) NOT NULL,
        token VARCHAR(40) UNIQUE NOT NULL,
        items_returned INT DEFAULT 0,
        status VARCHAR(40) DEFAULT 'Issued',
        issued_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    // Outbound expense settlement stream to Accounts Payable (blueprint §3.2)
    $d->exec("CREATE TABLE IF NOT EXISTS finance_settlements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_id INT,
        po_number VARCHAR(30),
        vendor_id INT,
        vendor_name VARCHAR(120),
        amount DECIMAL(12,2),
        verification_timestamp DATETIME,
        status VARCHAR(40) DEFAULT 'Forwarded',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    try { $d->exec("ALTER TABLE purchase_orders ADD COLUMN arrived_at DATETIME NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE scan_logs ADD COLUMN collision TINYINT(1) NOT NULL DEFAULT 0"); } catch (Exception $e) {}
    
    // Per-tab pending OTP tickets (replaces shared $_SESSION MFA state)
    $d->exec("CREATE TABLE IF NOT EXISTS otp_tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket VARCHAR(64) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    // Perf indexes (v2): cover the columns used in the hot WHERE/ORDER BY
    // clauses — soft-delete/archive filters, status filters, and the date
    // ranges the dashboard queries scan. CREATE INDEX throws if it exists;
    // try/catch keeps this idempotent.
    foreach ([
        'assets'             => ['idx_assets_status' => 'status', 'idx_assets_deleted' => 'deleted_at',
                                 'idx_assets_archived' => 'archived_at', 'idx_assets_category' => 'category',
                                 'idx_assets_created' => 'created_at'],
        'purchase_orders'    => ['idx_pos_status' => 'status', 'idx_pos_deleted' => 'deleted_at',
                                 'idx_pos_expected' => 'expected_delivery'],
        'asset_transactions' => ['idx_txn_created' => 'created_at', 'idx_txn_action' => 'action',
                                 'idx_txn_zone' => 'zone'],
        'scan_logs'          => ['idx_scan_asset' => 'asset_id', 'idx_scan_created' => 'created_at'],
        'documents'          => ['idx_docs_status' => 'status', 'idx_docs_deleted' => 'deleted_at'],
        'requisitions'       => ['idx_reqs_status' => 'status', 'idx_reqs_deleted' => 'deleted_at'],
        'session_tokens'     => ['idx_tokens_expires' => 'expires_at'],
        'admin_notifications'=> ['idx_notif_status' => 'status'],
        'vendors'            => ['idx_vendors_deleted' => 'deleted_at', 'idx_vendors_archived' => 'archived_at'],
        'fleet_requests'     => ['idx_fleet_status' => 'status', 'idx_fleet_created' => 'created_at'],
        'po_activity'        => ['idx_poact_created' => 'created_at'],
    ] as $table => $idx) {
        foreach ($idx as $name => $col) {
            try { $d->exec("CREATE INDEX $name ON $table($col)"); } catch (Exception $e) {}
        }
    }

    // v3: stored occupancy counters were seeded with demo numbers and never
    // updated by scans — displays now compute live from assets. Recompute the
    // stored zone counts once for consistency; rows have no real per-row
    // location data, so reset their seeded counts to zero.
    $d->exec("UPDATE warehouse_zones z SET occupied =
        (SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
          AND a.deleted_at IS NULL AND a.archived_at IS NULL)");
    $d->exec('UPDATE warehouse_rows SET occupied = 0');

    // v4: normalize free-text zone values written into assets.location
    // ("Zone B", "B-02", "b") to canonical warehouse_zones codes so occupancy
    // counts match.
    $zoneRows = $d->query('SELECT zone FROM warehouse_zones')->fetchAll(PDO::FETCH_COLUMN);
    $zoneMap = [];
    foreach ($zoneRows as $z) $zoneMap[strtoupper($z)] = $z;
    $locRows = $d->query('SELECT id, location FROM assets WHERE location IS NOT NULL AND location != \'\'')->fetchAll(PDO::FETCH_ASSOC);
    $updLoc = $d->prepare('UPDATE assets SET location = ? WHERE id = ?');
    foreach ($locRows as $r) {
        $clean = strtoupper(trim(preg_replace('/^ZONE\s+/i', '', trim($r['location']))));
        $clean = trim(preg_replace('/\s*[-–].*$/', '', $clean));
        if (isset($zoneMap[$clean]) && $zoneMap[$clean] !== $r['location']) {
            $updLoc->execute([$zoneMap[$clean], $r['id']]);
        }
    }

    // v5: row-level tracking — assets store which row inside their zone they
    // occupy so zone occupancy can break down per row.
    try { $d->exec("ALTER TABLE assets ADD COLUMN bin_row VARCHAR(10) NULL"); } catch (Exception $e) {}
    // Recover rows already embedded in pre-normalization location strings
    // ("B-02" → zone B, row 02) — only when the row actually exists.
    $locRows = $d->query("SELECT id, location FROM assets WHERE location IS NOT NULL AND location != ''")->fetchAll(PDO::FETCH_ASSOC);
    $rowQ = $d->prepare('SELECT row_num FROM warehouse_rows WHERE zone = ? AND row_num = ? LIMIT 1');
    $updRow = $d->prepare('UPDATE assets SET bin_row = ? WHERE id = ?');
    foreach ($locRows as $r) {
        if (preg_match('/([A-Za-z0-9]+)\s*[-–]\s*([A-Za-z0-9]+)$/', trim($r['location']), $rm)) {
            $rowNum = ctype_digit($rm[2]) ? (string)(int)$rm[2] : $rm[2];
            $rowQ->execute([$rm[1], $rowNum]);
            if (($hit = $rowQ->fetchColumn()) !== false) $updRow->execute([$hit, $r['id']]);
        }
    }

    // ==================== v6: transaction spine (additive) ====================
    // All v6 tables/columns are additive — nothing existing is dropped or
    // rewritten. Legacy requisitions/equipment_requests stay live alongside
    // the new supply_requests model until convergence is tested.

    // Authoritative stock ledger: every quantity/status-affecting event writes
    // a movement record so inventory math is reconstructible.
    $d->exec("CREATE TABLE IF NOT EXISTS stock_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        movement_type VARCHAR(30) NOT NULL,
        ref_type VARCHAR(30) NULL,
        ref_id INT NULL,
        ref_label VARCHAR(60) NULL,
        asset_id INT NULL,
        qr_code VARCHAR(50) NULL,
        item_name VARCHAR(200) NULL,
        qty_delta INT NOT NULL DEFAULT 0,
        from_location VARCHAR(80) NULL,
        to_location VARCHAR(80) NULL,
        from_row VARCHAR(10) NULL,
        to_row VARCHAR(10) NULL,
        actor_id INT NULL,
        actor_name VARCHAR(120) NULL,
        reason VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    try { $d->exec("CREATE INDEX idx_sm_created ON stock_movements(created_at)"); } catch (Exception $e) {}
    try { $d->exec("CREATE INDEX idx_sm_ref ON stock_movements(ref_type, ref_id)"); } catch (Exception $e) {}
    try { $d->exec("CREATE INDEX idx_sm_asset ON stock_movements(asset_id)"); } catch (Exception $e) {}

    // Goods receipt: one header per delivery event against a PO.
    $d->exec("CREATE TABLE IF NOT EXISTS goods_receipts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        gr_number VARCHAR(30) UNIQUE NOT NULL,
        po_id INT NOT NULL,
        received_by INT NULL,
        received_by_name VARCHAR(120) NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id)
    )");

    // Item-level quantities received per receipt — references the PO line.
    $d->exec("CREATE TABLE IF NOT EXISTS goods_receipt_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        receipt_id INT NOT NULL,
        po_item_id INT NULL,
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL,
        item_condition VARCHAR(40) NOT NULL DEFAULT 'Good',
        zone VARCHAR(20) NULL,
        bin_row VARCHAR(10) NULL,
        serials TEXT NULL,
        FOREIGN KEY (receipt_id) REFERENCES goods_receipts(id),
        FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id)
    )");
    try { $d->exec("CREATE INDEX idx_gri_receipt ON goods_receipt_items(receipt_id)"); } catch (Exception $e) {}

    // Item-level receiving progress on the PO contract lines.
    try { $d->exec("ALTER TABLE purchase_order_items ADD COLUMN quantity_received INT NOT NULL DEFAULT 0"); } catch (Exception $e) {}
    // Provenance: which PO/receipt created this asset.
    try { $d->exec("ALTER TABLE assets ADD COLUMN po_id INT NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE assets ADD COLUMN receipt_id INT NULL"); } catch (Exception $e) {}
    // Allow movement rows to carry actor + document reference.
    try { $d->exec("ALTER TABLE asset_transactions ADD COLUMN qty_delta INT NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE asset_transactions ADD COLUMN actor_name VARCHAR(120) NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE asset_transactions ADD COLUMN ref_label VARCHAR(60) NULL"); } catch (Exception $e) {}
    // PO ↔ originating supply request link (requests that went to procurement).
    try { $d->exec("ALTER TABLE purchase_orders ADD COLUMN supply_request_id INT NULL"); } catch (Exception $e) {}
    // Approval metadata on the legacy requisition header (kept in sync while
    // requisitions remain in use).
    try { $d->exec("ALTER TABLE requisitions ADD COLUMN approved_by VARCHAR(120) NULL"); } catch (Exception $e) {}
    try { $d->exec("ALTER TABLE requisitions ADD COLUMN approved_at DATETIME NULL"); } catch (Exception $e) {}
    // Enforce PO number uniqueness on databases created before the UNIQUE
    // clause existed (dedupe-safe: only runs when no duplicates are present).
    try {
        $dup = (int)$d->query("SELECT COUNT(*) FROM (SELECT po_number FROM purchase_orders GROUP BY po_number HAVING COUNT(*)>1) t")->fetchColumn();
        if ($dup === 0) $d->exec("ALTER TABLE purchase_orders ADD UNIQUE KEY uq_po_number (po_number)");
    } catch (Exception $e) {}

    // Internal supply requests: header + item rows. `source` marks INTERNAL
    // vs EXTERNAL:<system> so equipment_requests can converge later.
    $d->exec("CREATE TABLE IF NOT EXISTS supply_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_number VARCHAR(30) UNIQUE NOT NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'INTERNAL',
        title VARCHAR(200) NOT NULL,
        requesting_employee VARCHAR(120) NULL,
        employee_id VARCHAR(60) NULL,
        department VARCHAR(80) NULL,
        purpose VARCHAR(200) NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'Normal',
        needed_by DATE NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'Submitted',
        stock_status VARCHAR(40) NULL,
        approved_by VARCHAR(120) NULL,
        approved_at DATETIME NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    try { $d->exec("CREATE INDEX idx_sr_status ON supply_requests(status)"); } catch (Exception $e) {}

    $d->exec("CREATE TABLE IF NOT EXISTS supply_request_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        item_name VARCHAR(200) NOT NULL,
        category VARCHAR(60) NULL,
        quantity INT NOT NULL DEFAULT 1,
        quantity_issued INT NOT NULL DEFAULT 0,
        item_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
        po_id INT NULL,
        FOREIGN KEY (request_id) REFERENCES supply_requests(id)
    )");
    try { $d->exec("CREATE INDEX idx_sri_request ON supply_request_items(request_id)"); } catch (Exception $e) {}

    // Issuance: one header per warehouse-issue event against a request.
    $d->exec("CREATE TABLE IF NOT EXISTS issuances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        issuance_number VARCHAR(30) UNIQUE NOT NULL,
        request_id INT NULL,
        issued_to VARCHAR(120) NULL,
        department VARCHAR(80) NULL,
        issued_by INT NULL,
        issued_by_name VARCHAR(120) NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES supply_requests(id)
    )");

    $d->exec("CREATE TABLE IF NOT EXISTS issuance_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        issuance_id INT NOT NULL,
        request_item_id INT NULL,
        asset_id INT NULL,
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        from_zone VARCHAR(20) NULL,
        from_row VARCHAR(10) NULL,
        FOREIGN KEY (issuance_id) REFERENCES issuances(id),
        FOREIGN KEY (request_item_id) REFERENCES supply_request_items(id)
    )");
    try { $d->exec("CREATE INDEX idx_ii_issuance ON issuance_items(issuance_id)"); } catch (Exception $e) {}

    // Backfill: synthesize stock_movements history from existing
    // asset_transactions so the ledger covers past events (additive, run-once
    // — guarded by checking whether any movement already references them).
    $migCnt = (int)$d->query("SELECT COUNT(*) FROM stock_movements WHERE ref_type='asset_txn'")->fetchColumn();
    if ($migCnt === 0) {
        $d->exec("INSERT INTO stock_movements
            (movement_type, ref_type, ref_id, ref_label, asset_id, qr_code, item_name,
             qty_delta, to_location, to_row, created_at)
            SELECT
                CASE at.action
                    WHEN 'Inventory Intake' THEN 'RECEIPT'
                    WHEN 'PO Receipt' THEN 'RECEIPT'
                    WHEN 'Check-Out' THEN 'ISSUE'
                    WHEN 'Assign to Staff' THEN 'ISSUE'
                    WHEN 'Check-In' THEN 'RETURN'
                    WHEN 'Move to Zone' THEN 'TRANSFER'
                    WHEN 'Asset Transfer' THEN 'TRANSFER'
                    ELSE 'ADJUST' END,
                'asset_txn', at.id, CONCAT('txn-', at.id), at.asset_id,
                a.qr_code, a.name,
                CASE WHEN at.action IN ('Check-Out','Assign to Staff')
                     THEN -COALESCE(a.quantity,1) ELSE COALESCE(a.quantity,1) END,
                at.zone, a.bin_row, at.created_at
            FROM asset_transactions at
            LEFT JOIN assets a ON a.id = at.asset_id");
    }

    // ---- v7: department approval stage ---------------------------------
    // Requests pass through an authorized department approver before they
    // enter the supply-chain queue. Approver authorization lives in a
    // mapping table so HRIS can own it later — not in this schema.
    $d->exec("CREATE TABLE IF NOT EXISTS department_approvers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department VARCHAR(120) NOT NULL,
        user_id INT NOT NULL,
        approver_name VARCHAR(160) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dept_approver (department, user_id)
    )");
    try { $d->exec('ALTER TABLE users ADD COLUMN department VARCHAR(120) NULL'); } catch (Exception $e) {}
    try { $d->exec('ALTER TABLE supply_requests ADD COLUMN dept_approver_id INT NULL'); } catch (Exception $e) {}
    try { $d->exec('ALTER TABLE supply_requests ADD COLUMN dept_remarks TEXT NULL'); } catch (Exception $e) {}
    try { $d->exec('ALTER TABLE supply_requests ADD COLUMN submitted_at DATETIME NULL'); } catch (Exception $e) {}

    $d->prepare('INSERT INTO schema_migrations(version) VALUES(?)')->execute([SCHEMA_VERSION]);
}

// Look up an authenticated user from a per-tab bearer token
function tokenUser(PDO $d): ?array {
    $t = $_SERVER['HTTP_X_SCIM_TOKEN'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) return null;
    $q = $d->prepare("SELECT u.id, u.full_name AS name, u.email, u.role, u.avatar, u.department
                      FROM session_tokens st JOIN users u ON u.id = st.user_id
                      WHERE st.token = ? AND st.expires_at > NOW() AND u.is_active = 1");
    $q->execute([$t]);
    $u = $q->fetch(PDO::FETCH_ASSOC);
    if (!$u) return null;
    $u['id'] = (int)$u['id'];
    $u['initials'] = strtoupper(substr($u['name'], 0, 1));
    return $u;
}

function db(): PDO {
    static $d;
    if ($d) return $d;
    
    $h = getenv('DB_HOST') ?: 'localhost';
    $port = getenv('DB_PORT') ?: '3306';
    $n = getenv('DB_NAME') ?: getenv('DB_DATABASE') ?: 'hf_db_5tyoddp0';
    $u = getenv('DB_USER') ?: getenv('DB_USERNAME') ?: 'root';
    $p = getenv('DB_PASS') ?: getenv('DB_PASSWORD') ?: '';
    
    
    if (!$h || !$n || !$u) {
        reply(['error' => 'Database configuration is incomplete.'], 503);
    }
    
    try {
        $d = new PDO("mysql:host=$h;port=$port;dbname=$n;charset=utf8mb4", $u, $p, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
    } catch (PDOException) {
        reply(['error' => 'Database connection failed.'], 503);
    }
    
    migrate($d);
    return $d;
}

// ---- Blueprint helpers -----------------------------------------------------

// Compact serialized ID format: AST-<6-digit sequence> (TRD §2 — IDs are
// kept as short as possible for table layout; uniqueness is enforced by an
// atomic MAX()+1 over the numeric suffix and the qr_code UNIQUE column).
function genAssetSerial(PDO $d, string $category): string {
    $q = $d->query("SELECT MAX(CAST(SUBSTRING(qr_code, 5) AS UNSIGNED)) FROM assets WHERE qr_code LIKE 'AST-%'");
    $seq = ((int)$q->fetchColumn()) + 1;
    return sprintf('AST-%06d', $seq);
}

// Password policy (§1): 8-15 chars with upper, lower, digit, and symbol.
function passwordMeetsPolicy(string $p): bool {
    return strlen($p) >= 8 && strlen($p) <= 15
        && preg_match('/[a-z]/', $p) && preg_match('/[A-Z]/', $p)
        && preg_match('/\d/', $p) && preg_match('/[^a-zA-Z\d]/', $p);
}

// Zone inputs arrive as free text ("Zone B", "B-02", "b"). Occupancy counts
// match assets.location to warehouse_zones.zone exactly, so normalize any
// typed variant to the canonical zone code before storing it.
function normalizeZone(PDO $d, ?string $zone): ?string {
    $zone = trim((string)$zone);
    if ($zone === '') return null;
    $clean = strtoupper(trim(preg_replace('/^ZONE\s+/i', '', $zone)));
    $clean = trim(preg_replace('/\s*[-–].*$/', '', $clean));
    $q = $d->prepare('SELECT zone FROM warehouse_zones WHERE UPPER(zone) = ? LIMIT 1');
    $q->execute([$clean]);
    $hit = $q->fetchColumn();
    return $hit !== false ? $hit : $zone;
}

// Zone inputs may carry a row suffix ("B-02", "Zone B-3"). Returns
// [zone, row] with the zone normalized and the row validated against
// warehouse_rows so a typo can never fabricate a row that does not exist.
function normalizeZoneRow(PDO $d, ?string $zone, ?string $row = null): array {
    if ($row === null && $zone !== null && preg_match('/^ZONE\s+([A-Za-z0-9]+)\s*[-–]\s*([A-Za-z0-9]+)$/i', trim($zone), $m)
        || $row === null && $zone !== null && preg_match('/^([A-Za-z0-9]+)\s*[-–]\s*([A-Za-z0-9]+)$/', trim($zone), $m)) {
        $zone = $m[1];
        $row  = $m[2];
    }
    $zone = normalizeZone($d, $zone);
    $row  = trim((string)$row);
    if (ctype_digit($row)) $row = (string)(int)$row; // "02" → "2"
    if ($zone === null || $row === '') return [$zone, null];
    $q = $d->prepare('SELECT row_num FROM warehouse_rows WHERE zone = ? AND row_num = ? LIMIT 1');
    $q->execute([$zone, $row]);
    $hit = $q->fetchColumn();
    return [$zone, $hit !== false ? $hit : null];
}

// Fixed category → zone mapping (§3): assets route to their category's
// designated zone automatically on generation and intake.
function zoneForCategory(PDO $d, string $category): ?string {
    static $map = ['IT Equipment' => 'A', 'Laptop' => 'B', 'Laptops' => 'B',
                   'Monitor' => 'C', 'Monitors' => 'C', 'Peripheral' => 'D',
                   'Office Supplies' => 'E'];
    $zone = $map[$category] ?? null;
    if (!$zone) {
        $q = $d->prepare('SELECT zone FROM warehouse_zones WHERE category = ? LIMIT 1');
        $q->execute([$category]);
        $zone = $q->fetchColumn() ?: null;
    }
    return $zone;
}

// Default usable lifespan (months) per category — auto-populated on the
// serial's static attributes at generation time (§3).
function lifespanForCategory(string $category): int {
    return ['IT Equipment' => 48, 'Laptop' => 48, 'Laptops' => 48,
            'Monitor' => 60, 'Monitors' => 60, 'Peripheral' => 36,
            'Office Supplies' => 12][$category] ?? 36;
}

// Comprehensive activity log (TRD §7): every mutating user action appends
// an immutable row — actor, action, entity reference, and free-text detail.
function logActivity(PDO $d, array $u, string $action, string $entity = '', string $ref = '', string $details = ''): void {
    try {
        $d->prepare('INSERT INTO activity_log(user_id, user_name, action, entity, entity_ref, details) VALUES(?,?,?,?,?,?)')
          ->execute([$u['id'] ?? null, $u['name'] ?? ($u['full_name'] ?? 'system'), $action, $entity, $ref, $details]);
    } catch (Exception $e) { /* logging must never break the action */ }
}

// Outbound stream: forward a verified PO to Accounts Payable (Financial Mgmt)
function forwardToFinance(PDO $d, array $po): void {
    $vendorName = $po['vendor_name'] ?? $po['vendor'] ?? 'Unknown';
    // PO creation already staged a settlement receipt ('Awaiting Delivery');
    // verification upgrades it to a forwarded AP record.
    $exists = $d->prepare('SELECT id FROM finance_settlements WHERE po_id = ? LIMIT 1');
    $exists->execute([$po['id']]);
    if ($row = $exists->fetch(PDO::FETCH_ASSOC)) {
        $d->prepare("UPDATE finance_settlements SET vendor_name = ?, amount = ?, verification_timestamp = NOW(), status = 'Forwarded to AP' WHERE id = ?")
          ->execute([$vendorName, (float)$po['total'], $row['id']]);
    } else {
        $d->prepare('INSERT INTO finance_settlements(po_id, po_number, vendor_id, vendor_name, amount, verification_timestamp, status) VALUES(?,?,?,?,?,NOW(),?)')
          ->execute([$po['id'], $po['po_number'], $po['vendor_id'], $vendorName, (float)$po['total'], 'Forwarded to AP']);
    }
    $d->prepare('INSERT INTO integration_audit_log(external_system, action, entity_type, entity_id, request_data, status) VALUES(?,?,?,?,?,?)')
      ->execute(['Financial Management', 'PO Settlement Forwarded', 'purchase_order', $po['id'],
                 json_encode(['po_number' => $po['po_number'], 'vendor_id' => $po['vendor_id'], 'total_invoice_amount' => $po['total']]),
                 'Success']);
}

// Outbound stream: emit a clearance token to Core 3 when an employee's
// unreturned-asset count reaches zero (blueprint §3.3)
function issueClearanceIfComplete(PDO $d, string $employeeName, int $returnedAssetId): void {
    if ($employeeName === '') return;
    $remaining = $d->prepare("SELECT COUNT(*) FROM assets WHERE external_employee_name = ? AND status = 'Deployed'");
    $remaining->execute([$employeeName]);
    if ((int)$remaining->fetchColumn() > 0) return;

    $open = $d->prepare("SELECT id FROM clearance_tokens WHERE employee_name = ? AND status = 'Issued' AND issued_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1");
    $open->execute([$employeeName]);
    if ($open->fetch()) return; // token already issued recently

    $token = 'CLR-' . strtoupper(substr(bin2hex(random_bytes(8)), 0, 12));
    $d->prepare("INSERT INTO clearance_tokens(employee_name, token, items_returned, status, issued_at) VALUES(?,?,1,'Issued',NOW())")
      ->execute([$employeeName, $token]);
    $d->prepare("INSERT INTO admin_notifications(type, title, details) VALUES('clearance', 'Exit Clearance Issued', ?)")
      ->execute(["All assets verified returned for {$employeeName}. Clearance token {$token} dispatched to Core 3 (Exit Clearance)."]);
    $d->prepare('INSERT INTO integration_audit_log(external_system, action, entity_type, entity_id, request_data, status) VALUES(?,?,?,?,?,?)')
      ->execute(['Core 3 - Exit Clearance', 'Clearance Token Issued', 'employee', $returnedAssetId,
                 json_encode(['employee' => $employeeName, 'clearance_token' => $token]), 'Success']);
}

// Authoritative stock ledger (v6): every quantity/status-affecting event
// writes a movement row so inventory math is reconstructible end-to-end.
function logMovement(PDO $d, string $type, array $p): void {
    $d->prepare('INSERT INTO stock_movements(movement_type, ref_type, ref_id, ref_label, asset_id, qr_code, item_name, qty_delta, from_location, to_location, from_row, to_row, actor_id, actor_name, reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      ->execute([$type, $p['ref_type'] ?? null, $p['ref_id'] ?? null, $p['ref_label'] ?? null,
                 $p['asset_id'] ?? null, $p['qr_code'] ?? null, $p['item_name'] ?? null,
                 (int)($p['qty_delta'] ?? 0), $p['from_location'] ?? null, $p['to_location'] ?? null,
                 $p['from_row'] ?? null, $p['to_row'] ?? null,
                 $p['actor_id'] ?? null, $p['actor_name'] ?? null, $p['reason'] ?? null]);
}

// Enforced PO lifecycle state machine (v6). Receiving states
// (Partially/Fully Received) are set ONLY by the structured receive endpoint.
const PO_TRANSITIONS = [
    'Draft'              => ['Pending Approval', 'Cancelled'],
    'Pending Approval'   => ['Approved', 'Rejected', 'Draft'],
    'Approved'           => ['Sent to Vendor', 'Cancelled'],
    'Sent to Vendor'     => ['Shipped', 'Cancelled'],
    'Shipped'            => ['Arrived', 'Cancelled'],
    'Arrived'            => ['Cancelled'],
    'Partially Received' => ['Completed', 'Cancelled'],
    'Fully Received'     => ['Completed'],
    'Completed'          => [],
    'Rejected'           => [],
    'Cancelled'          => [],
    // Legacy statuses kept reachable for pre-v6 rows:
    'Ordered'            => ['Shipped', 'Cancelled'],
    'Received'           => ['Completed'],
    'Order Received'     => ['Completed'],
    'Fulfilled'          => ['Completed'],
];

function poAllowedTransitions(string $status): array {
    return PO_TRANSITIONS[$status] ?? [];
}


// ==========================================
// 3. ROUTER & REQUEST DISPATCHER
// ==========================================
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    reply([], 204);
}

// --- Auth Endpoints ---
if ($method === 'POST' && $path === '/api/v1/auth/login') {
    $x = body();
    $email = strtolower(trim($x['email'] ?? ''));
    $q = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $q->execute([$email]);
    $u = $q->fetch(PDO::FETCH_ASSOC);

    if (!$u || !$u['is_active'] || !password_verify($x['password'] ?? '', $u['password_hash'])) {
        audit(db(), $email, false);
        reply(['error' => 'Invalid email or password.'], 401);
    }

    // Mandatory 2FA: every login requires email OTP verification.
    // The pending OTP lives in a DB ticket keyed per-tab (not the shared
    // session cookie), so two concurrent logins in one browser stay isolated.
    $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $ticket = bin2hex(random_bytes(32));
    $d = db();
    $d->prepare('DELETE FROM otp_tickets WHERE expires_at < ?')->execute([time() - 600]);
    $d->prepare('INSERT INTO otp_tickets(ticket, user_id, otp, expires_at) VALUES(?, ?, ?, ?)')
      ->execute([$ticket, (int)$u['id'], $otp, time() + 300]);

    // Respond instantly, then send the email in the background so the
    // user reaches the OTP page without waiting for SMTP.
    $loginPayload = [
        'requires_2fa' => true,
        'message' => 'Verification code sent to your email',
        'email' => $u['email'],
        'ticket' => $ticket,
    ];
    // Dev fallback: with no authenticated SMTP configured AND served from
    // localhost, the OTP would be undeliverable — surface it so the workflow
    // can still be demonstrated. Never fires when SMTP creds exist or the
    // site is reached by a real hostname (production).
    $sc = smtpConfig();
    $localHost = in_array($_SERVER['SERVER_NAME'] ?? '', ['127.0.0.1', 'localhost', '::1'], true);
    if ($localHost && (empty($sc['user']) || empty($sc['pass']))) {
        $loginPayload['dev_otp'] = $otp;
        $loginPayload['message'] = 'Verification code (dev mode — no SMTP configured)';
    }
    $payload = json_encode($loginPayload);
    http_response_code(200);
    header('Content-Length: ' . strlen($payload));
    echo $payload;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) { ob_end_flush(); }
        flush();
    }

    try {
        if (!sendOtpEmail($u['email'], $u['full_name'], $otp)) {
            error_log("OTP email failed for {$u['email']}. Code: $otp");
        }
    } catch (Throwable $e) {
        error_log('OTP send error: ' . $e->getMessage());
    }
    exit;
}

if ($method === 'POST' && $path === '/api/v1/auth/logout') {
    $t = $_SERVER['HTTP_X_SCIM_TOKEN'] ?? '';
    if (preg_match('/^[a-f0-9]{64}$/', $t)) {
        try {
            db()->prepare('DELETE FROM session_tokens WHERE token = ?')->execute([$t]);
        } catch (Throwable) {}
    }
    $_SESSION = [];
    session_destroy();
    reply(['ok' => true]);
}

if ($method === 'GET' && $path === '/api/v1/auth/me') {
    $u = currentUser();
    if ($u && empty($u['avatar'])) {
        $q = db()->prepare('SELECT avatar, mfa_enabled, is_active FROM users WHERE id = ?');
        $q->execute([$u['id']]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $u['avatar'] = $row['avatar'];
            $u['mfa_enabled'] = (bool)$row['mfa_enabled'];
            $u['status'] = $row['is_active'] ? 'Active' : 'Inactive';
            $_SESSION['user'] = $u;
        }
    }
    reply(['user' => $u]);
}

// Profile picture upload (multipart form, field name "avatar")
if ($method === 'POST' && $path === '/api/v1/profile/avatar') {
    try {
        $u = auth();
        if (empty($_FILES['avatar']) || !isset($_FILES['avatar']['error'])) {
            reply(['error' => 'No image uploaded.'], 400);
        }
        if ($_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
            $msgs = [
                UPLOAD_ERR_INI_SIZE => 'Image exceeds the server upload limit.',
                UPLOAD_ERR_FORM_SIZE => 'Image exceeds the allowed size.',
                UPLOAD_ERR_PARTIAL => 'Upload was interrupted — please try again.',
                UPLOAD_ERR_NO_FILE => 'No image uploaded.',
            ];
            reply(['error' => $msgs[$_FILES['avatar']['error']] ?? 'Upload failed — please try again.'], 400);
        }
    if ($_FILES['avatar']['size'] > 2 * 1024 * 1024) {
        reply(['error' => 'Image must be under 2 MB.'], 400);
    }
    $info = @getimagesize($_FILES['avatar']['tmp_name']);
    if (!$info) {
        reply(['error' => 'File is not a valid image.'], 400);
    }
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'][$info['mime']] ?? null;
    if (!$ext) {
        reply(['error' => 'Only JPG, PNG, GIF or WebP images are allowed.'], 400);
    }
    $dir = __DIR__ . '/../img/avatars';
    if (!is_dir($dir)) { mkdir($dir, 0755, true); }
    $file = "u{$u['id']}.$ext";
    $dest = $dir . '/' . $file;
    // Remove previous avatar file if extension differs
    foreach (glob($dir . "/u{$u['id']}.*") as $old) { @unlink($old); }
    if (!move_uploaded_file($_FILES['avatar']['tmp_name'], $dest)) {
        reply(['error' => 'Could not save the image.'], 500);
    }
        $path = 'img/avatars/' . $file;
        db()->prepare('UPDATE users SET avatar = ? WHERE id = ?')->execute([$path, $u['id']]);
        if (isset($_SESSION['user'])) { $_SESSION['user']['avatar'] = $path; }
        reply(['ok' => true, 'avatar' => $path]);
    } catch (Throwable $e) {
        error_log('Avatar upload error: ' . $e->getMessage());
        reply(['error' => 'Upload failed — please try again.'], 500);
    }
}

// Authenticated profile update — Admin can edit own display name; standard
// users may only change accessory fields (avatar). Role/email/username are
// immutable for everyone except via the User Management admin endpoint.
if ($method === 'PUT' && $path === '/api/v1/profile') {
    $u = auth();
    if ($u['role'] !== 'Admin') {
        reply(['error' => 'Only administrators can edit profile details.'], 403);
    }
    $x = body();
    $name = trim($x['full_name'] ?? '');
    if ($name === '' || mb_strlen($name) > 120) {
        reply(['error' => 'Please provide a valid display name.'], 400);
    }
    db()->prepare('UPDATE users SET full_name = ? WHERE id = ?')->execute([$name, $u['id']]);
    if (isset($_SESSION['user'])) { $_SESSION['user']['name'] = $name; }
    reply(['ok' => true, 'name' => $name]);
}

// Public: user requests an admin-assisted credential reset
if ($method === 'POST' && $path === '/api/v1/auth/reset-request') {
    $x = body();
    $email = strtolower(trim($x['email'] ?? ''));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        reply(['error' => 'Please provide your account email.'], 400);
    }
    $d = db();
    $q = $d->prepare('SELECT id, full_name FROM users WHERE email = ?');
    $q->execute([$email]);
    $u = $q->fetch(PDO::FETCH_ASSOC);
    // Always reply OK to avoid account enumeration
    if ($u) {
        $d->prepare('INSERT INTO admin_notifications(type, title, details, user_email) VALUES(?, ?, ?, ?)')
          ->execute(['password_reset', 'Password reset requested', "User {$u['full_name']} requested a credential reset.", $email]);
        // Notify admins by email
        $admins = $d->query("SELECT email, full_name FROM users WHERE role = 'Admin' AND is_active = 1")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($admins as $adm) {
            sendSmtpMail($adm['email'], 'SCIM Password Reset Request',
                "Hello {$adm['full_name']},\n\n{$u['full_name']} ({$email}) has requested a password reset.\n\nLog in to User Management to issue a new temporary password.\n\n- Great Solomon SCIM", 'text/plain');
        }
    }
    reply(['ok' => true]);
}

// --- Dashboard Endpoints ---
if ($method === 'GET' && $path === '/api/v1/dashboard') {
    auth();
    $d = db();
    $stats = $d->query("SELECT COALESCE(SUM(value), 0) value, SUM(status='Deployed') deployed, COUNT(*) total FROM assets")->fetch(PDO::FETCH_ASSOC);
    // Occupancy is computed live — the stored column was seeded with demo
    // numbers and is never updated by scan operations.
    $zones = $d->query("SELECT z.zone, z.capacity,
            (SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
              AND a.deleted_at IS NULL AND a.archived_at IS NULL) occupied,
            ROUND((SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
              AND a.deleted_at IS NULL AND a.archived_at IS NULL) / z.capacity * 100) pct
            FROM warehouse_zones z ORDER BY z.zone")->fetchAll(PDO::FETCH_ASSOC);
    $scans = $d->query("SELECT t.action, t.created_at, a.name, a.qr_code FROM asset_transactions t JOIN assets a ON a.id=t.asset_id ORDER BY t.created_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
    reply(compact('stats', 'zones', 'scans'));
}

// TRD §2 — executive KPI metrics (inventory + supply chain / fulfillment).
// Shared between /dashboard/metrics and the consolidated /dashboard/summary.
function dashboardMetrics(PDO $d): array {
    // Inventory side
    $inv = $d->query("SELECT COALESCE(SUM(value*quantity),0) carrying_value, COALESCE(SUM(quantity),0) units_on_hand
                      FROM assets WHERE status='In Warehouse' AND deleted_at IS NULL AND archived_at IS NULL")->fetch(PDO::FETCH_ASSOC);
    $outbound90 = (int)$d->query("SELECT COUNT(*) FROM asset_transactions WHERE action LIKE 'Check-Out%' AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)")->fetchColumn();
    $inbound90  = (int)$d->query("SELECT COUNT(*) FROM asset_transactions WHERE action LIKE 'Check-In%' AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)")->fetchColumn();
    $unitsOnHand = max(1, (int)$inv['units_on_hand']);
    $turnover = round($outbound90 / $unitsOnHand, 2);
    $dsi = $outbound90 > 0 ? round($unitsOnHand / ($outbound90 / 90)) : null;
    $dead = (int)$d->query("SELECT COUNT(*) FROM assets a WHERE a.status='In Warehouse' AND a.deleted_at IS NULL AND a.archived_at IS NULL AND a.created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
                            AND NOT EXISTS (SELECT 1 FROM asset_transactions t WHERE t.asset_id=a.id AND t.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY))")->fetchColumn();
    // Category-level deficits vs thresholds — only categories that actually
    // hold tracked assets can be "low"; an empty category is not a deficit.
    $stockouts = $d->query("SELECT t.category, t.min_quantity, COALESCE(SUM(a.quantity),0) on_hand
                            FROM stock_thresholds t LEFT JOIN assets a ON a.category=t.category AND a.status='In Warehouse' AND a.deleted_at IS NULL AND a.archived_at IS NULL
                            WHERE EXISTS (SELECT 1 FROM assets x WHERE x.category = t.category AND x.deleted_at IS NULL AND x.archived_at IS NULL)
                            GROUP BY t.category, t.min_quantity")->fetchAll(PDO::FETCH_ASSOC);
    $belowThresh = 0;
    foreach ($stockouts as $s) { if ((int)$s['on_hand'] < (int)$s['min_quantity']) $belowThresh++; }
    $stockoutRate = count($stockouts) ? round($belowThresh / count($stockouts) * 100) : 0;
    // Per-asset custom threshold breaches
    $assetAlerts = (int)$d->query("SELECT COUNT(*) FROM assets WHERE status='In Warehouse' AND deleted_at IS NULL AND archived_at IS NULL AND low_stock_threshold IS NOT NULL AND quantity < low_stock_threshold")->fetchColumn();

    // Fulfillment side — PO lifecycle timing from the activity ledger
    $ful = $d->query("SELECT COUNT(*) total_received,
                      SUM(pa.created_at <= po.expected_delivery) on_time,
                      AVG(DATEDIFF(pa.created_at, po.created_at)) cycle_days
                      FROM purchase_orders po JOIN po_activity pa ON pa.po_id=po.id AND pa.action IN ('Received','Fully Received')")->fetch(PDO::FETCH_ASSOC);
    $otd = ((int)$ful['total_received']) ? round($ful['on_time'] / $ful['total_received'] * 100) : null;
    $cycle = $ful['cycle_days'] !== null ? round($ful['cycle_days'], 1) : null;
    $returnRate = $outbound90 > 0 ? round($inbound90 / $outbound90 * 100) : 0;
    $sup = $d->query("SELECT ROUND(AVG(rating),1) avg_rating, ROUND(AVG(on_time_rate)) avg_otd, ROUND(AVG(defect_rate),1) avg_defect FROM vendors")->fetch(PDO::FETCH_ASSOC);
    $logistics = (float)$d->query("SELECT COALESCE(SUM(total),0) FROM purchase_orders WHERE status IN ('Shipped','Arrived','Partially Received','Fully Received','Received','Order Received') AND deleted_at IS NULL")->fetchColumn();

    // Rolling supplier scorecard (§2): OTIF = on-time-in-full deliveries
    // (received on/before the promised date), Quality = defect-free
    // acceptance (100 - avg defect rate), SLA = share of received orders
    // completed inside the 14-day service window.
    $slaRows = $d->query("SELECT COUNT(*) total, SUM(DATEDIFF(pa.created_at, po.created_at) <= 14) within_sla
                          FROM purchase_orders po JOIN po_activity pa ON pa.po_id=po.id AND pa.action IN ('Received','Fully Received')")->fetch(PDO::FETCH_ASSOC);
    $scorecard = [
        'otif'    => $otd,
        'quality' => $sup['avg_defect'] !== null ? round(100 - (float)$sup['avg_defect'], 1) : null,
        'sla'     => ((int)($slaRows['total'] ?? 0)) ? round($slaRows['within_sla'] / $slaRows['total'] * 100) : null,
    ];

    // Zone activity line series (§2): scans/movements per zone over 14 days.
    $zoneSeries = $d->query("SELECT zone, DATE(created_at) d, COUNT(*) n
            FROM asset_transactions WHERE zone IS NOT NULL AND zone != ''
              AND created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
            GROUP BY zone, DATE(created_at) ORDER BY d")->fetchAll(PDO::FETCH_ASSOC);

    // Chart series for the dashboard overhaul (TRD §1)
    $moveSeries = $d->query("SELECT DATE(created_at) d,
            SUM(action LIKE 'Check-Out%' OR action LIKE 'Assign%') outbound,
            SUM(action LIKE 'Check-In%' OR action = 'Inventory Intake') inbound
            FROM asset_transactions WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
            GROUP BY DATE(created_at) ORDER BY d")->fetchAll(PDO::FETCH_ASSOC);
    $statusDist = $d->query("SELECT status, COUNT(*) n FROM assets WHERE deleted_at IS NULL AND archived_at IS NULL AND status <> 'Awaiting Print' GROUP BY status")->fetchAll(PDO::FETCH_ASSOC);
    $poByStatus = $d->query("SELECT status, COUNT(*) n FROM purchase_orders WHERE deleted_at IS NULL GROUP BY status")->fetchAll(PDO::FETCH_ASSOC);
    $upcoming = $d->query("SELECT po_number, vendor, expected_delivery FROM purchase_orders WHERE deleted_at IS NULL AND expected_delivery IS NOT NULL AND expected_delivery >= DATE_SUB(CURDATE(), INTERVAL 60 DAY) AND expected_delivery <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)")->fetchAll(PDO::FETCH_ASSOC);

    return ['metrics' => [
        'carrying_value'   => (float)$inv['carrying_value'],
        'units_on_hand'    => (int)$inv['units_on_hand'],
        'turnover_90d'     => $turnover,
        'dsi_days'         => $dsi,
        'stockout_rate'    => $stockoutRate,
        'deficit_categories' => $belowThresh,
        'asset_threshold_alerts' => $assetAlerts,
        'dead_stock'       => $dead,
        'on_time_delivery' => $otd,
        'cycle_days'       => $cycle,
        'return_rate'      => $returnRate,
        'supplier_rating'  => $sup['avg_rating'] !== null ? (float)$sup['avg_rating'] : null,
        'supplier_otd'     => $sup['avg_otd'] !== null ? (int)$sup['avg_otd'] : null,
        'supplier_defect'  => $sup['avg_defect'] !== null ? (float)$sup['avg_defect'] : null,
        'logistics_value'  => $logistics,
    ], 'scorecard' => $scorecard, 'series' => [
        'movement_14d' => $moveSeries,
        'status_dist'  => $statusDist,
        'po_status'    => $poByStatus,
        'calendar'     => $upcoming,
        'zone_activity'=> $zoneSeries,
    ]];
}

if ($method === 'GET' && $path === '/api/v1/dashboard/metrics') {
    auth();
    reply(dashboardMetrics(db()));
}

// Consolidated dashboard payload (Perf): one request returns everything the
// dashboard renders — stats, zones, recent scans, PO/doc counts + recent POs,
// sync streams, stock alerts, and the KPI block. The CSV export fetches full
// lists lazily instead of loading them on every poll.
if ($method === 'GET' && $path === '/api/v1/dashboard/summary') {
    auth();
    $d = db();
    $stats = $d->query("SELECT COALESCE(SUM(value), 0) value, SUM(status='Deployed') deployed, COUNT(*) total FROM assets")->fetch(PDO::FETCH_ASSOC);
    $zones = $d->query("SELECT z.zone, z.capacity,
            (SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
              AND a.deleted_at IS NULL AND a.archived_at IS NULL) occupied,
            ROUND((SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
              AND a.deleted_at IS NULL AND a.archived_at IS NULL) / z.capacity * 100) pct
            FROM warehouse_zones z ORDER BY z.zone")->fetchAll(PDO::FETCH_ASSOC);
    $scans = $d->query("SELECT t.action, t.created_at, a.name, a.qr_code FROM asset_transactions t JOIN assets a ON a.id=t.asset_id ORDER BY t.created_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
    $pos = $d->query('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id=v.id WHERE po.deleted_at IS NULL AND po.archived_at IS NULL ORDER BY po.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    $docAlerts = (int)$d->query("SELECT COUNT(*) FROM documents WHERE status <> 'Verified' AND deleted_at IS NULL AND archived_at IS NULL")->fetchColumn();

    // Sync streams (same read model as /sync-status)
    $row = fn($sql) => $d->query($sql)->fetch(PDO::FETCH_ASSOC);
    $c2 = $row("SELECT COUNT(*) total, SUM(status='Pending') pending, MAX(created_at) last FROM equipment_requests");
    $c3 = $row('SELECT COUNT(*) total, MAX(issued_at) last FROM clearance_tokens');
    $fin = $row('SELECT COUNT(*) total, MAX(created_at) last FROM finance_settlements');
    $audit = $row('SELECT COUNT(*) total, MAX(created_at) last FROM integration_audit_log');
    $scanCt = $row('SELECT COUNT(*) total, MAX(created_at) last FROM scan_logs');
    $streams = [
        ['system' => 'Core 2 — Employee Info (HRIS)', 'direction' => 'Inbound', 'total' => (int)$c2['total'], 'pending' => (int)$c2['pending'], 'last_activity' => $c2['last']],
        ['system' => 'Core 3 — Exit Clearance', 'direction' => 'Outbound', 'total' => (int)$c3['total'], 'pending' => 0, 'last_activity' => $c3['last']],
        ['system' => 'Financial Mgmt — Accounts Payable', 'direction' => 'Outbound', 'total' => (int)$fin['total'], 'pending' => 0, 'last_activity' => $fin['last']],
        ['system' => 'BI / Data Aggregation', 'direction' => 'Outbound', 'total' => (int)$audit['total'], 'pending' => 0, 'last_activity' => $audit['last']],
        ['system' => 'QR Scan Engine', 'direction' => 'Internal', 'total' => (int)$scanCt['total'], 'pending' => 0, 'last_activity' => $scanCt['last']],
    ];

    // Stock alerts — same queries as /stock-alerts
    $alerts = $d->query("SELECT t.category, t.min_quantity,
            (SELECT COUNT(*) FROM assets a WHERE a.category = t.category AND a.status = 'In Warehouse' AND a.deleted_at IS NULL AND a.archived_at IS NULL) AS on_hand
            FROM stock_thresholds t
            WHERE EXISTS (SELECT 1 FROM assets x WHERE x.category = t.category AND x.deleted_at IS NULL AND x.archived_at IS NULL)
            ORDER BY on_hand / t.min_quantity")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($alerts as &$al) {
        $al['on_hand'] = (int)$al['on_hand'];
        $al['min_quantity'] = (int)$al['min_quantity'];
        $al['deficit'] = $al['on_hand'] < $al['min_quantity'];
    }
    unset($al);
    $assetAlerts = $d->query("SELECT name, category,
            SUM(quantity) AS on_hand, MAX(low_stock_threshold) AS min_quantity,
            COUNT(*) AS serials
            FROM assets
            WHERE deleted_at IS NULL AND archived_at IS NULL AND status = 'In Warehouse'
              AND low_stock_threshold IS NOT NULL
            GROUP BY name, category
            HAVING SUM(quantity) < MAX(low_stock_threshold)
            ORDER BY SUM(quantity) / MAX(low_stock_threshold)")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($assetAlerts as &$aa) {
        $aa['on_hand'] = (int)$aa['on_hand'];
        $aa['min_quantity'] = (int)$aa['min_quantity'];
        $aa['serials'] = (int)$aa['serials'];
        $aa['deficit'] = true;
    }
    unset($aa);

    $kpi = dashboardMetrics($d);
    reply(['stats' => $stats, 'zones' => $zones, 'scans' => $scans, 'pos' => $pos,
           'doc_alerts' => $docAlerts, 'streams' => $streams,
           'stock' => ['items' => $alerts, 'asset_items' => $assetAlerts],
           'metrics' => $kpi['metrics'], 'scorecard' => $kpi['scorecard'], 'series' => $kpi['series']]);
}

// --- Assets Endpoints ---
if ($method === 'GET' && $path === '/api/v1/assets') {
    auth();
    reply(db()->query('SELECT * FROM assets WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY name')->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST' && $path === '/api/v1/assets') {
    auth(['Admin', 'WarehouseStaff']);
    $x = body();
    // Location may embed a row ("B-02"); a separate `row` field also works.
    [$loc, $binRow] = normalizeZoneRow(db(), $x['location'] ?? null, $x['row'] ?? null);
    $q = db()->prepare('INSERT INTO assets(qr_code, name, category, value, status, location, bin_row, quantity, low_stock_threshold, date_purchased, lifespan_months, specs, manufacturer, model, serial_number, warranty_expiry) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $q->execute([$x['qr_code'], $x['name'], $x['category'], $x['value'], $x['status'] ?? 'In Warehouse', $loc, $binRow,
        (int)($x['quantity'] ?? 1) ?: 1, ($x['low_stock_threshold'] ?? null) !== '' && ($x['low_stock_threshold'] ?? null) !== null ? (int)$x['low_stock_threshold'] : null,
        ($x['date_purchased'] ?? null) ?: null, ($x['lifespan_months'] ?? null) !== '' && ($x['lifespan_months'] ?? null) !== null ? (int)$x['lifespan_months'] : null,
        $x['specs'] ?? null, $x['manufacturer'] ?? null, $x['model'] ?? null, $x['serial_number'] ?? null, ($x['warranty_expiry'] ?? null) ?: null]);
    reply(['id' => db()->lastInsertId()], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/assets/([^/]+)$#', $path, $m)) {
    auth();
    $q = db()->prepare('SELECT * FROM assets WHERE qr_code = ?');
    $q->execute([$m[1]]);
    $a = $q->fetch(PDO::FETCH_ASSOC);
    reply($a ?: ['error' => 'Asset not found'], $a ? 200 : 404);
}

if ($method === 'PUT' && preg_match('#^/api/v1/assets/([^/]+)$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();

    $updateFields = [];
    $params = [];

    foreach (['name', 'category', 'status', 'location'] as $field) {
        if (array_key_exists($field, $x)) {
            $updateFields[] = $field . ' = ?';
            if ($field === 'location') {
                [$loc, $binRow] = normalizeZoneRow($d, $x[$field], $x['row'] ?? null);
                $params[] = $loc;
                $updateFields[] = 'bin_row = ?';
                $params[] = $binRow;
            } else {
                $params[] = $x[$field];
            }
        }
    }

    if (array_key_exists('value', $x)) {
        $updateFields[] = 'value = ?';
        $params[] = $x['value'];
    }

    if (empty($updateFields)) {
        reply(['error' => 'No fields to update'], 400);
    }

    $params[] = $m[1];
    $q = $d->prepare('UPDATE assets SET ' . implode(', ', $updateFields) . ' WHERE qr_code = ?');
    $q->execute($params);

    reply(['ok' => true]);
}

// Asset removal — Admin only. Per the architecture map this crosses into
// DTRS/Legal & Compliance, so every removal pushes a structured entry into
// the immutable audit queue before the record is destroyed.
if ($method === 'DELETE' && preg_match('#^/api/v1/assets/([^/]+)$#', $path, $m)) {
    $u = auth(['Admin']);
    $d = db();
    $q = $d->prepare('SELECT * FROM assets WHERE qr_code = ?');
    $q->execute([$m[1]]);
    $a = $q->fetch(PDO::FETCH_ASSOC);
    if (!$a) {
        reply(['error' => 'Asset not found.'], 404);
    }
    $d->prepare('INSERT INTO scan_logs(asset_id, qr_code, action, details, scanned_by, user_id, ip_address) VALUES(?,?,?,?,?,?,?)')
      ->execute([
          $a['id'], $a['qr_code'], 'Asset Deleted',
          sprintf('Asset "%s" (category: %s, value: %.2f, location: %s) removed from inventory%s',
              $a['name'], $a['category'], (float)$a['value'], $a['location'],
              ((float)$a['value'] >= 50000) ? ' — HIGH-VALUE FLAG for compliance review' : ''),
          $u['name'], $u['id'], $_SERVER['REMOTE_ADDR'] ?? null
      ]);
    // TRD §7: deletion is now a soft-delete into the Admin retention bin —
    // the record stays restorable for 30 days, then purges automatically.
    $d->prepare('UPDATE assets SET deleted_at = NOW() WHERE id = ?')->execute([$a['id']]);
    logActivity($d, $u, 'Moved asset to deletion bin', 'asset', $a['qr_code'], $a['name']);
    reply(['ok' => true, 'binned' => true]);
}

// Pending-row deletion (TRD §3): uncommitted Awaiting-Print serials may be
// removed outright by warehouse staff — they were never active stock.
if ($method === 'DELETE' && preg_match('#^/api/v1/inventory/pending/([^/]+)$#', $path, $m)) {
    $u = auth(['Admin', 'WarehouseStaff']);
    $d = db();
    $q = $d->prepare("SELECT id, name FROM assets WHERE qr_code = ? AND status = 'Awaiting Print'");
    $q->execute([$m[1]]);
    $a = $q->fetch(PDO::FETCH_ASSOC);
    if (!$a) reply(['error' => 'Pending serial not found.'], 404);
    $d->prepare('DELETE FROM assets WHERE id = ?')->execute([$a['id']]);
    logActivity($d, $u, 'Discarded pending serial', 'asset', $m[1], $a['name']);
    reply(['ok' => true]);
}

if ($method === 'POST' && $path === '/api/v1/assets/scan') {
    $u = auth(['Admin', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $qr = trim($x['qr_code'] ?? '');
    $action = $x['action'] ?? 'Inventory Intake';
    // Zone input may embed a row ("B-02") or arrive as a separate field.
    [$zone, $binRow] = normalizeZoneRow($d, $x['zone'] ?? null, $x['row'] ?? null);
    $autoCreated = false;

    // §3: a returned asset requires a reason — selected via checkbox plus an
    // optional free-text explanation from the scanning operator.
    if ($action === 'Check-In' && trim((string)($x['reason'] ?? '')) === '') {
        reply(['error' => 'A return reason is required — pick a reason (and describe it if Other) before checking the asset back in.'], 400);
    }

    // ---- External boundary: Purchase Order Mgmt -------------------------
    // Inbound intake against a PO contract requires the PO to exist and be
    // in a receivable state (sent to vendor / shipped) before stock injects.
    $poVerified = null;
    if ($action === 'PO Receipt') {
        $poNo = trim($x['po_number'] ?? '');
        if ($poNo === '') {
            reply(['error' => 'PO Receipt requires the purchase order number from the contract.'], 400);
        }
        $pq = $d->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.po_number = ? LIMIT 1');
        $pq->execute([$poNo]);
        $poVerified = $pq->fetch(PDO::FETCH_ASSOC);
        if (!$poVerified) {
            reply(['error' => "Purchase order {$poNo} not found in PO Management."], 404);
        }
        if (!in_array($poVerified['status'], ['Sent to Vendor', 'Shipped', 'Arrived', 'Partially Received', 'Received'], true)) {
            reply(['error' => "PO {$poNo} is '{$poVerified['status']}' — only orders sent to vendor or in transit can be received."], 409);
        }
    }

    // ---- External boundary: Core 2 Employee Info ------------------------
    // Assigning an asset requires the assignee to exist in the personnel
    // directory (validated against the user registry).
    if ($action === 'Assign to Staff') {
        $assignee = trim($x['assignee'] ?? '');
        if ($assignee === '') {
            reply(['error' => 'Assign to Staff requires the employee name.'], 400);
        }
        $eq = $d->prepare('SELECT id, full_name FROM users WHERE (full_name LIKE ? OR email LIKE ?) AND is_active = 1 LIMIT 1');
        $eq->execute(["%$assignee%", "%$assignee%"]);
        $emp = $eq->fetch(PDO::FETCH_ASSOC);
        if (!$emp) {
            reply(['error' => "'$assignee' was not found in Employee Info — the asset cannot leave the warehouse grid."], 422);
        }
        $x['assignee'] = $emp['full_name'];
    }

    $q = $d->prepare('SELECT * FROM assets WHERE qr_code = ?');
    $q->execute([$qr]);
    $a = $q->fetch(PDO::FETCH_ASSOC);

    if (!$a) {
        // Inbound automation: scan-to-intake auto-registers unknown items.
        // PO Receipt also auto-registers, seeded with the verified contract data.
        if (in_array($action, ['Inventory Intake', 'PO Receipt'], true) && $qr !== '') {
            $name = trim($x['name'] ?? '') ?: ($poVerified ? ('PO ' . $poVerified['po_number'] . ' — ' . $poVerified['vendor_name'] ?: 'Vendor') : 'New Asset ' . $qr);
            $category = trim($x['category'] ?? '') ?: 'IT Equipment';
            $loc = $zone ?: 'Receiving Dock';
            $d->prepare('INSERT INTO assets(qr_code, name, category, value, status, location, bin_row, po_id) VALUES(?,?,?,?,?,?,?,?)')
              ->execute([$qr, $name, $category, (float)($poVerified['total'] ?? $x['value'] ?? 0), 'In Warehouse', $loc, $binRow, $poVerified['id'] ?? null]);
            $a = ['id' => (int)$d->lastInsertId(), 'name' => $name, 'qr_code' => $qr, 'status' => 'In Warehouse', 'category' => $category];
            $autoCreated = true;
        } else {
            reply(['error' => 'Unknown QR code.', 'unknown' => true], 404);
        }
    }

    // ---- Duplicate & collision detection (blueprint §6.1) -------------------
    // A serial scanned into a state it already occupies, or the identical
    // action repeated sequentially, is flagged as a tracking collision and
    // prevented from writing duplicate ledger entries.
    if (!$autoCreated) {
        $collision = null;
        if (in_array($action, ['Check-Out', 'Contractor Check-Out'], true)) {
            if ($a['status'] === 'Deployed') {
                $collision = "Asset is already deployed — duplicate check-out blocked.";
            } elseif ($a['status'] === 'Inbound/Receiving') {
                $collision = "Asset is still at the receiving dock — scan it into stock first.";
            }
        } elseif ($action === 'Check-In' && $a['status'] !== 'Deployed') {
            $collision = "Asset is not currently deployed — duplicate check-in blocked.";
        } elseif (!in_array($action, ['Move to Zone', 'Asset Transfer', 'Assign to Staff'], true)) {
            // Repeatable actions are excluded; identical sequential scans of the
            // same serial flag a tracking collision.
            $lq = $d->prepare('SELECT action FROM scan_logs WHERE asset_id = ? AND collision = 0 ORDER BY created_at DESC LIMIT 1');
            $lq->execute([$a['id']]);
            if ($lq->fetchColumn() === $action) {
                $collision = "Duplicate scan: the previous entry for this serial was also '$action'.";
            }
        }
        if ($collision) {
            $d->prepare('INSERT INTO scan_logs(asset_id, qr_code, action, details, scanned_by, user_id, ip_address, collision) VALUES(?,?,?,?,?,?,?,1)')
              ->execute([$a['id'], $qr, $action, 'COLLISION — ' . $collision, $u['name'], $u['id'], $_SERVER['REMOTE_ADDR'] ?? null]);
            reply(['error' => $collision, 'collision' => true, 'asset' => $a], 409);
        }
    }

    // §3 category → zone mapping: when no explicit zone is given, intake and
    // check-in route the asset to its category's designated zone.
    if (!$zone && in_array($action, ['Inventory Intake', 'Check-In'], true)) {
        $zone = zoneForCategory($d, $a['category'] ?? '');
    }

    // Apply the physical-state change implied by the scan action
    $updates = [];
    $params = [];
    $details = $action;
    $checkInAssignee = '';
    switch ($action) {
        case 'Inventory Intake':
            // Placeholders staged by the delivery simulator mutate into stock.
            $updates = ['status = ?']; $params[] = 'In Warehouse';
            if ($zone) { $updates[] = 'location = ?'; $params[] = $zone; }
            if ($binRow) { $updates[] = 'bin_row = ?'; $params[] = $binRow; }
            break;
        case 'Check-Out':
        case 'Contractor Check-Out':
            $updates = ['status = ?']; $params[] = 'Deployed';
            break;
        case 'Check-In':
            $checkInAssignee = $a['external_employee_name'] ?? '';
            $updates = ['status = ?', 'external_employee_name = NULL']; $params[] = 'In Warehouse';
            if ($zone) { $updates[] = 'location = ?'; $params[] = $zone; }
            if ($binRow) { $updates[] = 'bin_row = ?'; $params[] = $binRow; }
            $details .= ' — return reason: ' . trim($x['reason']);
            break;
        case 'Assign to Staff':
            $updates = ['status = ?', 'external_employee_name = ?', 'assignment_date = CURDATE()'];
            $params[] = 'Deployed';
            $params[] = trim($x['assignee'] ?? 'Staff');
            $details .= ' — ' . trim($x['assignee'] ?? 'Staff');
            break;
        case 'Move to Zone':
        case 'Asset Transfer':
            if ($zone) {
                $updates = ['location = ?', 'bin_row = ?'];
                $params[] = $zone;
                $params[] = $binRow;
                $details .= ' — ' . $zone . ($binRow ? ' row ' . $binRow : '');
            }
            break;
        case 'Report Damage':
            $updates = ['status = ?'];
            $params[] = 'Damaged';
            // Damaged units route to DISPOSAL holding unless a zone was given.
            $dmgZone = $zone ?: 'DISPOSAL';
            $updates[] = 'location = ?'; $params[] = $dmgZone; $zone = $dmgZone;
            $updates[] = 'bin_row = NULL';
            $details .= ' — ' . trim($x['reason'] ?? 'damaged stock routed to DISPOSAL');
            break;
        case 'PO Receipt':
            $updates = ['status = ?', 'po_id = ?'];
            $params[] = 'In Warehouse';
            $params[] = $poVerified['id'];
            $details .= ' — verified against ' . $poVerified['po_number'];
            // Reflect scan-level receipts on the contract. POs with line
            // items move to Partially/Fully based on received serial counts;
            // legacy free-text POs complete on first scan.
            if (!in_array($poVerified['status'], ['Fully Received', 'Received'], true)) {
                $lineQ = $d->prepare('SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(quantity_received),0) FROM purchase_order_items WHERE po_id = ?');
                $lineQ->execute([$poVerified['id']]);
                [$lnOrd, $lnRec] = array_map('intval', $lineQ->fetch(PDO::FETCH_NUM));
                $sc = $d->prepare("SELECT COUNT(*) FROM assets WHERE po_id = ? AND status = 'In Warehouse'");
                $sc->execute([$poVerified['id']]);
                $scanCount = (int)$sc->fetchColumn() + 1; // +1 for this scan
                $newPoStatus = 'Fully Received';
                if ($lnOrd > 0) $newPoStatus = ($scanCount >= $lnOrd) ? 'Fully Received' : 'Partially Received';
                $d->prepare("UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?")->execute([$newPoStatus, $poVerified['id']]);
                $d->prepare("INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)")
                  ->execute([$poVerified['id'], $newPoStatus, 'Serial ' . $qr . ' verified via QR scan by ' . $u['name']]);
                if ($newPoStatus === 'Fully Received') forwardToFinance($d, $poVerified);
            }
            break;
    }
    if ($updates && !$autoCreated) {
        $params[] = $qr;
        $d->prepare('UPDATE assets SET ' . implode(', ', $updates) . ' WHERE qr_code = ?')->execute($params);
    }

    // Outbound stream → Core 3: a check-in that zeroes an employee's deployed
    // asset count issues their exit-clearance token.
    $clearance = null;
    if ($checkInAssignee !== '') {
        issueClearanceIfComplete($d, $checkInAssignee, (int)$a['id']);
        $cq = $d->prepare("SELECT token FROM clearance_tokens WHERE employee_name = ? ORDER BY id DESC LIMIT 1");
        $cq->execute([$checkInAssignee]);
        $clearance = $cq->fetchColumn() ?: null;
    }

    // Transaction + immutable compliance log + authoritative stock movement
    $txQty = in_array($action, ['Check-Out', 'Contractor Check-Out', 'Assign to Staff', 'Report Damage'], true)
        ? -max(1, (int)($a['quantity'] ?? 1))
        : (in_array($action, ['Move to Zone', 'Asset Transfer'], true) ? 0 : max(1, (int)($a['quantity'] ?? 1)));
    $d->prepare('INSERT INTO asset_transactions(asset_id, action, zone, qty_delta, actor_name, ref_label, created_at) VALUES(?, ?, ?, ?, ?, ?, NOW())')
      ->execute([$a['id'], $action, $zone, $txQty, $u['name'], $poVerified['po_number'] ?? null]);
    $d->prepare('INSERT INTO scan_logs(asset_id, qr_code, action, details, scanned_by, user_id, ip_address) VALUES(?,?,?,?,?,?,?)')
      ->execute([$a['id'], $qr, $action, $details, $u['name'], $u['id'], $_SERVER['REMOTE_ADDR'] ?? null]);
    logActivity($d, $u, 'Scanned asset', 'asset', $qr, $action);

    // Map each scan action to its stock-movement semantics.
    $mvQty = max(1, (int)($a['quantity'] ?? 1));
    switch ($action) {
        case 'Inventory Intake':
            logMovement($d, 'RECEIPT', ['asset_id' => $a['id'], 'qr_code' => $qr, 'item_name' => $a['name'] ?? null,
                'qty_delta' => $mvQty, 'to_location' => $zone, 'to_row' => $binRow,
                'actor_id' => $u['id'], 'actor_name' => $u['name'], 'reason' => 'Inventory intake scan']);
            break;
        case 'PO Receipt':
            logMovement($d, 'RECEIPT', ['ref_type' => 'purchase_order', 'ref_id' => $poVerified['id'], 'ref_label' => $poVerified['po_number'],
                'asset_id' => $a['id'], 'qr_code' => $qr, 'item_name' => $a['name'] ?? null,
                'qty_delta' => $mvQty, 'to_location' => $zone ?: ($a['location'] ?? null), 'to_row' => $binRow,
                'actor_id' => $u['id'], 'actor_name' => $u['name'], 'reason' => 'QR scan receipt against ' . $poVerified['po_number']]);
            break;
        case 'Check-Out':
        case 'Contractor Check-Out':
        case 'Assign to Staff':
            logMovement($d, 'ISSUE', ['asset_id' => $a['id'], 'qr_code' => $qr, 'item_name' => $a['name'] ?? null,
                'qty_delta' => -$mvQty, 'from_location' => $a['location'] ?? null, 'from_row' => $a['bin_row'] ?? null,
                'actor_id' => $u['id'], 'actor_name' => $u['name'],
                'reason' => trim($x['assignee'] ?? '') !== '' ? 'Issued to ' . trim($x['assignee']) : $action]);
            break;
        case 'Check-In':
            logMovement($d, 'RETURN', ['asset_id' => $a['id'], 'qr_code' => $qr, 'item_name' => $a['name'] ?? null,
                'qty_delta' => $mvQty, 'to_location' => $zone ?: ($a['location'] ?? null), 'to_row' => $binRow,
                'actor_id' => $u['id'], 'actor_name' => $u['name'], 'reason' => trim($x['reason'] ?? 'Return')]);
            break;
        case 'Move to Zone':
        case 'Asset Transfer':
            // Transfers relocate stock, not change it — zero quantity delta.
            logMovement($d, 'TRANSFER', ['asset_id' => $a['id'], 'qr_code' => $qr, 'item_name' => $a['name'] ?? null,
                'qty_delta' => 0, 'from_location' => $a['location'] ?? null, 'from_row' => $a['bin_row'] ?? null,
                'to_location' => $zone, 'to_row' => $binRow,
                'actor_id' => $u['id'], 'actor_name' => $u['name'], 'reason' => $action]);
            break;
        case 'Report Damage':
            logMovement($d, 'DAMAGE', ['asset_id' => $a['id'], 'qr_code' => $qr, 'item_name' => $a['name'] ?? null,
                'qty_delta' => -$mvQty, 'from_location' => $a['location'] ?? null, 'from_row' => $a['bin_row'] ?? null,
                'to_location' => $zone, 'actor_id' => $u['id'], 'actor_name' => $u['name'],
                'reason' => trim($x['reason'] ?? 'Damaged in warehouse handling')]);
            break;
    }

    // Automated procurement loop: check-out drains stock -> auto requisition
    $requisitionFired = null;
    if (in_array($action, ['Check-Out', 'Contractor Check-Out'], true) && !$autoCreated) {
        $cat = $a['category'] ?? 'IT Equipment';
        $tq = $d->prepare('SELECT min_quantity FROM stock_thresholds WHERE category = ?');
        $tq->execute([$cat]);
        $min = (int)($tq->fetchColumn() ?: 3);
        $stock = (int)$d->query("SELECT COUNT(*) FROM assets WHERE category = " . $d->quote($cat) . " AND status = 'In Warehouse'")->fetchColumn();
        if ($stock < $min) {
            $open = $d->prepare("SELECT id FROM requisitions WHERE title LIKE ? AND status NOT IN ('Closed','Rejected','Cancelled') LIMIT 1");
            $open->execute(["Auto-reorder: $cat%"]);
            if (!$open->fetch()) {
                $rq = 'REQ-' . date('Y') . '-' . str_pad((string)($d->query('SELECT COUNT(*)+1 FROM requisitions')->fetchColumn()), 3, '0', STR_PAD_LEFT);
                $d->prepare("INSERT INTO requisitions(req_number, title, department, description, priority, status, created_by) VALUES(?,?,?,?,?,?,?)")
                  ->execute([$rq, "Auto-reorder: $cat", 'Warehouse', "Stock of '$cat' dropped to $stock units (minimum $min) after check-out scan of $qr.", 'High', 'Submitted', $u['id']]);
                $requisitionFired = $rq;
            }
        }
    }

    reply(['ok' => true, 'asset' => $a, 'action' => $action, 'auto_created' => $autoCreated, 'auto_requisition' => $requisitionFired, 'po_verified' => $poVerified ? $poVerified['po_number'] : null, 'clearance_token' => $clearance]);
}

// Compliance feed: the immutable scan log
if ($method === 'GET' && $path === '/api/v1/scan-logs') {
    auth();
    $d = db();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per = min(100, max(5, (int)($_GET['per_page'] ?? 20)));
    $total = (int)$d->query('SELECT COUNT(*) FROM scan_logs')->fetchColumn();
    $q = $d->prepare('SELECT * FROM scan_logs ORDER BY created_at DESC LIMIT ? OFFSET ?');
    $q->bindValue(1, $per, PDO::PARAM_INT);
    $q->bindValue(2, ($page - 1) * $per, PDO::PARAM_INT);
    $q->execute();
    reply(['items' => $q->fetchAll(PDO::FETCH_ASSOC), 'total' => $total, 'page' => $page, 'pages' => max(1, (int)ceil($total / $per))]);
}

// --- Purchase Orders (Pending) Endpoints ---
if ($method === 'GET' && $path === '/api/v1/pos/pending') {
    auth();
    reply(db()->query('SELECT * FROM purchase_orders WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY updated_at DESC')->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'PUT' && preg_match('#^/api/v1/pos/(\d+)/status$#', $path, $m)) {
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $newStatus = $x['status'] ?? 'Draft';

    // Enforced state machine (v6): status changes must follow the transition
    // graph — no arbitrary strings, no skipping approval, no manual receiving.
    $cq = $d->prepare('SELECT status FROM purchase_orders WHERE id = ? AND deleted_at IS NULL');
    $cq->execute([$m[1]]);
    $cur = $cq->fetchColumn();
    if ($cur === false) reply(['error' => 'Purchase order not found.'], 404);

    $allKnown = array_keys(PO_TRANSITIONS);
    if (!in_array($newStatus, $allKnown, true)) {
        reply(['error' => "Unknown status '{$newStatus}'. Valid statuses: " . implode(', ', $allKnown)], 400);
    }
    if (in_array($newStatus, ['Partially Received', 'Fully Received', 'Received'], true)) {
        reply(['error' => 'Receiving states are set by the goods-receipt endpoint (POST /pos/{id}/receive) — receiving is a structured transaction, not a status flip.'], 422);
    }
    $allowed = poAllowedTransitions($cur);
    if (!in_array($newStatus, $allowed, true)) {
        reply(['error' => "Cannot move PO from '{$cur}' to '{$newStatus}'. Allowed: " . ($allowed ? implode(', ', $allowed) : 'none — terminal state')], 409);
    }

    // TRD §1: approve/reject authority over sourcing workflows is Admin-exclusive.
    if (in_array($newStatus, ['Approved', 'Rejected'], true) && $u['role'] !== 'Admin') {
        reply(['error' => 'Only a System Administrator may approve or reject purchase orders.'], 403);
    }
    // Warehouse Staff may only advance inbound logistics states.
    if ($u['role'] === 'WarehouseStaff' && !in_array($newStatus, ['Shipped', 'Arrived'], true)) {
        reply(['error' => 'Warehouse Staff may only update inbound delivery statuses.'], 403);
    }
    $d->prepare('UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?')
      ->execute([$newStatus, $m[1]]);

    // Log activity with notes — receiver identity (name + user ID) is
    // captured on arrival/receipt per §5.
    $actionDetails = 'Status changed to ' . $newStatus . ' by ' . $u['name'] . ' (ID ' . $u['id'] . ')';
    if (!empty($x['notes'])) {
        $actionDetails .= '. Notes: ' . $x['notes'];
    }
    $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)')
      ->execute([$m[1], 'Status Updated', $actionDetails]);

    // Outbound stream: a verified-and-arrived order settles a receipt to
    // Accounts Payable (Financial Management). Full receipt forwarding now
    // happens in the receive endpoint; arrival still pre-stages the record.
    if (in_array($newStatus, ['Arrived'], true)) {
        $pq = $d->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.id = ?');
        $pq->execute([$m[1]]);
        if ($po = $pq->fetch(PDO::FETCH_ASSOC)) forwardToFinance($d, $po);
    }

    reply(['ok' => true, 'status' => $newStatus]);
}

// --- Vendors Endpoints ---
if ($method === 'GET' && $path === '/api/v1/vendors') {
    auth();
    reply(db()->query("SELECT v.*,
            (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id = v.id AND po.deleted_at IS NULL) AS po_count
        FROM vendors v WHERE v.deleted_at IS NULL AND v.archived_at IS NULL ORDER BY v.on_time_rate DESC")->fetchAll(PDO::FETCH_ASSOC));
}

// --- Users Endpoints ---
if ($method === 'GET' && $path === '/api/v1/users') {
    auth(['Admin']);
    reply(db()->query('SELECT id, full_name, email, role, is_active, avatar, created_at FROM users ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST' && $path === '/api/v1/users') {
    auth(['Admin']);
    $x = body();
    if (!passwordMeetsPolicy((string)($x['password'] ?? ''))) {
        reply(['error' => 'Password must be 8-15 characters with uppercase, lowercase, a number, and a special character.'], 422);
    }
    $q = db()->prepare('INSERT INTO users(full_name, email, password_hash, role) VALUES(?, ?, ?, ?)');
    $q->execute([$x['full_name'], strtolower($x['email']), password_hash($x['password'], PASSWORD_DEFAULT), $x['role'] ?? 'WarehouseStaff']);
    reply(['id' => db()->lastInsertId()], 201);
}

if ($method === 'PUT' && preg_match('#^/api/v1/users/(\d+)$#', $path, $m)) {
    auth(['Admin']);
    $x = body();
    $d = db();
    $updateFields = [];
    $params = [];
    
    if (!empty($x['full_name'])) {
        $updateFields[] = 'full_name = ?';
        $params[] = $x['full_name'];
    }
    if (!empty($x['email'])) {
        $updateFields[] = 'email = ?';
        $params[] = strtolower($x['email']);
    }
    if (!empty($x['role'])) {
        $updateFields[] = 'role = ?';
        $params[] = $x['role'];
    }
    if (!empty($x['password'])) {
        if (!passwordMeetsPolicy((string)$x['password'])) {
            reply(['error' => 'Password must be 8-15 characters with uppercase, lowercase, a number, and a special character.'], 422);
        }
        $updateFields[] = 'password_hash = ?';
        $params[] = password_hash($x['password'], PASSWORD_DEFAULT);
    }
    if (isset($x['is_active'])) {
        $updateFields[] = 'is_active = ?';
        $params[] = $x['is_active'];
    }
    
    if (empty($updateFields)) {
        reply(['error' => 'No fields to update'], 400);
    }
    
    $params[] = $m[1];
    $d->prepare('UPDATE users SET ' . implode(', ', $updateFields) . ' WHERE id = ?')->execute($params);
    reply(['ok' => true]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/users/(\d+)$#', $path, $m)) {
    auth(['Admin']);
    $d = db();
    $d->prepare('DELETE FROM users WHERE id = ?')->execute([$m[1]]);
    reply(['ok' => true]);
}

if ($method === 'GET' && $path === '/api/v1/login-history') {
    auth(['Admin']);
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per = min(100, max(5, (int)($_GET['per_page'] ?? 10)));
    $d = db();

    $where = [];
    $params = [];
    if (($search = trim($_GET['search'] ?? '')) !== '') {
        $where[] = '(lh.email LIKE ? OR u.full_name LIKE ?)';
        $params[] = "%$search%";
        $params[] = "%$search%";
    }
    if (isset($_GET['result']) && in_array($_GET['result'], ['success', 'failed'], true)) {
        $where[] = 'lh.success = ?';
        $params[] = $_GET['result'] === 'success' ? 1 : 0;
    }
    if (($from = trim($_GET['date_from'] ?? '')) !== '') {
        $where[] = 'lh.created_at >= ?';
        $params[] = $from . ' 00:00:00';
    }
    if (($to = trim($_GET['date_to'] ?? '')) !== '') {
        $where[] = 'lh.created_at <= ?';
        $params[] = $to . ' 23:59:59';
    }
    $wsql = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $join = 'FROM login_history lh LEFT JOIN users u ON lh.user_id = u.id';

    $c = $d->prepare("SELECT COUNT(*) $join $wsql");
    $c->execute($params);
    $total = (int)$c->fetchColumn();

    $q = $d->prepare("SELECT lh.*, u.full_name, u.role $join $wsql ORDER BY lh.created_at DESC LIMIT ? OFFSET ?");
    $i = 1;
    foreach ($params as $p) { $q->bindValue($i++, $p); }
    $q->bindValue($i++, $per, PDO::PARAM_INT);
    $q->bindValue($i, ($page - 1) * $per, PDO::PARAM_INT);
    $q->execute();
    reply([
        'items' => $q->fetchAll(PDO::FETCH_ASSOC),
        'total' => $total,
        'page' => $page,
        'pages' => max(1, (int)ceil($total / $per)),
        'per_page' => $per,
    ]);
}

// Notification feed for the header bell (role-aware)
if ($method === 'GET' && $path === '/api/v1/notifications') {
    $u = auth();
    $d = db();
    $items = [];

    $q = $d->query("SELECT po.po_number, COALESCE(v.name, po.vendor) AS vendor_name, po.created_at FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.status IN ('Pending','Submitted','Pending Approval') ORDER BY po.created_at DESC LIMIT 10");
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $items[] = ['icon' => 'receipt_long', 'title' => 'PO awaiting approval: ' . $r['po_number'], 'sub' => $r['vendor_name'] ?: 'Vendor TBD', 'time' => $r['created_at'], 'href' => 'procurement.html#orders'];
    }
    $q = $d->query("SELECT req_number, title, created_at FROM requisitions WHERE status IN ('Submitted','Pending') ORDER BY created_at DESC LIMIT 10");
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $items[] = ['icon' => 'shopping_cart', 'title' => 'Requisition ' . $r['req_number'], 'sub' => $r['title'], 'time' => $r['created_at'], 'href' => 'procurement.html'];
    }
    $q = $d->query("SELECT reference_no, document_type, created_at FROM documents WHERE status IN ('Pending','Pending Verification') ORDER BY created_at DESC LIMIT 10");
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $items[] = ['icon' => 'description', 'title' => 'Document needs verification: ' . $r['reference_no'], 'sub' => $r['document_type'], 'time' => $r['created_at'], 'href' => 'documents.html'];
    }
    if ($u['role'] === 'Admin') {
        $q = $d->query("SELECT title, details, user_email, created_at FROM admin_notifications WHERE status = 'Pending' ORDER BY created_at DESC LIMIT 10");
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $items[] = ['icon' => 'lock_reset', 'title' => $r['title'], 'sub' => $r['user_email'] ?: $r['details'], 'time' => $r['created_at'], 'href' => 'users.html'];
        }
        $q = $d->query("SELECT request_number, equipment_needed, created_at FROM equipment_requests WHERE status = 'Pending' ORDER BY created_at DESC LIMIT 10");
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $items[] = ['icon' => 'assignment', 'title' => 'Equipment request ' . $r['request_number'], 'sub' => mb_substr((string)$r['equipment_needed'], 0, 60), 'time' => $r['created_at'], 'href' => 'documents.html'];
        }
    }
    usort($items, fn($a, $b) => strcmp($b['time'], $a['time']));
    reply(['items' => array_slice($items, 0, 15), 'count' => count($items)]);
}

// Admin approval queue: pending requests (password resets, alerts)
if ($method === 'GET' && $path === '/api/v1/admin-notifications') {
    auth(['Admin']);
    reply(['items' => db()->query("SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 50")->fetchAll(PDO::FETCH_ASSOC)]);
}

// Admin dismisses a notification
if ($method === 'POST' && $path === '/api/v1/notifications/dismiss') {
    auth(['Admin']);
    $x = body();
    db()->prepare('UPDATE admin_notifications SET status = ? WHERE id = ?')->execute(['Resolved', (int)($x['id'] ?? 0)]);
    reply(['ok' => true]);
}

// MFA Endpoints
if ($method === 'POST' && $path === '/api/v1/mfa/setup') {
    auth();
    $u = currentUser();
    
    // Generate TOTP secret
    $secret = strtoupper(bin2hex(random_bytes(16)));
    
    // Store secret temporarily (not enabled yet)
    $d = db();
    $d->prepare('UPDATE users SET mfa_secret = ? WHERE id = ?')->execute([$secret, $u['id']]);
    
    // Generate QR code URI (secret must be Base32 for authenticator apps)
    $issuer = 'Great Solomon SCIM';
    $account = $u['email'];
    $qrCodeUri = sprintf('otpauth://totp/%s:%s?secret=%s&issuer=%s', 
        rawurlencode($issuer), 
        rawurlencode($account), 
        base32EncodeHex($secret), 
        rawurlencode($issuer)
    );
    
    reply([
        'secret' => $secret,
        'qr_code_uri' => $qrCodeUri,
        'backup_codes' => [] // Could generate backup codes here
    ]);
}

if ($method === 'POST' && $path === '/api/v1/mfa/verify') {
    auth();
    $x = body();
    $u = currentUser();
    
    if (empty($x['code'])) {
        reply(['error' => 'Verification code required'], 400);
    }
    
    $d = db();
    $q = $d->prepare('SELECT mfa_secret FROM users WHERE id = ?');
    $q->execute([$u['id']]);
    $user = $q->fetch(PDO::FETCH_ASSOC);
    
    if (empty($user['mfa_secret'])) {
        reply(['error' => 'MFA not set up'], 400);
    }
    
    // Verify TOTP code (simplified - in production use a proper TOTP library)
    if (!verifyTOTP($x['code'], $user['mfa_secret'])) {
        reply(['error' => 'Invalid verification code'], 401);
    }
    
    // Enable MFA
    $d->prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?')->execute([$u['id']]);
    
    reply(['ok' => true, 'message' => 'MFA enabled successfully']);
}

if ($method === 'POST' && $path === '/api/v1/mfa/disable') {
    auth();
    $x = body();
    $u = currentUser();
    
    // Verify password before disabling MFA
    $d = db();
    $q = $d->prepare('SELECT password_hash FROM users WHERE id = ?');
    $q->execute([$u['id']]);
    $user = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!password_verify($x['password'] ?? '', $user['password_hash'])) {
        reply(['error' => 'Invalid password'], 401);
    }
    
    // Disable MFA
    $d->prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?')->execute([$u['id']]);
    
    reply(['ok' => true, 'message' => 'MFA disabled successfully']);
}

if ($method === 'POST' && $path === '/api/v1/mfa/login-verify') {
    $x = body();
    $ticket = $x['ticket'] ?? '';
    $code = $x['code'] ?? '';
    
    if (empty($code) || empty($ticket)) {
        reply(['error' => 'Verification code required'], 400);
    }
    
    $d = db();
    $q = $d->prepare('SELECT * FROM otp_tickets WHERE ticket = ? LIMIT 1');
    $q->execute([$ticket]);
    $pending = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$pending) {
        reply(['error' => 'No verification pending. Please login again.'], 401);
    }
    
    $userId = (int)$pending['user_id'];
    
    if (time() > (int)$pending['expires_at']) {
        $d->prepare('DELETE FROM otp_tickets WHERE id = ?')->execute([$pending['id']]);
        reply(['error' => 'Verification code expired. Please request a new code.', 'expired' => true], 401);
    }
    
    if (!hash_equals($pending['otp'], (string)$code)) {
        reply(['error' => 'Invalid verification code'], 401);
    }
    
    // OTP verified — consume the ticket and issue a per-tab session token
    $d->prepare('DELETE FROM otp_tickets WHERE id = ?')->execute([$pending['id']]);
    $q = $d->prepare('SELECT * FROM users WHERE id = ?');
    $q->execute([$userId]);
    $user = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$user || !$user['is_active']) {
        reply(['error' => 'User not found'], 401);
    }
    
    $token = bin2hex(random_bytes(32));
    $d->prepare('DELETE FROM session_tokens WHERE expires_at < NOW()')->execute();
    // Admin single-device policy (§1): an Administrator login revokes every
    // other live session token for the account — one active device only.
    if ($user['role'] === 'Admin') {
        $d->prepare('DELETE FROM session_tokens WHERE user_id = ?')->execute([$userId]);
    }
    $d->prepare('INSERT INTO session_tokens(token, user_id, expires_at) VALUES(?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))')
      ->execute([$token, $userId]);
    
    // Also set the cookie session for legacy endpoints
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => $userId,
        'name' => $user['full_name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'department' => $user['department'] ?? null,
        'avatar' => $user['avatar'] ?? null,
        'initials' => strtoupper(substr($user['full_name'], 0, 1))
    ];
    
    audit($d, $user['email'], true, $userId);
    
    reply(['ok' => true, 'token' => $token, 'user' => $_SESSION['user']]);
}

if ($method === 'POST' && $path === '/api/v1/mfa/resend-otp') {
    $x = body();
    $ticket = $x['ticket'] ?? '';
    
    $d = db();
    $q = $d->prepare('SELECT * FROM otp_tickets WHERE ticket = ? LIMIT 1');
    $q->execute([$ticket]);
    $pending = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$pending) {
        reply(['error' => 'No verification pending. Please login again.'], 401);
    }
    
    $q = $d->prepare('SELECT * FROM users WHERE id = ?');
    $q->execute([(int)$pending['user_id']]);
    $user = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        reply(['error' => 'User not found'], 401);
    }
    
    // Generate new OTP — issues a fresh ticket so the old code is fully dead
    $otp = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $newTicket = bin2hex(random_bytes(32));
    $d->prepare('DELETE FROM otp_tickets WHERE id = ?')->execute([$pending['id']]);
    $d->prepare('INSERT INTO otp_tickets(ticket, user_id, otp, expires_at) VALUES(?, ?, ?, ?)')
      ->execute([$newTicket, (int)$user['id'], $otp, time() + 300]);
    
    // Respond first, send email in background
    $resendPayload = ['ok' => true, 'ticket' => $newTicket];
    $sc = smtpConfig();
    if (in_array($_SERVER['SERVER_NAME'] ?? '', ['127.0.0.1', 'localhost', '::1'], true)
        && (empty($sc['user']) || empty($sc['pass']))) {
        $resendPayload['dev_otp'] = $otp;
    }
    $payload = json_encode($resendPayload);
    http_response_code(200);
    header('Content-Length: ' . strlen($payload));
    echo $payload;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) { ob_end_flush(); }
        flush();
    }
    
    try {
        if (!sendOtpEmail($user['email'], $user['full_name'], $otp)) {
            error_log("OTP resend email failed for {$user['email']}. Code: $otp");
        }
    } catch (Throwable $e) {
        error_log('OTP resend error: ' . $e->getMessage());
    }
    exit;
}

// Encode hex secret to Base32 for authenticator-app compatibility
function base32EncodeHex(string $hex): string {
    $bin = pack('H*', $hex);
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $out = '';
    for ($i = 0; $i < strlen($bin); $i += 5) {
        $chunk = substr($bin, $i, 5);
        $chunk .= str_repeat("\0", 5 - strlen($chunk));
        $bits = '';
        for ($j = 0; $j < 5; $j++) $bits .= str_pad(decbin(ord($chunk[$j])), 8, '0', STR_PAD_LEFT);
        $padLen = [0 => 0, 1 => 6, 2 => 4, 3 => 3, 4 => 1][min(strlen(substr($bin, $i, 5)), 4)];
        for ($j = 0; $j < 8; $j++) {
            $piece = substr($bits, $j * 5, 5);
            $out .= strlen($piece) === 5 ? $alphabet[bindec($piece)] : '=';
        }
    }
    return $out;
}

// RFC 6238 TOTP verification (30-second step, +/-1 window for clock drift)
function verifyTOTP($code, $secret) {
    if (!preg_match('/^\d{6}$/', (string)$code)) return false;
    $key = pack('H*', strtolower($secret)); // secret stored as hex via bin2hex
    if ($key === false) return false;
    for ($w = -1; $w <= 1; $w++) {
        $t = pack('N*', 0) . pack('N*', floor(time() / 30) + $w);
        $hmac = hash_hmac('sha1', $t, $key, true);
        $offset = ord(substr($hmac, -1)) & 0x0F;
        $totp = ((ord($hmac[$offset]) & 0x7F) << 24)
              | ((ord($hmac[$offset + 1]) & 0xFF) << 16)
              | ((ord($hmac[$offset + 2]) & 0xFF) << 8)
              | (ord($hmac[$offset + 3]) & 0xFF);
        if (str_pad((string)($totp % 1000000), 6, '0', STR_PAD_LEFT) === (string)$code) {
            return true;
        }
    }
    return false;
}

// --- Warehouse API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/warehouse/zones') {
    auth();
    $d = db();
    // Zone and row occupancy both computed live from assets — assets carry
    // their zone (location) and row (bin_row). The stored counters were
    // seeded demo numbers and are never updated by scans.
    $zones = $d->query("SELECT z.zone, z.capacity, z.category,
            (SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
              AND a.deleted_at IS NULL AND a.archived_at IS NULL) occupied,
            ROUND((SELECT COUNT(*) FROM assets a WHERE a.location = z.zone AND a.status = 'In Warehouse'
              AND a.deleted_at IS NULL AND a.archived_at IS NULL) / z.capacity * 100) pct
            FROM warehouse_zones z ORDER BY z.zone")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($zones as &$zone) {
        $stmt = $d->prepare("SELECT r.row_num AS row, r.capacity,
                (SELECT COUNT(*) FROM assets a WHERE a.location = ? AND a.bin_row = r.row_num
                  AND a.status = 'In Warehouse' AND a.deleted_at IS NULL AND a.archived_at IS NULL) occupied,
                ROUND((SELECT COUNT(*) FROM assets a WHERE a.location = ? AND a.bin_row = r.row_num
                  AND a.status = 'In Warehouse' AND a.deleted_at IS NULL AND a.archived_at IS NULL) / r.capacity * 100) pct
                FROM warehouse_rows r WHERE r.zone = ? ORDER BY r.row_num");
        $stmt->execute([$zone['zone'], $zone['zone'], $zone['zone']]);
        $zone['rows'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Zone-level assets with no row assignment still count at zone level —
        // expose them so the grid can show "unassigned" rather than a gap.
        $uq = $d->prepare("SELECT COUNT(*) FROM assets WHERE location = ? AND status = 'In Warehouse'
            AND deleted_at IS NULL AND archived_at IS NULL AND (bin_row IS NULL OR bin_row = '')");
        $uq->execute([$zone['zone']]);
        $zone['unassigned'] = (int)$uq->fetchColumn();
    }
    unset($zone);
    reply(['zones' => $zones]);
}

if ($method === 'POST' && $path === '/api/v1/warehouse/zones') {
    auth(['Admin', 'Manager']);
    $x = body();
    $zone = trim((string)($x['zone'] ?? ''));
    $capacity = filter_var($x['capacity'] ?? null, FILTER_VALIDATE_INT);
    $rowCount = filter_var($x['row_count'] ?? 4, FILTER_VALIDATE_INT);
    $zoneCategory = trim((string)($x['category'] ?? ''));

    if ($zone === '' || strlen($zone) > 20 || $capacity === false || $capacity < 1 ||
        $rowCount === false || $rowCount < 1 || $rowCount > 20 || $rowCount > $capacity) {
        reply(['error' => 'Enter a zone name, a positive capacity, and 1 to 20 rows not exceeding the capacity.'], 400);
    }
    if ($zoneCategory === '') {
        reply(['error' => 'Every zone must have an assigned category.'], 400);
    }

    $d = db();
    try {
        $d->beginTransaction();
        $d->prepare('INSERT INTO warehouse_zones(zone, capacity, occupied, category) VALUES(?, ?, 0, ?)')
          ->execute([$zone, $capacity, $zoneCategory]);

        $baseRowCapacity = intdiv($capacity, $rowCount);
        $remainingCapacity = $capacity % $rowCount;
        $rowInsert = $d->prepare('INSERT INTO warehouse_rows(zone, row_num, capacity, occupied) VALUES(?, ?, ?, 0)');
        for ($rowNumber = 1; $rowNumber <= $rowCount; $rowNumber++) {
            $rowCapacity = $baseRowCapacity + ($rowNumber <= $remainingCapacity ? 1 : 0);
            $rowInsert->execute([$zone, (string)$rowNumber, $rowCapacity]);
        }

        $d->commit();
    } catch (PDOException $error) {
        if ($d->inTransaction()) $d->rollBack();
        if ($error->getCode() === '23000') {
            reply(['error' => 'That zone already exists. Choose a different zone name.'], 409);
        }
        reply(['error' => 'Unable to create warehouse zone.'], 500);
    }

    reply(['ok' => true, 'zone' => $zone], 201);
}

if ($method === 'GET' && $path === '/api/v1/warehouse/scans') {
    auth();
    $d = db();
    $scans = $d->query("SELECT t.action, t.created_at, a.name, a.qr_code, t.zone FROM asset_transactions t JOIN assets a ON a.id=t.asset_id ORDER BY t.created_at DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    reply(['scans' => $scans]);
}

// --- Inventory API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/inventory/assets') {
    auth();
    $d = db();
    // TRD §3/§4: generated-but-unscanned serials stay in a pending state
    // (Awaiting Print / Print Queue) and must NOT populate the active
    // Asset Inventory until physically scanned in. They are exposed only
    // through ?pending=1 for the Pending Stock Adjustments queue.
    $pending = isset($_GET['pending']) && $_GET['pending'] === '1';
    $search = trim((string)($_GET['search'] ?? ''));
    // Archived and binned rows are invisible to the active ledger.
    $where = ($pending ? "status = 'Awaiting Print'" : "status <> 'Awaiting Print'")
           . " AND archived_at IS NULL AND deleted_at IS NULL";
    $params = [];
    if ($search !== '') {
        $where .= ' AND (name LIKE ? OR qr_code LIKE ? OR category LIKE ? OR location LIKE ? OR status LIKE ?)';
        $like = "%$search%";
        $params = [$like, $like, $like, $like, $like];
    }
    $cat = trim((string)($_GET['category'] ?? ''));
    if ($cat !== '') { $where .= ' AND category = ?'; $params[] = $cat; }
    $st = trim((string)($_GET['status'] ?? ''));
    if ($st !== '') { $where .= ' AND status = ?'; $params[] = $st; }
    $q = $d->prepare("SELECT * FROM assets WHERE $where ORDER BY created_at DESC");
    $q->execute($params);
    reply(['assets' => $q->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($method === 'POST' && $path === '/api/v1/inventory/assets') {
    auth(['Admin', 'WarehouseStaff']);
    $x = body();
    [$loc, $binRow] = normalizeZoneRow(db(), $x['location'] ?? null, $x['row'] ?? null);
    $q = db()->prepare('INSERT INTO assets(qr_code, name, category, value, status, location, bin_row, quantity, low_stock_threshold, date_purchased, lifespan_months, specs, manufacturer, model, serial_number, warranty_expiry) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $q->execute([$x['qr_code'], $x['name'], $x['category'], $x['value'], $x['status'] ?? 'In Warehouse', $loc, $binRow,
        (int)($x['quantity'] ?? 1) ?: 1, ($x['low_stock_threshold'] ?? null) !== '' && ($x['low_stock_threshold'] ?? null) !== null ? (int)$x['low_stock_threshold'] : null,
        ($x['date_purchased'] ?? null) ?: null, ($x['lifespan_months'] ?? null) !== '' && ($x['lifespan_months'] ?? null) !== null ? (int)$x['lifespan_months'] : null,
        $x['specs'] ?? null, $x['manufacturer'] ?? null, $x['model'] ?? null, $x['serial_number'] ?? null, ($x['warranty_expiry'] ?? null) ?: null]);
    logActivity(db(), auth(), 'Registered asset', 'asset', $x['qr_code'], $x['name']);
    reply(['id' => db()->lastInsertId()], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/inventory/assets/([^/]+)$#', $path, $m)) {
    auth();
    $q = db()->prepare('SELECT * FROM assets WHERE qr_code = ?');
    $q->execute([rawurldecode($m[1])]);
    $a = $q->fetch(PDO::FETCH_ASSOC);
    reply($a ?: ['error' => 'Asset not found'], $a ? 200 : 404);
}

if ($method === 'PUT' && preg_match('#^/api/v1/inventory/assets/([^/]+)$#', $path, $m)) {
    // TRD §1: procurement specialists are read-only on stock levels.
    auth(['Admin', 'WarehouseStaff']);
    $x = body();
    $d = db();

    $assetQuery = $d->prepare('SELECT id, status, qr_code FROM assets WHERE qr_code = ?');
    $assetQuery->execute([rawurldecode($m[1])]);
    $existingAsset = $assetQuery->fetch(PDO::FETCH_ASSOC);
    if (!$existingAsset) {
        reply(['error' => 'Asset not found'], 404);
    }
    
    $updateFields = [];
    $params = [];

    if (array_key_exists('qr_code', $x)) {
        $newQrCode = trim((string)$x['qr_code']);
        if ($newQrCode === '' || strlen($newQrCode) > 50) {
            reply(['error' => 'QR code is required and must be 50 characters or fewer.'], 400);
        }
        $updateFields[] = 'qr_code = ?';
        $params[] = $newQrCode;
    }
    
    if (array_key_exists('name', $x)) {
        $updateFields[] = 'name = ?';
        $params[] = $x['name'];
    }
    if (array_key_exists('category', $x)) {
        $updateFields[] = 'category = ?';
        $params[] = $x['category'];
    }
    if (array_key_exists('value', $x)) {
        $updateFields[] = 'value = ?';
        $params[] = $x['value'];
    }
    if (array_key_exists('status', $x)) {
        $updateFields[] = 'status = ?';
        $params[] = $x['status'];
    }
    if (array_key_exists('location', $x)) {
        [$loc, $binRow] = normalizeZoneRow($d, $x['location'], $x['row'] ?? null);
        $updateFields[] = 'location = ?';
        $params[] = $loc;
        $updateFields[] = 'bin_row = ?';
        $params[] = $binRow;
    }
    if (array_key_exists('quantity', $x)) {
        $updateFields[] = 'quantity = ?';
        $params[] = max(1, (int)$x['quantity']);
    }
    if (array_key_exists('low_stock_threshold', $x)) {
        $updateFields[] = 'low_stock_threshold = ?';
        $params[] = $x['low_stock_threshold'] === null || $x['low_stock_threshold'] === '' ? null : (int)$x['low_stock_threshold'];
    }
    if (array_key_exists('date_purchased', $x)) {
        $updateFields[] = 'date_purchased = ?';
        $params[] = $x['date_purchased'] ?: null;
    }
    if (array_key_exists('lifespan_months', $x)) {
        $updateFields[] = 'lifespan_months = ?';
        $params[] = $x['lifespan_months'] === null || $x['lifespan_months'] === '' ? null : (int)$x['lifespan_months'];
    }
    // Static attributes — manufacturer/model/serial/warranty.
    foreach (['specs', 'manufacturer', 'model', 'serial_number'] as $field) {
        if (array_key_exists($field, $x)) { $updateFields[] = "$field = ?"; $params[] = $x[$field]; }
    }
    if (array_key_exists('warranty_expiry', $x)) {
        $updateFields[] = 'warranty_expiry = ?';
        $params[] = $x['warranty_expiry'] ?: null;
    }

    if (empty($updateFields)) {
        reply(['error' => 'No fields to update'], 400);
    }
    
    $params[] = rawurldecode($m[1]);
    
    $q = $d->prepare('UPDATE assets SET ' . implode(', ', $updateFields) . ' WHERE qr_code = ?');
    try {
        $q->execute($params);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            reply(['error' => 'That QR code is already assigned to another asset.'], 409);
        }
        throw $error;
    }

    if (isset($newQrCode) && $newQrCode !== $existingAsset['qr_code']) {
        $d->prepare('UPDATE equipment_request_items SET assigned_qr_code = ? WHERE assigned_asset_id = ?')
          ->execute([$newQrCode, $existingAsset['id']]);
    }
    
    if (isset($x['status']) && $x['status'] !== $existingAsset['status']) {
        $d->prepare('INSERT INTO asset_transactions(asset_id, action, zone, created_at) VALUES(?, ?, ?, NOW())')
          ->execute([$existingAsset['id'], 'Status Updated', $x['location'] ?? 'Unknown']);
    }

    // TRD §2: threshold breach fires an automated dashboard notification.
    // Only active (non-pending, non-binned) stock triggers alerts, and only
    // once per breach — a matching Pending notice suppresses repeats.
    if (array_key_exists('quantity', $x) || array_key_exists('low_stock_threshold', $x)) {
        $check = $d->prepare("SELECT id, name, quantity, low_stock_threshold, status FROM assets WHERE qr_code = ?");
        $check->execute([rawurldecode($m[1])]);
        if ($row = $check->fetch(PDO::FETCH_ASSOC)) {
            if ($row['status'] === 'In Warehouse' && $row['low_stock_threshold'] !== null
                && (int)$row['quantity'] < (int)$row['low_stock_threshold']) {
                $dup = $d->prepare("SELECT id FROM admin_notifications WHERE type = 'low_stock' AND status = 'Pending' AND details LIKE ? LIMIT 1");
                $dup->execute(['%' . $m[1] . '%']);
                if (!$dup->fetch()) {
                    $d->prepare("INSERT INTO admin_notifications(type, title, details) VALUES('low_stock', 'Low Stock Alert', ?)")
                      ->execute([sprintf('Asset %s ("%s") dropped to %d on hand — minimum is %d.',
                          $m[1], $row['name'], $row['quantity'], $row['low_stock_threshold'])]);
                }
            }
        }
    }
    logActivity($d, auth(), 'Updated asset', 'asset', $m[1], implode(', ', array_keys($x)));

    reply(['ok' => true]);
}

if ($method === 'GET' && $path === '/api/v1/inventory/transactions') {
    auth();
    $d = db();
    $transactions = $d->query("SELECT t.*, a.name AS asset_name, a.qr_code FROM asset_transactions t JOIN assets a ON a.id=t.asset_id ORDER BY t.created_at DESC LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);
    reply(['transactions' => $transactions]);
}

// --- Procurement API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/procurement/requisitions') {
    auth();
    $d = db();
    $requisitions = $d->query('SELECT r.*, u.full_name AS created_by_name FROM requisitions r LEFT JOIN users u ON r.created_by=u.id WHERE r.deleted_at IS NULL AND r.archived_at IS NULL ORDER BY r.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['requisitions' => $requisitions]);
}

if ($method === 'POST' && $path === '/api/v1/procurement/requisitions') {
    // Any operational role may *submit* a requisition; only Admin can approve.
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $req_count = (int)$d->query("SELECT COUNT(*)+1 FROM requisitions WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $req_number='REQ-'.date('Y').'-'.str_pad((string)$req_count,3,'0',STR_PAD_LEFT);    $q = $d->prepare("INSERT INTO requisitions(req_number, title, department, purpose, description, estimated_cost, priority, needed_by, status, created_by) VALUES(?,?,?,?,?,?,?,?,'Submitted',?)");
    $q->execute([$req_number, $x['title'], $x['department'], $x['purpose'] ?? null, $x['description'], $x['estimated_cost'], $x['priority'], $x['needed_by'], $u['id']]);
    reply(['id' => $d->lastInsertId(), 'req_number' => $req_number], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/procurement/requisitions/([^/]+)$#', $path, $m)) {
    auth();
    $d = db();
    $q = $d->prepare('SELECT r.*, u.full_name AS created_by_name FROM requisitions r LEFT JOIN users u ON r.created_by=u.id WHERE r.req_number = ? OR r.id = ?');
    $q->execute([$m[1], $m[1]]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    reply($r ?: ['error' => 'Requisition not found'], $r ? 200 : 404);
}

if ($method === 'PUT' && preg_match('#^/api/v1/procurement/requisitions/([^/]+)$#', $path, $m)) {
    $u = auth(['Admin', 'Manager']);
    $x = body();
    $d = db();

    // TRD §4 multi-tier workflow: departments submit (Submitted) → the
    // manager forwards to inventory (Inventory Review) → the Administrator
    // performs inventory approval (Inventory Approved) → the procurement
    // manager completes final approval (Completed). Rejection remains an
    // Administrator-exclusive decision per TRD §1.
    if (isset($x['status'])) {
        $allowedStatuses = ['Draft', 'Submitted', 'Pending', 'Inventory Review',
            'Inventory Approved', 'Completed', 'Approved', 'Rejected', 'Ordered', 'Closed', 'Cancelled'];
        if (!in_array($x['status'], $allowedStatuses, true)) {
            reply(['error' => 'Invalid requisition status.'], 400);
        }
        if (in_array($x['status'], ['Inventory Approved', 'Rejected'], true) && $u['role'] !== 'Admin') {
            reply(['error' => 'Only a System Administrator may perform inventory approval or reject requisitions.'], 403);
        }
        if ($x['status'] === 'Inventory Review' && !in_array($u['role'], ['Admin', 'Manager'], true)) {
            reply(['error' => 'Only a manager may forward a requisition to inventory.'], 403);
        }
    }

    $lookup = $d->prepare('SELECT id FROM requisitions WHERE req_number = ? OR id = ? LIMIT 1');
    $lookup->execute([$m[1], $m[1]]);
    $req = $lookup->fetch(PDO::FETCH_ASSOC);

    if (!$req) {
        reply(['error' => 'Requisition not found'], 404);
    }

    $updateFields = [];
    $params = [];

    foreach (['title', 'department', 'purpose', 'description', 'priority', 'status'] as $field) {
        if (array_key_exists($field, $x)) {
            $updateFields[] = $field . ' = ?';
            $params[] = $x[$field];
        }
    }

    if (array_key_exists('estimated_cost', $x)) {
        $updateFields[] = 'estimated_cost = ?';
        $params[] = $x['estimated_cost'];
    }

    if (array_key_exists('actual_cost', $x)) {
        $updateFields[] = 'actual_cost = ?';
        $params[] = $x['actual_cost'];
    }

    if (array_key_exists('needed_by', $x)) {
        $updateFields[] = 'needed_by = ?';
        $params[] = $x['needed_by'];
    }

    if (empty($updateFields)) {
        reply(['error' => 'No fields to update'], 400);
    }

    $params[] = $req['id'];
    $d->prepare('UPDATE requisitions SET ' . implode(', ', $updateFields) . ' WHERE id = ?')->execute($params);

    // TRD §4 audit trail: requisition lifecycle events are immutable log rows
    if (isset($x['status'])) {
        $d->prepare('INSERT INTO integration_audit_log(external_system, action, entity_type, entity_id, request_data, status) VALUES(?,?,?,?,?,?)')
          ->execute(['SCIM', 'Requisition ' . $x['status'], 'requisition', $req['id'],
                     json_encode(['req_number' => $m[1], 'new_status' => $x['status'], 'actor' => $u['name'] ?? $u['id']]), 'Success']);
        logActivity($d, $u, 'Requisition ' . $x['status'], 'requisition', $m[1]);
    }

    reply(['ok' => true]);
}

// ==========================================================================
// SUPPLY REQUESTS (v7) — the primary internal workflow spine:
// Staff → Draft → Submitted → Dept Approver Review → Approved
//   → Inventory Review → For Issuance (stock) or In Procurement
//   → PO → Receipt → back to For Issuance → Issued → Closed
// ==========================================================================
$SR_TRANSITIONS = [
    'Draft'                   => ['Submitted', 'Cancelled'],
    'Submitted'               => ['Under Department Review', 'Cancelled'],
    'Under Department Review' => ['Approved', 'Rejected', 'Cancelled'],
    'Approved'                => ['Inventory Review', 'Cancelled'],
    'Inventory Review'        => ['For Issuance', 'In Procurement', 'Cancelled'],
    'For Issuance'            => ['Issued', 'Partially Issued', 'Cancelled'],
    'In Procurement'          => ['For Issuance', 'Cancelled'],
    'Partially Issued'        => ['Issued', 'For Issuance', 'Cancelled'],
    'Issued'                  => ['Closed'],
    'Closed'                  => [], 'Rejected' => [], 'Cancelled' => [],
];
// Statuses owned by supply-chain staff (vs requester vs dept approver).
$SR_SC_STATUSES = ['Approved', 'Inventory Review', 'For Issuance', 'In Procurement', 'Partially Issued', 'Issued', 'Closed'];
$SR_DEPT_STATUSES = ['Submitted', 'Under Department Review'];
$SR_SC_ROLES = ['Admin', 'Manager', 'WarehouseStaff'];

// Is this user an authorized approver for the given department? Driven by
// the department_approvers mapping (future HRIS-owned). In standalone SCIM
// mode — no approver mapping for that department yet — any Manager acts as
// the authorized approver. Once a department has mapped approvers (e.g. an
// HRIS-fed department head), only they can decide.
function isDeptApprover(PDO $d, array $u, ?string $dept): bool {
    if ($dept === null || $dept === '') return false;
    $cnt = $d->prepare('SELECT COUNT(*) FROM department_approvers WHERE department = ? AND is_active = 1');
    $cnt->execute([$dept]);
    $configured = (int)$cnt->fetchColumn() > 0;
    if ($configured) {
        $q = $d->prepare('SELECT 1 FROM department_approvers WHERE department = ? AND user_id = ? AND is_active = 1');
        $q->execute([$dept, $u['id']]);
        return (bool)$q->fetchColumn();
    }
    // Standalone mode: the SCIM Manager validates all departments.
    return $u['role'] === 'Manager';
}

if ($method === 'GET' && $path === '/api/v1/supply-requests') {
    $u = auth();
    $d = db();
    $scope = trim($_GET['scope'] ?? '');
    $where = '1=1'; $params = [];
    if ($scope === 'mine') {
        $where = 'sr.created_by = ?'; $params[] = $u['id'];
    } elseif ($scope === 'dept') {
        // Requests in departments this user is authorized to approve.
        $depts = $d->prepare('SELECT department FROM department_approvers WHERE user_id = ? AND is_active = 1');
        $depts->execute([$u['id']]);
        $names = $depts->fetchAll(PDO::FETCH_COLUMN);
        if (!$names && $u['role'] === 'Manager') {
            // Standalone mode: the SCIM Manager approves every department —
            // show the department-stage queue (anything awaiting decision).
            $where = "sr.status IN ('" . implode("','", $SR_DEPT_STATUSES) . "')";
        } elseif (!$names) {
            reply(['requests' => []]);
        } else {
            $where = 'sr.department IN (' . implode(',', array_fill(0, count($names), '?')) . ')';
            $params = $names;
        }
    } elseif ($scope === 'incoming') {
        auth($SR_SC_ROLES);
        $where = "sr.status IN ('" . implode("','", $SR_SC_STATUSES) . "')";
    }
    $st = trim($_GET['status'] ?? '');
    if ($st !== '') { $where .= ' AND sr.status = ?'; $params[] = $st; }
    $q = $d->prepare("SELECT sr.*, u.full_name AS created_by_name,
        (SELECT COUNT(*) FROM supply_request_items i WHERE i.request_id = sr.id) AS item_count
        FROM supply_requests sr LEFT JOIN users u ON u.id = sr.created_by
        WHERE $where ORDER BY sr.created_at DESC");
    $q->execute($params);
    $reqs = $q->fetchAll(PDO::FETCH_ASSOC);
    $iq = $d->prepare('SELECT * FROM supply_request_items WHERE request_id = ? ORDER BY id');
    foreach ($reqs as &$r) { $iq->execute([$r['id']]); $r['items'] = $iq->fetchAll(PDO::FETCH_ASSOC); }
    reply(['requests' => $reqs]);
}

if ($method === 'GET' && preg_match('#^/api/v1/supply-requests/(\d+)$#', $path, $m)) {
    auth();
    $d = db();
    $q = $d->prepare('SELECT sr.*, u.full_name AS created_by_name FROM supply_requests sr LEFT JOIN users u ON u.id = sr.created_by WHERE sr.id = ?');
    $q->execute([$m[1]]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) reply(['error' => 'Supply request not found'], 404);
    $iq = $d->prepare('SELECT * FROM supply_request_items WHERE request_id = ? ORDER BY id');
    $iq->execute([$r['id']]);
    $r['items'] = $iq->fetchAll(PDO::FETCH_ASSOC);
    $iq2 = $d->prepare('SELECT i.*, ii.item_name, ii.quantity, ii.from_zone FROM issuances i JOIN issuance_items ii ON ii.issuance_id = i.id WHERE i.request_id = ?');
    $iq2->execute([$r['id']]);
    $r['issuances'] = $iq2->fetchAll(PDO::FETCH_ASSOC);
    reply($r);
}

if ($method === 'POST' && $path === '/api/v1/supply-requests') {
    $u = auth();
    $x = body();
    $d = db();
    $items = $x['items'] ?? [];
    if (!is_array($items) || !$items) reply(['error' => 'At least one item is required (items[]: item_name, quantity).'], 400);
    if (trim($x['title'] ?? '') === '') reply(['error' => 'A request title is required.'], 400);

    $d->beginTransaction();
    try {
        $cnt = (int)$d->query("SELECT COUNT(*)+1 FROM supply_requests WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
        $reqNo = 'SR-' . date('Y') . '-' . str_pad((string)$cnt, 3, '0', STR_PAD_LEFT);
        // Drafts are saved but not yet submitted; anything else enters the
        // department-review queue as Submitted. `source` identifies the
        // originating system (STAFF_PORTAL default; HRIS/FACILITIES/etc.
        // submit through integration later).
        $src = strtoupper(substr(preg_replace('/[^A-Za-z0-9_\-]/', '', (string)($x['source'] ?? 'STAFF_PORTAL')), 0, 40)) ?: 'STAFF_PORTAL';
        $status = !empty($x['draft']) ? 'Draft' : 'Submitted';
        $d->prepare('INSERT INTO supply_requests(request_number, source, title, requesting_employee, employee_id, department, purpose, priority, needed_by, status, submitted_at, created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          ->execute([$reqNo, $src, trim($x['title']),
                     trim($x['requesting_employee'] ?? '') ?: $u['name'],
                     trim($x['employee_id'] ?? '') ?: null,
                     trim($x['department'] ?? ($u['department'] ?? '')) ?: null,
                     trim($x['purpose'] ?? '') ?: null,
                     in_array($x['priority'] ?? '', ['Low','Normal','High','Urgent'], true) ? $x['priority'] : 'Normal',
                     $x['needed_by'] ?: null, $status,
                     $status === 'Draft' ? null : date('Y-m-d H:i:s'), $u['id']]);
        $reqId = (int)$d->lastInsertId();
        $ii = $d->prepare('INSERT INTO supply_request_items(request_id, item_name, category, quantity) VALUES(?,?,?,?)');
        $n = 0;
        foreach ($items as $it) {
            $nm = trim($it['item_name'] ?? $it['name'] ?? '');
            $qty = max(1, (int)($it['quantity'] ?? $it['qty'] ?? 1));
            if ($nm === '') continue;
            $ii->execute([$reqId, $nm, trim($it['category'] ?? '') ?: null, $qty]);
            $n++;
        }
        if ($n === 0) { $d->rollBack(); reply(['error' => 'At least one valid item row is required.'], 400); }
        logActivity($d, $u, $status === 'Draft' ? 'Saved supply request draft' : 'Submitted supply request', 'supply_request', $reqNo, $n . ' item(s)');
        $d->commit();
        reply(['id' => $reqId, 'request_number' => $reqNo, 'status' => $status], 201);
    } catch (Exception $e) {
        if ($d->inTransaction()) $d->rollBack();
        reply(['error' => 'Request failed: ' . $e->getMessage()], 500);
    }
}

// Status transitions — enforced by the SR state machine with per-step
// authorization: requesters submit their own requests, authorized
// department approvers approve/reject, supply-chain staff do the rest.
if ($method === 'PUT' && preg_match('#^/api/v1/supply-requests/(\d+)/status$#', $path, $m)) {
    $u = auth();
    $x = body();
    $d = db();
    $q = $d->prepare('SELECT * FROM supply_requests WHERE id = ?');
    $q->execute([$m[1]]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) reply(['error' => 'Supply request not found'], 404);
    $new = $x['status'] ?? '';
    if (!in_array($new, array_keys($SR_TRANSITIONS), true)) reply(['error' => 'Invalid status.'], 400);
    if (!in_array($new, $SR_TRANSITIONS[$r['status']] ?? [], true)) {
        reply(['error' => "Cannot move request from '{$r['status']}' to '{$new}'. Allowed: " . ($SR_TRANSITIONS[$r['status']] ? implode(', ', $SR_TRANSITIONS[$r['status']]) : 'none — terminal state')], 409);
    }

    $isSC = in_array($u['role'], $SR_SC_ROLES, true);
    $isOwner = (int)$r['created_by'] === (int)$u['id'];
    $remarks = trim($x['remarks'] ?? '');

    if ($r['status'] === 'Under Department Review' && in_array($new, ['Approved', 'Rejected'], true)) {
        // Business-need validation belongs to the department, not IT/Admin.
        if (!isDeptApprover($d, $u, $r['department'])) {
            reply(['error' => "Only an authorized approver for '{$r['department']}' may approve or reject this request."], 403);
        }
        if ($new === 'Rejected' && $remarks === '') {
            reply(['error' => 'A rejection requires remarks explaining why.'], 400);
        }
    } elseif (in_array($new, ['Submitted', 'Under Department Review'], true)) {
        // Submitting one's own request; SC staff may route any; a dept
        // approver may pull a Submitted request into review themselves.
        if (!$isOwner && !$isSC && !($new === 'Under Department Review' && isDeptApprover($d, $u, $r['department']))) {
            reply(['error' => 'Only the requester may submit this request.'], 403);
        }
    } elseif ($new === 'Cancelled') {
        if (!$isOwner && !$isSC && !isDeptApprover($d, $u, $r['department'])) {
            reply(['error' => 'Only the requester, an authorized approver, or supply-chain staff may cancel.'], 403);
        }
    } else {
        // Inventory Review / For Issuance / In Procurement / Issued / Closed.
        if (!$isSC) reply(['error' => 'This step belongs to supply-chain staff.'], 403);
    }

    if (in_array($new, ['Approved', 'Rejected'], true) && $r['status'] === 'Under Department Review') {
        $d->prepare('UPDATE supply_requests SET status = ?, dept_approver_id = ?, approved_by = ?, approved_at = NOW(), dept_remarks = ?, updated_at = NOW() WHERE id = ?')
          ->execute([$new, $u['id'], $u['name'], $remarks !== '' ? $remarks : null, $r['id']]);
    } elseif (in_array($new, ['Submitted', 'Under Department Review'], true)) {
        $d->prepare('UPDATE supply_requests SET status = ?, submitted_at = COALESCE(submitted_at, NOW()), updated_at = NOW() WHERE id = ?')
          ->execute([$new, $r['id']]);
    } else {
        $d->prepare('UPDATE supply_requests SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$new, $r['id']]);
    }
    logActivity($d, $u, 'Supply request ' . $new, 'supply_request', $r['request_number'], $remarks);
    reply(['ok' => true, 'status' => $new]);
}

// Department approver registry — who is authorized to validate a
// department's business need. Admin manages the mapping; HRIS owns it
// once that subsystem is integrated.
if ($method === 'GET' && $path === '/api/v1/department-approvers') {
    $u = auth();
    $d = db();
    // Privileged roles see the full registry; everyone else sees only their
    // own approver assignments (so the portal can show the approval queue).
    if (in_array($u['role'], ['Admin', 'Manager'], true)) {
        $rows = $d->query('SELECT da.*, u.full_name, u.email, u.role, u.department AS user_department
                           FROM department_approvers da LEFT JOIN users u ON u.id = da.user_id
                           WHERE da.is_active = 1 ORDER BY da.department, u.full_name')->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $q = $d->prepare('SELECT da.*, u.full_name, u.email, u.role FROM department_approvers da
                          LEFT JOIN users u ON u.id = da.user_id
                          WHERE da.is_active = 1 AND da.user_id = ? ORDER BY da.department');
        $q->execute([$u['id']]);
        $rows = $q->fetchAll(PDO::FETCH_ASSOC);
    }
    reply(['approvers' => $rows]);
}

if ($method === 'POST' && $path === '/api/v1/department-approvers') {
    $u = auth(['Admin']);
    $x = body();
    $d = db();
    $dept = trim($x['department'] ?? '');
    $uid = (int)($x['user_id'] ?? 0);
    if ($dept === '' || !$uid) reply(['error' => 'department and user_id are required.'], 400);
    $uq = $d->prepare('SELECT id, full_name FROM users WHERE id = ? AND is_active = 1');
    $uq->execute([$uid]);
    $usr = $uq->fetch(PDO::FETCH_ASSOC);
    if (!$usr) reply(['error' => 'User not found or inactive.'], 404);
    $d->prepare('INSERT INTO department_approvers(department, user_id, approver_name) VALUES(?,?,?)
                 ON DUPLICATE KEY UPDATE is_active = 1, approver_name = VALUES(approver_name)')
      ->execute([$dept, $uid, $usr['full_name']]);
    logActivity($d, $u, 'Assigned department approver', 'department', $dept, $usr['full_name']);
    reply(['ok' => true]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/department-approvers/(\d+)$#', $path, $m)) {
    $u = auth(['Admin']);
    $d = db();
    $q = $d->prepare('SELECT * FROM department_approvers WHERE id = ?');
    $q->execute([$m[1]]);
    $row = $q->fetch(PDO::FETCH_ASSOC);
    if (!$row) reply(['error' => 'Approver mapping not found'], 404);
    $d->prepare('UPDATE department_approvers SET is_active = 0 WHERE id = ?')->execute([$m[1]]);
    logActivity($d, $u, 'Removed department approver', 'department', $row['department'], $row['approver_name']);
    reply(['ok' => true]);
}

// Inventory review: check each request line against warehouse stock.
if ($method === 'GET' && preg_match('#^/api/v1/supply-requests/(\d+)/stock-check$#', $path, $m)) {
    auth();
    $d = db();
    $q = $d->prepare('SELECT * FROM supply_requests WHERE id = ?');
    $q->execute([$m[1]]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) reply(['error' => 'Supply request not found'], 404);
    $iq = $d->prepare('SELECT * FROM supply_request_items WHERE request_id = ?');
    $iq->execute([$r['id']]);
    $lines = [];
    $allOk = true;
    foreach ($iq->fetchAll(PDO::FETCH_ASSOC) as $it) {
        // SUM(quantity) covers both: serialized rows (qty 1 each) and bulk
        // stock rows (qty > 1) — the ledger semantics are unit-level.
        $avail = $d->prepare("SELECT COALESCE(SUM(quantity),0) FROM assets WHERE status = 'In Warehouse' AND deleted_at IS NULL AND archived_at IS NULL AND (name LIKE ? OR category LIKE ?)");
        $avail->execute(['%' . $it['item_name'] . '%', '%' . $it['item_name'] . '%']);
        $stock = (int)$avail->fetchColumn();
        $need = (int)$it['quantity'] - (int)$it['quantity_issued'];
        $ok = $stock >= $need;
        if (!$ok) $allOk = false;
        $lines[] = ['item_id' => (int)$it['id'], 'item_name' => $it['item_name'], 'requested' => (int)$it['quantity'],
                    'issued' => (int)$it['quantity_issued'], 'needed' => $need, 'in_stock' => $stock, 'sufficient' => $ok];
    }
    reply(['request' => $r['request_number'], 'sufficient' => $allOk, 'lines' => $lines]);
}

// Warehouse issuance against a request — assigns real stock to the requester.
if ($method === 'POST' && preg_match('#^/api/v1/supply-requests/(\d+)/issue$#', $path, $m)) {
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $q = $d->prepare('SELECT * FROM supply_requests WHERE id = ?');
    $q->execute([$m[1]]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    if (!$r) reply(['error' => 'Supply request not found'], 404);
    if (!in_array($r['status'], ['For Issuance', 'Partially Issued', 'Approved', 'Inventory Review'], true)) {
        reply(['error' => "Request '{$r['request_number']}' is '{$r['status']}' — it must reach 'For Issuance' before stock can be issued."], 409);
    }
    $items = $x['items'] ?? [];
    if (!is_array($items) || !$items) reply(['error' => 'items[] required: {request_item_id, serials[]}'], 400);

    $d->beginTransaction();
    try {
        $cnt = (int)$d->query("SELECT COUNT(*)+1 FROM issuances WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
        $issNo = 'ISS-' . date('Y') . '-' . str_pad((string)$cnt, 3, '0', STR_PAD_LEFT);
        $d->prepare('INSERT INTO issuances(issuance_number, request_id, issued_to, department, issued_by, issued_by_name, notes) VALUES(?,?,?,?,?,?,?)')
          ->execute([$issNo, $r['id'], $r['requesting_employee'], $r['department'], $u['id'], $u['name'], trim($x['notes'] ?? '')]);
        $issId = (int)$d->lastInsertId();

        $insII = $d->prepare('INSERT INTO issuance_items(issuance_id, request_item_id, asset_id, item_name, quantity, from_zone, from_row) VALUES(?,?,?,?,?,?,?)');
        $updItem = $d->prepare('UPDATE supply_request_items SET quantity_issued = quantity_issued + ? WHERE id = ?');
        $issued = []; $errors = [];

        foreach ($items as $it) {
            $riId = (int)($it['request_item_id'] ?? 0);
            $iq = $d->prepare('SELECT * FROM supply_request_items WHERE id = ? AND request_id = ?');
            $iq->execute([$riId, $r['id']]);
            $ri = $iq->fetch(PDO::FETCH_ASSOC);
            if (!$ri) { $errors[] = "Request item #{$riId} not found on this request."; continue; }
            $serials = $it['serials'] ?? [];
            if (!is_array($serials)) $serials = array_filter(array_map('trim', preg_split('/[\s,]+/', (string)$serials)));
            $bulkQty = (int)($it['quantity'] ?? 0);
            if (!$serials && $bulkQty <= 0) { $errors[] = "'{$ri['item_name']}': give serials (serialized stock) or a quantity (bulk stock)."; continue; }

            $need = (int)$ri['quantity'] - (int)$ri['quantity_issued'];

            // ---- Bulk path: quantity-based stock (no QR serial per unit) ----
            if (!$serials && $bulkQty > 0) {
                if ($bulkQty > $need) { $errors[] = "'{$ri['item_name']}': issuing {$bulkQty} but only {$need} remain requested."; continue; }
                // Draw from matching in-stock rows, largest quantity first —
                // bulk stock rows carry quantity>1; serialized rows qty=1.
                $bq = $d->prepare("SELECT * FROM assets WHERE status = 'In Warehouse' AND deleted_at IS NULL AND archived_at IS NULL AND quantity > 0 AND name LIKE ? ORDER BY quantity DESC");
                $bq->execute(['%' . $ri['item_name'] . '%']);
                $rows = $bq->fetchAll(PDO::FETCH_ASSOC);
                $avail = array_sum(array_map(fn($x) => (int)$x['quantity'], $rows));
                if ($avail < $bulkQty) { $errors[] = "'{$ri['item_name']}': only {$avail} unit(s) in stock, need {$bulkQty}."; continue; }
                $remainingQty = $bulkQty;
                $srcLoc = null; $srcRow = null; $firstAsset = null;
                foreach ($rows as $row) {
                    if ($remainingQty <= 0) break;
                    $take = min((int)$row['quantity'], $remainingQty);
                    $d->prepare('UPDATE assets SET quantity = quantity - ? WHERE id = ?')->execute([$take, $row['id']]);
                    $remainingQty -= $take;
                    if ($firstAsset === null) { $firstAsset = $row['id']; $srcLoc = $row['location']; $srcRow = $row['bin_row']; }
                }
                $insII->execute([$issId, $ri['id'], $firstAsset, $ri['item_name'], $bulkQty, $srcLoc, $srcRow]);
                logMovement($d, 'ISSUE', ['ref_type' => 'issuance', 'ref_id' => $issId, 'ref_label' => $issNo,
                    'asset_id' => $firstAsset, 'item_name' => $ri['item_name'], 'qty_delta' => -$bulkQty,
                    'from_location' => $srcLoc, 'from_row' => $srcRow,
                    'actor_id' => $u['id'], 'actor_name' => $u['name'],
                    'reason' => 'Bulk issue ' . $bulkQty . '× ' . $ri['item_name'] . ' against ' . $r['request_number'] . ' to ' . $r['requesting_employee']]);
                $updItem->execute([$bulkQty, $ri['id']]);
                $issued[] = $ri['item_name'] . ' ×' . $bulkQty;
                continue;
            }

            // ---- Serialized path: one QR serial per unit ----
            if (count($serials) > $need) { $errors[] = "'{$ri['item_name']}': issuing " . count($serials) . " but only {$need} remain requested."; continue; }

            foreach ($serials as $serial) {
                $aq = $d->prepare("SELECT * FROM assets WHERE qr_code = ? AND status = 'In Warehouse' AND deleted_at IS NULL AND archived_at IS NULL");
                $aq->execute([trim($serial)]);
                $a = $aq->fetch(PDO::FETCH_ASSOC);
                if (!$a) { $errors[] = "Serial {$serial} is not available in warehouse stock."; continue; }
                $d->prepare("UPDATE assets SET status = 'Deployed', external_employee_name = ?, assignment_date = CURDATE() WHERE id = ?")
                  ->execute([$r['requesting_employee'], $a['id']]);
                $insII->execute([$issId, $ri['id'], $a['id'], $a['name'], 1, $a['location'], $a['bin_row']]);
                logMovement($d, 'ISSUE', ['ref_type' => 'issuance', 'ref_id' => $issId, 'ref_label' => $issNo,
                    'asset_id' => $a['id'], 'qr_code' => $a['qr_code'], 'item_name' => $a['name'], 'qty_delta' => -1,
                    'from_location' => $a['location'], 'from_row' => $a['bin_row'],
                    'actor_id' => $u['id'], 'actor_name' => $u['name'],
                    'reason' => 'Issued against ' . $r['request_number'] . ' to ' . $r['requesting_employee']]);
                $issued[] = $serial;
            }
            if (count(array_filter($serials, fn($s) => in_array($s, $issued, true))) > 0) {
                $updItem->execute([count(array_filter($serials, fn($s) => in_array($s, $issued, true))), $ri['id']]);
            }
        }

        if (!$issued) { $d->rollBack(); reply(['error' => 'Nothing was issued.', 'line_errors' => $errors], 422); }

        // Recompute request fulfillment.
        $fq = $d->prepare('SELECT COALESCE(SUM(quantity),0) - COALESCE(SUM(quantity_issued),0) FROM supply_request_items WHERE request_id = ?');
        $fq->execute([$r['id']]);
        $remaining = (int)$fq->fetchColumn();
        $newStatus = $remaining <= 0 ? 'Issued' : 'Partially Issued';
        $d->prepare('UPDATE supply_requests SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$newStatus, $r['id']]);
        $d->prepare("UPDATE supply_request_items i SET item_status = CASE WHEN i.quantity_issued >= i.quantity THEN 'Issued' ELSE 'Partial' END WHERE i.request_id = ?")
          ->execute([$r['id']]);

        logActivity($d, $u, 'Issued stock', 'supply_request', $r['request_number'], $issNo . ' — ' . count($issued) . ' unit(s)');
        $d->commit();
        reply(['ok' => true, 'issuance_number' => $issNo, 'issued' => $issued, 'remaining' => $remaining,
               'request_status' => $newStatus, 'line_errors' => $errors]);
    } catch (Exception $e) {
        if ($d->inTransaction()) $d->rollBack();
        reply(['error' => 'Issuance failed: ' . $e->getMessage()], 500);
    }
}

// Stock ledger read view (audit trail of every quantity-affecting event).
if ($method === 'GET' && $path === '/api/v1/stock-movements') {
    auth();
    $d = db();
    $type = trim($_GET['type'] ?? '');
    $sql = 'SELECT * FROM stock_movements';
    $params = [];
    if ($type !== '') { $sql .= ' WHERE movement_type = ?'; $params[] = $type; }
    $sql .= ' ORDER BY created_at DESC LIMIT 200';
    $q = $d->prepare($sql);
    $q->execute($params);
    reply(['movements' => $q->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($method === 'GET' && $path === '/api/v1/procurement/quotes') {
    auth();
    $d = db();
    $quotes = $d->query("SELECT sq.*, r.req_number, v.name AS vendor FROM supplier_quotes sq JOIN requisitions r ON sq.requisition_id=r.id JOIN vendors v ON sq.vendor_id=v.id ORDER BY sq.created_at DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    reply(['quotes' => $quotes]);
}

// --- Suppliers API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/suppliers') {
    auth();
    $d = db();
    // Per-supplier performance metrics (§Supplier Profile): PO count,
    // late deliveries (arrived after expected date), and returns/discrepancies.
    $suppliers = $d->query("SELECT v.*,
            (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id = v.id AND po.deleted_at IS NULL) AS po_count,
            (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id = v.id AND po.expected_delivery IS NOT NULL AND po.arrived_at IS NOT NULL AND po.arrived_at > po.expected_delivery) AS late_deliveries,
            (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id = v.id AND po.status = 'Cancelled') AS discrepancies
        FROM vendors v WHERE v.deleted_at IS NULL AND v.archived_at IS NULL ORDER BY v.rating DESC")->fetchAll(PDO::FETCH_ASSOC);
    reply(['suppliers' => $suppliers]);
}

if ($method === 'POST' && $path === '/api/v1/suppliers') {
    auth(['Admin', 'Manager']);
    $x = body();
    $q = db()->prepare('INSERT INTO vendors(name, email, phone, address, category, status, auto_approve, tax_compliant, anti_bribery_clear, certs, coi_expiry, contract_ref) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    $q->execute([$x['name'], $x['email'], $x['phone'], $x['address'], $x['category'],
        $x['status'] ?? 'Active', !empty($x['auto_approve']) ? 1 : 0,
        !empty($x['tax_compliant']) ? 1 : 0, !empty($x['anti_bribery_clear']) ? 1 : 0,
        $x['certs'] ?? null, $x['coi_expiry'] ?? null, $x['contract_ref'] ?? null]);
    reply(['id' => db()->lastInsertId()], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/suppliers/(\d+)$#', $path, $m)) {
    auth();
    $q = db()->prepare('SELECT * FROM vendors WHERE id = ?');
    $q->execute([$m[1]]);
    $s = $q->fetch(PDO::FETCH_ASSOC);
    reply($s ?: ['error' => 'Supplier not found'], $s ? 200 : 404);
}

if ($method === 'PUT' && preg_match('#^/api/v1/suppliers/(\d+)$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();

    $updateFields = [];
    $params = [];

    foreach (['name', 'email', 'phone', 'address', 'category', 'status', 'certs', 'coi_expiry', 'contract_ref',
              'contract_expiry', 'verification_status', 'onboarding_stage'] as $field) {
        if (array_key_exists($field, $x)) {
            $updateFields[] = $field . ' = ?';
            $params[] = $x[$field];
        }
    }

    if (array_key_exists('lead_time_days', $x)) {
        $updateFields[] = 'lead_time_days = ?';
        $params[] = $x['lead_time_days'] !== null ? (int)$x['lead_time_days'] : null;
    }

    if (array_key_exists('on_time_rate', $x)) {
        $updateFields[] = 'on_time_rate = ?';
        $params[] = $x['on_time_rate'];
    }

    if (array_key_exists('defect_rate', $x)) {
        $updateFields[] = 'defect_rate = ?';
        $params[] = $x['defect_rate'];
    }

    if (array_key_exists('rating', $x)) {
        $updateFields[] = 'rating = ?';
        $params[] = $x['rating'];
    }

    foreach (['auto_approve', 'tax_compliant', 'anti_bribery_clear'] as $flag) {
        if (array_key_exists($flag, $x)) {
            $updateFields[] = $flag . ' = ?';
            $params[] = !empty($x[$flag]) ? 1 : 0;
        }
    }

    if (empty($updateFields)) {
        reply(['error' => 'No fields to update'], 400);
    }

    $params[] = $m[1];
    $d->prepare('UPDATE vendors SET ' . implode(', ', $updateFields) . ' WHERE id = ?')->execute($params);

    reply(['ok' => true]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/suppliers/(\d+)$#', $path, $m)) {
    auth(['Admin']);
    $d = db();
    $q = $d->prepare('SELECT id, name FROM vendors WHERE id = ?');
    $q->execute([$m[1]]);
    $v = $q->fetch(PDO::FETCH_ASSOC);
    if (!$v) {
        reply(['error' => 'Supplier not found.'], 404);
    }
    // Protect order history: vendors referenced by purchase orders cannot be removed
    $poCount = (int)$d->query('SELECT COUNT(*) FROM purchase_orders WHERE vendor_id = ' . (int)$v['id'])->fetchColumn();
    if ($poCount > 0) {
        reply(['error' => "Cannot delete {$v['name']} — {$poCount} purchase order(s) reference this vendor. Disable the account instead to preserve order history."], 409);
    }
    $d->prepare('DELETE FROM supplier_quotes WHERE vendor_id = ?')->execute([$v['id']]);
    $d->prepare('DELETE FROM vendors WHERE id = ?')->execute([$v['id']]);
    reply(['ok' => true]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/vendors/(\d+)$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();

    $updateFields = [];
    $params = [];

    foreach (['name', 'email', 'phone', 'address', 'category', 'status', 'certs', 'coi_expiry', 'contract_ref',
              'contract_expiry', 'verification_status', 'onboarding_stage'] as $field) {
        if (array_key_exists($field, $x)) {
            $updateFields[] = $field . ' = ?';
            $params[] = $x[$field];
        }
    }

    if (array_key_exists('lead_time_days', $x)) {
        $updateFields[] = 'lead_time_days = ?';
        $params[] = $x['lead_time_days'] !== null ? (int)$x['lead_time_days'] : null;
    }

    if (array_key_exists('on_time_rate', $x)) {
        $updateFields[] = 'on_time_rate = ?';
        $params[] = $x['on_time_rate'];
    }

    if (array_key_exists('defect_rate', $x)) {
        $updateFields[] = 'defect_rate = ?';
        $params[] = $x['defect_rate'];
    }

    if (array_key_exists('rating', $x)) {
        $updateFields[] = 'rating = ?';
        $params[] = $x['rating'];
    }

    foreach (['auto_approve', 'tax_compliant', 'anti_bribery_clear'] as $flag) {
        if (array_key_exists($flag, $x)) {
            $updateFields[] = $flag . ' = ?';
            $params[] = !empty($x[$flag]) ? 1 : 0;
        }
    }

    if (empty($updateFields)) {
        reply(['error' => 'No fields to update'], 400);
    }

    $params[] = $m[1];
    $d->prepare('UPDATE vendors SET ' . implode(', ', $updateFields) . ' WHERE id = ?')->execute($params);

    reply(['ok' => true]);
}

// --- Purchase Orders API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/pos') {
    auth();
    $d = db();
    $pos = $d->query('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id=v.id WHERE po.deleted_at IS NULL AND po.archived_at IS NULL ORDER BY po.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['pos' => $pos]);
}

if ($method === 'POST' && $path === '/api/v1/pos') {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $po_count = (int)$d->query("SELECT COUNT(*)+1 FROM purchase_orders WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $po_number='PO-'.date('Y').'-'.str_pad((string)$po_count,3,'0',STR_PAD_LEFT);    $vendor_id = $x['vendor_id'] ?? null;
    $vendor_name = $x['vendor'] ?? 'Unknown';
    $autoApprove = false;

    if ($vendor_id) {
        $v = $d->prepare('SELECT name, auto_approve FROM vendors WHERE id = ?');
        $v->execute([$vendor_id]);
        $vrow = $v->fetch(PDO::FETCH_ASSOC);
        $vendor_name = $vrow['name'] ?? 'Unknown';
        // Pre-cleared purchasing (§6): a trusted vendor's flag lets the PO
        // go straight to the supplier without manual procurement review.
        $autoApprove = (int)($vrow['auto_approve'] ?? 0) === 1;
    }

    $initialStatus = $autoApprove ? 'Sent to Vendor' : 'Draft';
    // v6: normalize items into real PO line rows. Accepts a structured array
    // [{item_name, quantity, unit_price}] or legacy free text — free text is
    // split per line so the item table is always populated.
    $itemsArr = [];
    if (is_array($x['items'] ?? null)) {
        foreach ($x['items'] as $it) {
            $nm = trim($it['item_name'] ?? $it['name'] ?? '');
            if ($nm === '') continue;
            $itemsArr[] = ['item_name' => $nm,
                           'quantity'   => max(1, (int)($it['quantity'] ?? $it['qty'] ?? 1)),
                           'unit_price' => (float)($it['unit_price'] ?? $it['price'] ?? 0)];
        }
    } else {
        foreach (preg_split('/[\r\n]+/', (string)($x['items'] ?? '')) as $line) {
            $line = trim($line, " \t-,•");
            if ($line === '') continue;
            $qty = 1;
            if (preg_match('/^(.*?)\s*[x×]\s*(\d+)\s*$/i', $line, $mm)) { $line = trim($mm[1]); $qty = (int)$mm[2]; }
            $itemsArr[] = ['item_name' => $line, 'quantity' => max(1, $qty), 'unit_price' => 0.0];
        }
    }
    $itemsText = implode("\n", array_map(fn($i) => $i['item_name'] . ' x' . $i['quantity'], $itemsArr));

    $q = $d->prepare('INSERT INTO purchase_orders(po_number, vendor_id, vendor, items, total, status, expected_delivery, notes, supply_request_id) VALUES(?,?,?,?,?,?,?,?,?)');
    $q->execute([$po_number, $vendor_id, $vendor_name, $itemsText, $x['total'], $initialStatus, $x['expected_delivery'], $x['notes'], $x['supply_request_id'] ?? null]);
    $po_id = $d->lastInsertId();

    $qi = $d->prepare('INSERT INTO purchase_order_items(po_id, item_name, quantity, unit_price) VALUES(?,?,?,?)');
    foreach ($itemsArr as $it) $qi->execute([$po_id, $it['item_name'], $it['quantity'], $it['unit_price']]);

    // If this PO was raised from a supply request, mark the request lines as
    // being procured so the request trace stays intact.
    if (!empty($x['supply_request_id'])) {
        $d->prepare("UPDATE supply_requests SET status = 'In Procurement', updated_at = NOW() WHERE id = ? AND status IN ('Approved','Inventory Review','For Issuance')")
          ->execute([(int)$x['supply_request_id']]);
        $d->prepare("UPDATE supply_request_items SET po_id = ? WHERE request_id = ?")
          ->execute([$po_id, (int)$x['supply_request_id']]);
    }

    // TRD §4: a settlement receipt is generated at order creation and
    // routes to Settlements; physical verification upgrades it to AP.
    $d->prepare('INSERT INTO finance_settlements(po_id, po_number, vendor_id, vendor_name, amount, status) VALUES(?,?,?,?,?,?)')
      ->execute([$po_id, $po_number, $vendor_id, $vendor_name, (float)($x['total'] ?? 0), 'Awaiting Delivery']);

    $createNote = 'Purchase order created by ' . auth()['name'];
    if ($autoApprove) {
        $createNote .= ' — auto-approved and sent to vendor (pre-cleared purchasing)';
        $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?,?,?)')
          ->execute([$po_id, 'Sent to Vendor', 'Auto-PO approval: pre-cleared supplier ' . $vendor_name]);
    }
    $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?,?,?)')
      ->execute([$po_id, 'Created', $createNote]);
    logActivity($d, auth(), 'Created purchase order', 'purchase_order', $po_number, '₱' . number_format((float)($x['total'] ?? 0), 2) . ' to ' . $vendor_name);

    reply(['id' => $po_id, 'po_number' => $po_number], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/pos/(\d+)$#', $path, $m)) {
    auth();
    $d = db();
    $q = $d->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id=v.id WHERE po.id = ?');
    $q->execute([$m[1]]);
    $po = $q->fetch(PDO::FETCH_ASSOC);
    if (!$po) reply(['error' => 'PO not found'], 404);
    $iq = $d->prepare('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id');
    $iq->execute([$m[1]]);
    $po['line_items'] = $iq->fetchAll(PDO::FETCH_ASSOC);
    $rq = $d->prepare('SELECT * FROM goods_receipts WHERE po_id = ? ORDER BY created_at DESC');
    $rq->execute([$m[1]]);
    $po['receipts'] = $rq->fetchAll(PDO::FETCH_ASSOC);
    $po['allowed_transitions'] = poAllowedTransitions($po['status']);
    reply($po);
}

// Item-level receiving history for a PO.
if ($method === 'GET' && preg_match('#^/api/v1/pos/(\d+)/receipts$#', $path, $m)) {
    auth();
    $d = db();
    $rq = $d->prepare('SELECT * FROM goods_receipts WHERE po_id = ? ORDER BY created_at DESC');
    $rq->execute([$m[1]]);
    $receipts = $rq->fetchAll(PDO::FETCH_ASSOC);
    $iq = $d->prepare('SELECT * FROM goods_receipt_items WHERE receipt_id = ? ORDER BY id');
    foreach ($receipts as &$r) { $iq->execute([$r['id']]); $r['items'] = $iq->fetchAll(PDO::FETCH_ASSOC); }
    reply(['receipts' => $receipts]);
}

// ==========================================================================
// STRUCTURED GOODS RECEIPT (v6): PO → Goods Receipt → Items → Stock Movement
// Receiving is a real transaction — item-level quantities, condition,
// receiver identity, PO line references, serials, and audit. Over-receiving
// against a PO line is rejected. Partial deliveries leave the PO in
// 'Partially Received' until the ordered quantities are fulfilled.
// ==========================================================================
if ($method === 'POST' && preg_match('#^/api/v1/pos/(\d+)/receive$#', $path, $m)) {
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $pq = $d->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.id = ? AND po.deleted_at IS NULL');
    $pq->execute([$m[1]]);
    $po = $pq->fetch(PDO::FETCH_ASSOC);
    if (!$po) reply(['error' => 'Purchase order not found.'], 404);
    if (!in_array($po['status'], ['Sent to Vendor', 'Shipped', 'Arrived', 'Ordered', 'Partially Received'], true)) {
        reply(['error' => "PO {$po['po_number']} is '{$po['status']}' — it is not in a receivable state."], 409);
    }

    $items = $x['items'] ?? [];
    if (!is_array($items) || !$items) reply(['error' => 'items[] is required — receiving is item-level.'], 400);

    // Load the contract lines for validation (id → row, name → row).
    $lq = $d->prepare('SELECT * FROM purchase_order_items WHERE po_id = ?');
    $lq->execute([$po['id']]);
    $lines = $lq->fetchAll(PDO::FETCH_ASSOC);
    $lineById = []; $lineByName = [];
    foreach ($lines as $l) { $lineById[$l['id']] = $l; $lineByName[strtolower(trim($l['item_name']))] = $l; }

    $d->beginTransaction();
    try {
        $grCount = (int)$d->query("SELECT COUNT(*)+1 FROM goods_receipts WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
        $grNumber = 'GR-' . date('Y') . '-' . str_pad((string)$grCount, 3, '0', STR_PAD_LEFT);
        $d->prepare('INSERT INTO goods_receipts(gr_number, po_id, received_by, received_by_name, notes) VALUES(?,?,?,?,?)')
          ->execute([$grNumber, $po['id'], $u['id'], $u['name'], trim($x['notes'] ?? '')]);
        $receiptId = (int)$d->lastInsertId();

        $insItem = $d->prepare('INSERT INTO goods_receipt_items(receipt_id, po_item_id, item_name, quantity, item_condition, zone, bin_row, serials) VALUES(?,?,?,?,?,?,?,?)');
        $updLine = $d->prepare('UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE id = ?');
        $errors = [];
        $receivedLines = [];

        foreach ($items as $it) {
            $qty = (int)($it['quantity'] ?? $it['qty'] ?? $it['quantity_received'] ?? 0);
            $name = trim($it['item_name'] ?? $it['name'] ?? '');
            $line = null;
            if (!empty($it['po_item_id']) && isset($lineById[(int)$it['po_item_id']])) $line = $lineById[(int)$it['po_item_id']];
            elseif ($name !== '' && isset($lineByName[strtolower($name)])) $line = $lineByName[strtolower($name)];
            if ($line && $name === '') $name = $line['item_name'];
            if ($name === '' || $qty <= 0) { $errors[] = 'Each receipt line needs an item name and a positive quantity.'; continue; }

            // Over-receiving guard: cumulative receipts may not exceed the
            // contracted line quantity.
            if ($line) {
                $remaining = (int)$line['quantity'] - (int)$line['quantity_received'];
                if ($qty > $remaining) {
                    $errors[] = "Over-receipt blocked for '{$name}': ordered {$line['quantity']}, already received {$line['quantity_received']}, attempted {$qty}.";
                    continue;
                }
            }

            $cond = trim($it['condition'] ?? 'Good') ?: 'Good';
            [$zn, $rw] = [null, null];
            if (!empty($it['zone'])) { [$zn, $rw] = normalizeZoneRow($d, $it['zone'], $it['bin_row'] ?? null); }
            $serials = $it['serials'] ?? [];
            if (!is_array($serials)) $serials = array_filter(array_map('trim', preg_split('/[\s,]+/', (string)$serials)));

            $insItem->execute([$receiptId, $line ? $line['id'] : null, $name, $qty, $cond, $zn, $rw, $serials ? json_encode(array_values($serials)) : null]);
            $receiptItemId = (int)$d->lastInsertId();
            if ($line) { $updLine->execute([$qty, $line['id']]); $line['quantity_received'] += $qty; }

            // Serialized goods: each scanned serial commits to stock.
            $linked = 0;
            foreach ($serials as $serial) {
                $serial = trim((string)$serial);
                if ($serial === '') continue;
                $aq = $d->prepare('SELECT * FROM assets WHERE qr_code = ?');
                $aq->execute([$serial]);
                $a = $aq->fetch(PDO::FETCH_ASSOC);
                $loc = $zn ?: ($a['location'] ?? 'Receiving Dock');
                if ($a) {
                    // Re-receiving a serial revives it fully — clear any
                    // soft-delete/archive tombstone or it stays invisible.
                    $d->prepare('UPDATE assets SET status = ?, location = ?, bin_row = ?, po_id = ?, receipt_id = ?, deleted_at = NULL, archived_at = NULL WHERE id = ?')
                      ->execute(['In Warehouse', $loc, $rw ?: ($a['bin_row'] ?? null), $po['id'], $receiptId, $a['id']]);
                    $linked++;
                    logMovement($d, 'RECEIPT', ['ref_type' => 'goods_receipt', 'ref_id' => $receiptId, 'ref_label' => $grNumber,
                        'asset_id' => $a['id'], 'qr_code' => $serial, 'item_name' => $name, 'qty_delta' => 1,
                        'to_location' => $loc, 'to_row' => $rw, 'actor_id' => $u['id'], 'actor_name' => $u['name'],
                        'reason' => 'PO receipt ' . $po['po_number'] . ' (' . $cond . ')']);
                } else {
                    // Unknown serial — register it with PO provenance.
                    $d->prepare('INSERT INTO assets(qr_code, name, category, value, status, location, bin_row, po_id, receipt_id) VALUES(?,?,?,?,?,?,?,?,?)')
                      ->execute([$serial, $name, $it['category'] ?? 'IT Equipment', (float)($it['unit_price'] ?? 0), 'In Warehouse', $loc, $rw, $po['id'], $receiptId]);
                    $newId = (int)$d->lastInsertId();
                    $linked++;
                    logMovement($d, 'RECEIPT', ['ref_type' => 'goods_receipt', 'ref_id' => $receiptId, 'ref_label' => $grNumber,
                        'asset_id' => $newId, 'qr_code' => $serial, 'item_name' => $name, 'qty_delta' => 1,
                        'to_location' => $loc, 'to_row' => $rw, 'actor_id' => $u['id'], 'actor_name' => $u['name'],
                        'reason' => 'PO receipt ' . $po['po_number'] . ' (' . $cond . ')']);
                }
            }
            // Bulk remainder: non-serialized quantity lands on a bulk stock
            // row (assets.quantity is the on-hand count for consumables) and
            // writes a RECEIPT movement.
            $bulk = $qty - $linked;
            if ($bulk > 0) {
                $bulkAssetId = null;
                $bq = $d->prepare("SELECT id, location, bin_row FROM assets WHERE status = 'In Warehouse' AND name = ? AND (quantity > 1 OR qr_code LIKE 'BULK-%') AND deleted_at IS NULL ORDER BY quantity DESC LIMIT 1");
                $bq->execute([$name]);
                $existing = $bq->fetch(PDO::FETCH_ASSOC);
                if ($existing) {
                    $d->prepare('UPDATE assets SET quantity = quantity + ? WHERE id = ?')->execute([$bulk, $existing['id']]);
                    $bulkAssetId = (int)$existing['id'];
                    $zn = $zn ?: $existing['location'];
                    $rw = $rw ?: $existing['bin_row'];
                } else {
                    // Create the bulk stock row with a generated bulk code so
                    // it can still be scanned as a box/bin label if needed.
                    $bulkQr = 'BULK-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name), 0, 12)) . '-' . strtoupper(substr(uniqid(), -5));
                    $cat = trim($it['category'] ?? '') ?: 'Office Supplies';
                    $loc = $zn ?: (zoneForCategory($d, $cat) ?: 'Receiving Dock');
                    $d->prepare('INSERT INTO assets(qr_code, name, category, value, status, location, bin_row, quantity, po_id, receipt_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
                      ->execute([$bulkQr, $name, $cat, (float)($it['unit_price'] ?? 0), 'In Warehouse', $loc, $rw, $bulk, $po['id'], $receiptId]);
                    $bulkAssetId = (int)$d->lastInsertId();
                }
                logMovement($d, 'RECEIPT', ['ref_type' => 'goods_receipt', 'ref_id' => $receiptId, 'ref_label' => $grNumber,
                    'asset_id' => $bulkAssetId, 'item_name' => $name, 'qty_delta' => $bulk,
                    'to_location' => $zn, 'to_row' => $rw, 'actor_id' => $u['id'], 'actor_name' => $u['name'],
                    'reason' => 'PO receipt ' . $po['po_number'] . ' (' . $cond . ')']);
            }
            $receivedLines[] = ['item' => $name, 'qty' => $qty, 'condition' => $cond];
        }

        if (!$receivedLines) { $d->rollBack(); reply(['error' => 'Nothing was received.', 'line_errors' => $errors], 422); }

        // Recompute PO receipt state from the contract lines.
        $tot = $d->prepare('SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(quantity_received),0) FROM purchase_order_items WHERE po_id = ?');
        $tot->execute([$po['id']]);
        [$ordered, $received] = array_map('intval', $tot->fetch(PDO::FETCH_NUM));
        $newStatus = ($ordered > 0 && $received >= $ordered) ? 'Fully Received' : 'Partially Received';
        $d->prepare('UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$newStatus, $po['id']]);

        $detail = 'Goods receipt ' . $grNumber . ': ' . implode('; ', array_map(fn($l) => "{$l['item']} ×{$l['qty']} ({$l['condition']})", $receivedLines)) . ' — received by ' . $u['name'];
        if ($errors) $detail .= '. Skipped lines: ' . implode(' | ', $errors);
        $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)')->execute([$po['id'], $newStatus, $detail]);
        logActivity($d, $u, 'Goods receipt posted', 'purchase_order', $po['po_number'], $grNumber . ' — ' . $newStatus);

        // Fully received → forward settlement to AP and re-open any linked
        // supply request for issuance.
        if ($newStatus === 'Fully Received') {
            $po['status'] = $newStatus;
            forwardToFinance($d, $po);
            if (!empty($po['supply_request_id'])) {
                $d->prepare("UPDATE supply_requests SET status = 'For Issuance', stock_status = 'Received via PO {$po['po_number']}', updated_at = NOW() WHERE id = ? AND status = 'In Procurement'")
                  ->execute([$po['supply_request_id']]);
            }
        }

        $d->commit();
        reply(['ok' => true, 'gr_number' => $grNumber, 'receipt_id' => $receiptId, 'po_status' => $newStatus,
               'ordered' => $ordered, 'received' => $received, 'line_errors' => $errors,
               'po_number' => $po['po_number'], 'qr_payload' => $po['po_number']]);
    } catch (Exception $e) {
        if ($d->inTransaction()) $d->rollBack();
        reply(['error' => 'Receipt failed: ' . $e->getMessage()], 500);
    }
}



if ($method === 'GET' && $path === '/api/v1/pos/activity') {
    auth();
    $d = db();
    $activity = $d->query("SELECT pa.*, po.po_number FROM po_activity pa JOIN purchase_orders po ON pa.po_id=po.id ORDER BY pa.created_at DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    reply(['activities' => $activity]);
}

// ==========================================================================
// BLUEPRINT: INBOUND DELIVERY SIMULATION (Digital Twin, §4)
// Operator simulates a supplier shipment arrival: the PO mutates to ARRIVED
// and serialized placeholder assets are staged as 'Inbound/Receiving'.
// ==========================================================================
if ($method === 'POST' && preg_match('#^/api/v1/pos/(\d+)/simulate-arrival$#', $path, $m)) {
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $d = db();
    $pq = $d->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.id = ?');
    $pq->execute([$m[1]]);
    $po = $pq->fetch(PDO::FETCH_ASSOC);
    if (!$po) reply(['error' => 'Purchase order not found.'], 404);
    if ($po['status'] === 'Arrived') {
        reply(['error' => "PO {$po['po_number']} already arrived — its assets are staged in receiving."], 409);
    }
    if (!in_array($po['status'], ['Sent to Vendor', 'Ordered', 'Shipped'], true)) {
        reply(['error' => "PO {$po['po_number']} is '{$po['status']}' — simulate arrival only after the order is sent to the vendor."], 409);
    }

    // Resolve line items: prefer the normalized table, fall back to the
    // freeform items text recorded on the PO.
    $iq = $d->prepare('SELECT item_name, quantity, unit_price FROM purchase_order_items WHERE po_id = ?');
    $iq->execute([$po['id']]);
    $items = $iq->fetchAll(PDO::FETCH_ASSOC);
    if (!$items) {
        $decoded = json_decode((string)$po['items'], true);
        if (is_array($decoded) && $decoded) {
            $items = array_map(fn($it) => [
                'item_name' => $it['item_name'] ?? $it['name'] ?? 'Ordered Item',
                'quantity'  => max(1, (int)($it['quantity'] ?? $it['qty'] ?? 1)),
                'unit_price'=> (float)($it['unit_price'] ?? $it['price'] ?? 0),
            ], $decoded);
        } else {
            $lines = array_filter(array_map('trim', preg_split('/[\r\n,]+/', (string)$po['items'])));
            if (!$lines) $lines = ['Ordered Items'];
            $items = array_map(fn($ln) => ['item_name' => substr($ln, 0, 120), 'quantity' => 1, 'unit_price' => 0], $lines);
        }
    }

    $serials = [];
    $d->beginTransaction();
    try {
        $d->prepare("UPDATE purchase_orders SET status = 'Arrived', arrived_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([$po['id']]);
        foreach ($items as $it) {
            for ($i = 0; $i < (int)$it['quantity']; $i++) {
                $serial = genAssetSerial($d, $it['item_name']);
                $d->prepare("INSERT INTO assets(qr_code, name, category, value, status, location) VALUES(?,?,?,?,?,'Inbound/Receiving')")
                  ->execute([$serial, $it['item_name'], 'IT Equipment', (float)$it['unit_price'], 'Receiving Dock']);
                $serials[] = $serial;
            }
        }
        $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)')
          ->execute([$po['id'], 'Arrived (Simulated)', count($serials) . ' serialized assets staged at Receiving Dock by ' . $u['name']]);
        $d->prepare('INSERT INTO integration_audit_log(external_system, action, entity_type, entity_id, request_data, status) VALUES(?,?,?,?,?,?)')
          ->execute(['Supplier Shipment Simulator', 'Inbound Arrival', 'purchase_order', $po['id'],
                     json_encode(['po_number' => $po['po_number'], 'serials' => $serials]), 'Success']);
        $d->commit();
    } catch (Exception $e) {
        $d->rollBack();
        reply(['error' => 'Arrival simulation failed.'], 500);
    }
    reply(['ok' => true, 'po_number' => $po['po_number'], 'status' => 'Arrived', 'serials' => $serials, 'count' => count($serials)]);
}

// ==========================================================================
// BLUEPRINT: QR SERIAL BATCH GENERATION (§5.2)
// Generates serialized placeholder assets ready for print-and-scan.
// ==========================================================================
if ($method === 'POST' && $path === '/api/v1/assets/generate-batch') {
    $u = auth(['Admin', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $name = substr(trim($x['name'] ?? ''), 0, 120);
    $category = substr(trim($x['category'] ?? 'IT Equipment'), 0, 60) ?: 'IT Equipment';
    $qty = min(50, max(1, (int)($x['quantity'] ?? 1)));
    if ($name === '') reply(['error' => 'Item name is required.'], 400);
    // §3: each serial's static attributes are fixed at generation — the
    // destination zone, purchase date, and lifespan auto-populate from the
    // item's category mapping instead of a manual form.
    $location = zoneForCategory($d, $category) ?: 'Receiving Dock';
    $datePurchased = date('Y-m-d');
    $lifespan = lifespanForCategory($category);
    $value = is_numeric($x['value'] ?? null) ? (float)$x['value'] : 0.0;
    $specs = trim((string)($x['specs'] ?? '')) ?: null;
    $thresh = ($x['low_stock_threshold'] ?? '') === '' ? null : (int)$x['low_stock_threshold'];
    $serials = [];
    for ($i = 0; $i < $qty; $i++) {
        $serial = genAssetSerial($d, $category);
        // Pending-only: serials are staged as Awaiting Print and only commit
        // to active inventory after a physical intake scan.
        $d->prepare("INSERT INTO assets(qr_code, name, category, value, status, location, quantity, low_stock_threshold, date_purchased, lifespan_months, specs) VALUES(?,?,?,?,'Awaiting Print',?,1,?,?,?,?)")
          ->execute([$serial, $name, $category, $value, $location, $thresh, $datePurchased, $lifespan, $specs]);
        $serials[] = $serial;
    }
    logActivity($d, $u, 'Generated serial batch', 'asset', $name, "$qty serials for $location");
    reply(['ok' => true, 'serials' => $serials, 'count' => count($serials), 'destination' => $location], 201);
}

// ==========================================================================
// BLUEPRINT: OUTBOUND DATA STREAM READ MODELS (§3.2, §3.3)
// ==========================================================================
if ($method === 'GET' && $path === '/api/v1/finance-settlements') {
    auth(['Admin', 'Manager']);
    reply(['items' => db()->query('SELECT * FROM finance_settlements ORDER BY created_at DESC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($method === 'GET' && $path === '/api/v1/clearances') {
    auth(['Admin', 'Manager']);
    $d = db();
    $tokens = $d->query('SELECT * FROM clearance_tokens ORDER BY created_at DESC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC);
    $checklist = $d->query("SELECT external_employee_name AS employee, COUNT(*) AS unreturned,
            GROUP_CONCAT(CONCAT(name, ' (', qr_code, ')') SEPARATOR ' | ') AS items
            FROM assets WHERE status = 'Deployed' AND external_employee_name IS NOT NULL AND external_employee_name != ''
            GROUP BY external_employee_name ORDER BY unreturned DESC")->fetchAll(PDO::FETCH_ASSOC);
    reply(['tokens' => $tokens, 'checklist' => $checklist]);
}

if ($method === 'GET' && $path === '/api/v1/sync-status') {
    auth();
    $d = db();
    $row = fn($sql) => $d->query($sql)->fetch(PDO::FETCH_ASSOC);
    $c2 = $row("SELECT COUNT(*) total, SUM(status='Pending') pending, MAX(created_at) last FROM equipment_requests");
    $c3 = $row('SELECT COUNT(*) total, MAX(issued_at) last FROM clearance_tokens');
    $fin = $row('SELECT COUNT(*) total, MAX(created_at) last FROM finance_settlements');
    $audit = $row('SELECT COUNT(*) total, MAX(created_at) last FROM integration_audit_log');
    $scans = $row('SELECT COUNT(*) total, MAX(created_at) last FROM scan_logs');
    reply(['streams' => [
        ['system' => 'Core 2 — Employee Info (HRIS)', 'direction' => 'Inbound', 'total' => (int)$c2['total'], 'pending' => (int)$c2['pending'], 'last_activity' => $c2['last']],
        ['system' => 'Core 3 — Exit Clearance', 'direction' => 'Outbound', 'total' => (int)$c3['total'], 'pending' => 0, 'last_activity' => $c3['last']],
        ['system' => 'Financial Mgmt — Accounts Payable', 'direction' => 'Outbound', 'total' => (int)$fin['total'], 'pending' => 0, 'last_activity' => $fin['last']],
        ['system' => 'BI / Data Aggregation', 'direction' => 'Outbound', 'total' => (int)$audit['total'], 'pending' => 0, 'last_activity' => $audit['last']],
        ['system' => 'QR Scan Engine', 'direction' => 'Internal', 'total' => (int)$scans['total'], 'pending' => 0, 'last_activity' => $scans['last']],
    ]]);
}

if ($method === 'GET' && $path === '/api/v1/stock-alerts') {
    auth();
    $d = db();
    // Only active committed stock counts — pending, archived, and binned
    // rows can never trigger a low-stock alert (TRD §2/§3). A category with
    // no tracked assets at all is not a deficit either.
    $alerts = $d->query("SELECT t.category, t.min_quantity,
            (SELECT COUNT(*) FROM assets a WHERE a.category = t.category AND a.status = 'In Warehouse' AND a.deleted_at IS NULL AND a.archived_at IS NULL) AS on_hand
            FROM stock_thresholds t
            WHERE EXISTS (SELECT 1 FROM assets x WHERE x.category = t.category AND x.deleted_at IS NULL AND x.archived_at IS NULL)
            ORDER BY on_hand / t.min_quantity")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($alerts as &$al) {
        $al['on_hand'] = (int)$al['on_hand'];
        $al['min_quantity'] = (int)$al['min_quantity'];
        $al['deficit'] = $al['on_hand'] < $al['min_quantity'];
    }
    // Per-asset threshold alerts, grouped by asset name so repeat serials
    // collapse into one row (deficit_qty = sum of units below the threshold).
    $assetAlerts = $d->query("SELECT name, category,
            SUM(quantity) AS on_hand, MAX(low_stock_threshold) AS min_quantity,
            COUNT(*) AS serials
            FROM assets
            WHERE deleted_at IS NULL AND archived_at IS NULL AND status = 'In Warehouse'
              AND low_stock_threshold IS NOT NULL
            GROUP BY name, category
            HAVING SUM(quantity) < MAX(low_stock_threshold)
            ORDER BY SUM(quantity) / MAX(low_stock_threshold)")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($assetAlerts as &$aa) {
        $aa['on_hand'] = (int)$aa['on_hand'];
        $aa['min_quantity'] = (int)$aa['min_quantity'];
        $aa['serials'] = (int)$aa['serials'];
        $aa['deficit'] = true;
    }
    reply(['items' => $alerts, 'asset_items' => $assetAlerts]);
}

// --- Equipment Requests API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/equipment-requests') {
    auth(['Admin', 'Manager']);
    $d = db();
    $requests = $d->query('SELECT er.*, si.system_name, si.system_type 
                           FROM equipment_requests er 
                           LEFT JOIN system_integrations si ON er.requesting_system = si.system_name 
                           ORDER BY er.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['requests' => $requests]);
}

if ($method === 'GET' && preg_match('#^/api/v1/equipment-requests/([^/]+)$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $d = db();
    $q = $d->prepare('SELECT er.*, si.system_name, si.system_type 
                      FROM equipment_requests er 
                      LEFT JOIN system_integrations si ON er.requesting_system = si.system_name 
                      WHERE er.request_number = ?');
    $q->execute([$m[1]]);
    $request = $q->fetch(PDO::FETCH_ASSOC);
    reply($request ?: ['error' => 'Equipment request not found'], $request ? 200 : 404);
}

if ($method === 'PUT' && preg_match('#^/api/v1/equipment-requests/([^/]+)/status$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $u = auth();
    
    $updateFields = ['status = ?'];
    $params = [$x['status'] ?? 'Pending'];
    
    if (!empty($x['rejection_reason'])) {
        $updateFields[] = 'rejection_reason = ?';
        $params[] = $x['rejection_reason'];
    }
    
    if (!empty($x['notes'])) {
        $updateFields[] = 'notes = ?';
        $params[] = $x['notes'];
    }
    
    if ($x['status'] === 'Approved') {
        $updateFields[] = 'approved_by = ?';
        $updateFields[] = 'approved_date = NOW()';
        $params[] = $u['id'];
    }
    
    if ($x['status'] === 'Fulfilled') {
        $updateFields[] = 'fulfilled_date = NOW()';
    }
    
    $params[] = $m[1];
    
    $d->prepare('UPDATE equipment_requests SET ' . implode(', ', $updateFields) . ' WHERE request_number = ?')
      ->execute($params);
    
    // Get request ID for activity logging
    $requestIdQuery = $d->prepare('SELECT id FROM equipment_requests WHERE request_number = ?');
    $requestIdQuery->execute([$m[1]]);
    $requestId = $requestIdQuery->fetchColumn();
    
    // Log activity
    $d->prepare('CALL log_equipment_request_activity(?, ?, ?, ?, ?)')
      ->execute([$requestId, 'Status Updated', 'Status changed to ' . ($x['status'] ?? 'Pending'), $u['name'], null]);
    
    reply(['ok' => true]);
}

if ($method === 'POST' && preg_match('#^/api/v1/equipment-requests/([^/]+)/fulfill$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $u = auth();
    
    // Get request ID
    $requestIdQuery = $d->prepare('SELECT id FROM equipment_requests WHERE request_number = ?');
    $requestIdQuery->execute([$m[1]]);
    $requestId = $requestIdQuery->fetchColumn();
    
    if (!$requestId) {
        reply(['error' => 'Equipment request not found'], 404);
    }
    
    // Process assignments
    if (!empty($x['assignments'])) {
        foreach ($x['assignments'] as $assignment) {
            // Validate QR code
            $qrQuery = $d->prepare('SELECT id, name FROM assets WHERE qr_code = ?');
            $qrQuery->execute([$assignment['qr_code']]);
            $asset = $qrQuery->fetch(PDO::FETCH_ASSOC);
            
            if ($asset) {
                // Update asset status
                $d->prepare('UPDATE assets SET status = "Deployed" WHERE id = ?')
                  ->execute([$asset['id']]);
                
                // Create request item
                $d->prepare('INSERT INTO equipment_request_items (request_id, category, specifications, quantity, assigned_asset_id, assigned_qr_code, fulfillment_status, fulfilled_date) 
                             VALUES (?, ?, ?, ?, ?, ?, "Fulfilled", NOW())')
                  ->execute([$requestId, 'Equipment', 'Auto-assigned', 1, $asset['id'], $assignment['qr_code']]);
            }
        }
    }
    
    // Update request status
    $d->prepare('UPDATE equipment_requests SET status = "Fulfilling", updated_at = NOW() WHERE id = ?')
      ->execute([$requestId]);
    
    // Log activity
    $d->prepare('CALL log_equipment_request_activity(?, ?, ?, ?, ?)')
      ->execute([$requestId, 'Fulfillment Started', $x['notes'] ?? 'Equipment assignment started', $u['name'], null]);
    
    reply(['ok' => true]);
}

if ($method === 'GET' && preg_match('#^/api/v1/equipment-requests/([^/]+)/activity$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $d = db();
    
    $requestIdQuery = $d->prepare('SELECT id FROM equipment_requests WHERE request_number = ?');
    $requestIdQuery->execute([$m[1]]);
    $requestId = $requestIdQuery->fetchColumn();
    
    if (!$requestId) {
        reply(['error' => 'Equipment request not found'], 404);
    }
    
    $q = $d->prepare('SELECT * FROM equipment_request_activity WHERE request_id = ? ORDER BY created_at DESC');
    $q->execute([$requestId]);
    $activities = $q->fetchAll(PDO::FETCH_ASSOC);
    
    reply(['activities' => $activities]);
}

// --- Documents API Endpoints ---
if ($method === 'GET' && $path === '/api/v1/documents') {
    auth();
    $d = db();
    $documents = $d->query('SELECT * FROM documents WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['documents' => $documents]);
}

if ($method === 'POST' && $path === '/api/v1/documents') {
    $u = auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $doc_count = (int)$d->query("SELECT COUNT(*)+1 FROM documents WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $ref_number = substr($x['document_type'], 0, 3) . '-' . date('Y') . '-' . str_pad((string)$doc_count, 3, '0', STR_PAD_LEFT);
    // §7 document metadata: every record is searchable/linkable via batch,
    // SKU, asset, PO, STO, transport, carrier, and zone references.
    $q = $d->prepare('INSERT INTO documents(document_type, reference_no, owner, description, related_po, due_date,
        batch_no, sku, asset_ref, po_number, sto_ref, transport_ref, carrier_tracking, zone, expiry_date, updated_by)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $q->execute([$x['document_type'], $ref_number, $x['owner'], $x['description'] ?? null,
        $x['po_number'] ?? ($x['related_po'] ?? null), $x['due_date'] ?: null,
        $x['batch_no'] ?? null, $x['sku'] ?? null, $x['asset_ref'] ?? null, $x['po_number'] ?? null,
        $x['sto_ref'] ?? null, $x['transport_ref'] ?? null, $x['carrier_tracking'] ?? null, $x['zone'] ?? null,
        $x['expiry_date'] ?: null, $u['name']]);
    $doc_id = $d->lastInsertId();

    $d->prepare('INSERT INTO document_activity(document_id, action, details) VALUES(?,?,?)')
      ->execute([$doc_id, 'Created', 'Document created by ' . $u['name']]);
      
    reply(['id' => $doc_id, 'reference_no' => $ref_number], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/documents/(\d+)$#', $path, $m)) {
    auth();
    $q = db()->prepare('SELECT d.*, ds.signer_name, ds.signed_at FROM documents d LEFT JOIN document_signatures ds ON d.id=ds.document_id WHERE d.id = ?');
    $q->execute([$m[1]]);
    $doc = $q->fetch(PDO::FETCH_ASSOC);
    reply($doc ?: ['error' => 'Document not found'], $doc ? 200 : 404);
}

if ($method === 'PUT' && preg_match('#^/api/v1/documents/(\d+)/status$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $d->prepare('UPDATE documents SET status = ?, updated_at = NOW() WHERE id = ?')
      ->execute([$x['status'], $m[1]]);
      
    $d->prepare('INSERT INTO document_activity(document_id, action, details) VALUES(?,?,?)')
      ->execute([$m[1], 'Status Updated', 'Status changed to ' . $x['status']]);
      
    reply(['ok' => true]);
}

if ($method === 'POST' && preg_match('#^/api/v1/documents/(\d+)/sign$#', $path, $m)) {
    auth();
    $x = body();
    $d = db();
    $d->prepare('INSERT INTO document_signatures(document_id, signer_name, signature_data) VALUES(?,?,?)')
      ->execute([$m[1], $x['signature'], hash('sha256', $x['signature'] . time())]);
      
    $d->prepare('UPDATE documents SET status = ?, updated_at = NOW() WHERE id = ?')
      ->execute(['Signed', $m[1]]);
      
    $d->prepare('INSERT INTO document_activity(document_id, action, details) VALUES(?,?,?)')
      ->execute([$m[1], 'Signed', 'Document signed by ' . $x['signature']]);
      
    reply(['ok' => true]);
}

if ($method === 'GET' && $path === '/api/v1/documents/activity') {
    auth();
    $d = db();
    $activity = $d->query("SELECT da.*, d.reference_no FROM document_activity da JOIN documents d ON da.document_id=d.id ORDER BY da.created_at DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
    reply(['activities' => $activity]);
}

// ==========================================
// INTEGRATION API ENDPOINTS
// ==========================================

// Helper function for integration authentication
function integrationAuth(): array {
    $apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
    $apiSignature = $_SERVER['HTTP_X_API_SIGNATURE'] ?? '';
    $systemId = $_SERVER['HTTP_X_SYSTEM_ID'] ?? '';
    $timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? '';
    
    if (empty($apiKey) || empty($apiSignature) || empty($systemId)) {
        reply(['error' => 'Missing authentication headers'], 401);
    }
    
    $d = db();
    $q = $d->prepare('SELECT * FROM system_integrations WHERE api_key = ? AND status = "Active"');
    $q->execute([$apiKey]);
    $integration = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$integration) {
        reply(['error' => 'Invalid API key or inactive integration'], 401);
    }
    
    // Verify signature (simplified - in production use proper HMAC verification)
    $payload = $_SERVER['REQUEST_METHOD'] . $_SERVER['REQUEST_URI'] . file_get_contents('php://input') . $timestamp;
    $expectedSignature = hash_hmac('sha256', $payload, $integration['api_secret']);
    if (!hash_equals($expectedSignature, $apiSignature)) {
        reply(['error' => 'Invalid signature'], 401);
    }
    
    // Log the API call
    $logQuery = $d->prepare('INSERT INTO integration_audit_log (system_integration_id, external_system, action, entity_type, request_data, status, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $logQuery->execute([
        $integration['id'],
        $systemId,
        $_SERVER['REQUEST_METHOD'] . ' ' . $_SERVER['REQUEST_URI'],
        'api_call',
        json_encode(['body' => body(), 'headers' => getallheaders()]),
        'Success',
        $_SERVER['REMOTE_ADDR'] ?? null,
        $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);
    
    return $integration;
}

// --- Equipment Request Endpoints ---

if ($method === 'POST' && $path === '/api/v1/integration/equipment-requests') {
    $integration = integrationAuth();
    $x = body();
    $d = db();
    
    // Generate request number
    $d->prepare('CALL generate_equipment_request_number(@request_number)');
    $requestNumber = $d->query('SELECT @request_number')->fetchColumn();
    
    // Calculate estimated cost (simplified)
    $equipmentNeeded = json_decode($x['equipment_needed'] ?? '[]', true);
    $estimatedCost = 0;
    foreach ($equipmentNeeded as $item) {
        $estimatedCost += ($item['quantity'] ?? 1) * 50000; // Default estimate
    }
    
    $q = $d->prepare('INSERT INTO equipment_requests (request_number, external_request_id, requesting_system, employee_name, employee_id, department, equipment_needed, needed_by, business_justification, cost_center, priority, status, requested_date, estimated_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)');
    $q->execute([
        $requestNumber,
        $x['external_request_id'] ?? null,
        $integration['system_name'],
        $x['employee_name'],
        $x['employee_id'] ?? null,
        $x['department'] ?? null,
        $x['equipment_needed'] ?? '[]',
        $x['needed_by'] ?? null,
        $x['business_justification'] ?? null,
        $x['cost_center'] ?? null,
        $x['priority'] ?? 'Medium',
        'Pending',
        $estimatedCost
    ]);
    
    $requestId = $d->lastInsertId();
    
    // Log activity
    $d->prepare('CALL log_equipment_request_activity(?, ?, ?, ?, ?)')
      ->execute([$requestId, 'Created', 'Equipment request created via integration', null, $integration['system_name']]);
    
    reply([
        'success' => true,
        'request_number' => $requestNumber,
        'status' => 'Pending',
        'estimated_cost' => $estimatedCost,
        'created_at' => date('c')
    ], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/integration/equipment-requests/([^/]+)$#', $path, $m)) {
    $integration = integrationAuth();
    $d = db();
    
    $q = $d->prepare('SELECT er.*, 
        (SELECT GROUP_CONCAT(CONCAT(eri.category, " x", eri.quantity, " - ", eri.fulfillment_status)) 
         FROM equipment_request_items eri WHERE eri.request_id = er.id) as items_summary
        FROM equipment_requests er WHERE er.request_number = ?');
    $q->execute([$m[1]]);
    $request = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$request) {
        reply(['error' => 'Equipment request not found'], 404);
    }
    
    // Get assigned assets if fulfilled
    $assignedAssets = [];
    if ($request['status'] === 'Fulfilled') {
        $assetQuery = $d->prepare('SELECT eri.assigned_qr_code, a.name, a.category, eri.fulfilled_date 
                                   FROM equipment_request_items eri 
                                   LEFT JOIN assets a ON eri.assigned_asset_id = a.id 
                                   WHERE eri.request_id = ?');
        $assetQuery->execute([$request['id']]);
        $assignedAssets = $assetQuery->fetchAll(PDO::FETCH_ASSOC);
    }
    
    reply([
        'request_number' => $request['request_number'],
        'external_request_id' => $request['external_request_id'],
        'status' => $request['status'],
        'employee_name' => $request['employee_name'],
        'employee_id' => $request['employee_id'],
        'department' => $request['department'],
        'items_summary' => $request['items_summary'],
        'assigned_assets' => $assignedAssets,
        'estimated_cost' => $request['estimated_cost'],
        'actual_cost' => $request['actual_cost'],
        'requested_date' => $request['requested_date'],
        'fulfilled_date' => $request['fulfilled_date']
    ]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/integration/equipment-requests/([^/]+)/status$#', $path, $m)) {
    $integration = integrationAuth();
    $x = body();
    $d = db();
    
    $q = $d->prepare('UPDATE equipment_requests SET status = ?, updated_at = NOW() WHERE request_number = ?');
    $q->execute([$x['status'] ?? 'Pending', $m[1]]);
    
    if ($x['status'] === 'Rejected' && !empty($x['rejection_reason'])) {
        $d->prepare('UPDATE equipment_requests SET rejection_reason = ? WHERE request_number = ?')
          ->execute([$x['rejection_reason'], $m[1]]);
    }
    
    reply(['ok' => true]);
}

// --- Asset Integration Endpoints ---

if ($method === 'GET' && preg_match('#^/api/v1/integration/assets/([^/]+)$#', $path, $m)) {
    $integration = integrationAuth();
    $d = db();
    
    $q = $d->prepare('SELECT a.*, 
        (SELECT CONCAT_WS(" ", external_system, external_employee_id) FROM external_references 
         WHERE scim_entity_type = "asset" AND scim_entity_id = a.id LIMIT 1) as assignment_info
        FROM assets a WHERE a.qr_code = ?');
    $q->execute([$m[1]]);
    $asset = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$asset) {
        reply(['error' => 'Asset not found'], 404);
    }
    
    // Parse assignment info
    $assignment = null;
    if ($asset['assignment_info']) {
        $assignment = [
            'system' => $asset['assigned_to_system'],
            'employee_id' => $asset['external_employee_id'],
            'employee_name' => $asset['external_employee_name']
        ];
    }
    
    reply([
        'qr_code' => $asset['qr_code'],
        'name' => $asset['name'],
        'category' => $asset['category'],
        'value' => $asset['value'],
        'status' => $asset['status'],
        'location' => $asset['location'],
        'assigned_to' => $assignment,
        'assignment_date' => $asset['assignment_date'],
        'assignment_notes' => $asset['assignment_notes']
    ]);
}

if ($method === 'POST' && preg_match('#^/api/v1/integration/assets/([^/]+)/assign$#', $path, $m)) {
    $integration = integrationAuth();
    $x = body();
    $d = db();
    
    // Update asset assignment
    $q = $d->prepare('UPDATE assets SET 
        assigned_to_system = ?, 
        external_employee_id = ?, 
        external_employee_name = ?, 
        assignment_date = ?, 
        assignment_notes = ?,
        status = "Deployed"
        WHERE qr_code = ?');
    $q->execute([
        $x['external_system'] ?? $integration['system_name'],
        $x['employee_id'] ?? null,
        $x['employee_name'] ?? null,
        $x['assignment_date'] ?? date('Y-m-d'),
        $x['notes'] ?? null,
        $m[1]
    ]);
    
    // Get asset ID
    $assetIdQuery = $d->prepare('SELECT id FROM assets WHERE qr_code = ?');
    $assetIdQuery->execute([$m[1]]);
    $assetId = $assetIdQuery->fetchColumn();
    
    // Create external reference
    if ($assetId && !empty($x['employee_id'])) {
        $d->prepare('INSERT INTO external_references (scim_entity_type, scim_entity_id, external_system, external_reference_id, reference_type, sync_status) 
                     VALUES (?, ?, ?, ?, ?, ?) 
                     ON DUPLICATE KEY UPDATE sync_status = "Synced", last_synced = NOW()')
          ->execute(['asset', $assetId, $x['external_system'] ?? $integration['system_name'], $x['employee_id'], 'assignment', 'Synced']);
    }
    
    // Log transaction
    $d->prepare('INSERT INTO asset_transactions (asset_id, action, zone, created_at) VALUES (?, ?, ?, NOW())')
      ->execute([$assetId, 'External Assignment', null]);
    
    reply(['ok' => true, 'message' => 'Asset assigned successfully']);
}

// --- Purchase Order Integration Endpoints ---

if ($method === 'GET' && preg_match('#^/api/v1/integration/purchase-orders/([^/]+)$#', $path, $m)) {
    $integration = integrationAuth();
    $d = db();
    
    $q = $d->prepare('SELECT po.*, v.name as vendor_name, 
        (SELECT GROUP_CONCAT(CONCAT(poi.item_name, " x", poi.quantity, " @ ", poi.unit_price)) 
         FROM purchase_order_items poi WHERE poi.po_id = po.id) as items_summary
        FROM purchase_orders po 
        LEFT JOIN vendors v ON po.vendor_id = v.id 
        WHERE po.po_number = ?');
    $q->execute([$m[1]]);
    $po = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$po) {
        reply(['error' => 'Purchase order not found'], 404);
    }
    
    reply([
        'po_number' => $po['po_number'],
        'vendor' => $po['vendor_name'],
        'status' => $po['status'],
        'total' => $po['total'],
        'expected_delivery' => $po['expected_delivery'],
        'items_summary' => $po['items_summary'],
        'budget_code' => $po['budget_code'],
        'budget_status' => $po['budget_status'],
        'created_at' => $po['created_at']
    ]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/integration/purchase-orders/([^/]+)/budget-status$#', $path, $m)) {
    $integration = integrationAuth();
    $x = body();
    $d = db();
    
    $q = $d->prepare('UPDATE purchase_orders SET 
        budget_status = ?, 
        budget_approved_by = ?, 
        budget_approved_date = ?,
        updated_at = NOW() 
        WHERE po_number = ?');
    $q->execute([
        $x['budget_status'] ?? 'Pending',
        $x['approved_by'] ?? null,
        $x['approval_date'] ?? null,
        $m[1]
    ]);
    
    reply(['ok' => true]);
}

// --- Data Export Endpoints ---

if ($method === 'GET' && $path === '/api/v1/integration/export/inventory') {
    $integration = integrationAuth();
    $d = db();
    
    $format = $_GET['format'] ?? 'json';
    $since = $_GET['since'] ?? null;
    $category = $_GET['category'] ?? null;
    
    $query = 'SELECT * FROM assets WHERE 1=1';
    $params = [];
    
    if ($since) {
        $query .= ' AND created_at >= ?';
        $params[] = $since;
    }
    
    if ($category) {
        $query .= ' AND category = ?';
        $params[] = $category;
    }
    
    $q = $d->prepare($query);
    $q->execute($params);
    $assets = $q->fetchAll(PDO::FETCH_ASSOC);
    
    if ($format === 'csv') {
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="inventory_export.csv"');
        
        $output = fopen('php://output', 'w');
        if (!empty($assets)) {
            fputcsv($output, array_keys($assets[0]));
            foreach ($assets as $asset) {
                fputcsv($output, $asset);
            }
        }
        fclose($output);
        exit;
    }
    
    reply([
        'export_date' => date('c'),
        'total_assets' => count($assets),
        'assets' => $assets
    ]);
}

if ($method === 'GET' && $path === '/api/v1/integration/export/audit-trail') {
    $integration = integrationAuth();
    $d = db();
    
    $fromDate = $_GET['from_date'] ?? date('Y-m-d', strtotime('-30 days'));
    $toDate = $_GET['to_date'] ?? date('Y-m-d');
    $entityType = $_GET['entity_type'] ?? null;
    
    $query = 'SELECT * FROM integration_audit_log WHERE created_at BETWEEN ? AND ?';
    $params = [$fromDate, $toDate];
    
    if ($entityType) {
        $query .= ' AND entity_type = ?';
        $params[] = $entityType;
    }
    
    $query .= ' ORDER BY created_at DESC LIMIT 1000';
    
    $q = $d->prepare($query);
    $q->execute($params);
    $auditLogs = $q->fetchAll(PDO::FETCH_ASSOC);
    
    reply([
        'export_date' => date('c'),
        'from_date' => $fromDate,
        'to_date' => $toDate,
        'total_records' => count($auditLogs),
        'audit_logs' => $auditLogs
    ]);
}

// --- Webhook Management Endpoints ---

if ($method === 'POST' && $path === '/api/v1/integration/webhooks') {
    $integration = integrationAuth();
    $x = body();
    $d = db();
    
    $webhookId = 'WH-' . strtoupper(substr(uniqid(), -8));
    $webhookSecret = bin2hex(random_bytes(32));
    
    $q = $d->prepare('INSERT INTO webhooks (webhook_id, system_integration_id, event_types, target_url, webhook_secret, active) VALUES (?, ?, ?, ?, ?, 1)');
    $q->execute([
        $webhookId,
        $integration['id'],
        json_encode($x['event_types'] ?? []),
        $x['target_url'],
        $webhookSecret
    ]);
    
    reply([
        'webhook_id' => $webhookId,
        'status' => 'active',
        'event_types' => $x['event_types'] ?? [],
        'webhook_secret' => $webhookSecret,
        'message' => 'Store this secret securely for signature verification'
    ], 201);
}

if ($method === 'GET' && $path === '/api/v1/integration/webhooks') {
    $integration = integrationAuth();
    $d = db();
    
    $q = $d->prepare('SELECT webhook_id, event_types, target_url, active, success_count, failure_count, last_triggered FROM webhooks WHERE system_integration_id = ?');
    $q->execute([$integration['id']]);
    $webhooks = $q->fetchAll(PDO::FETCH_ASSOC);
    
    reply(['webhooks' => $webhooks]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/integration/webhooks/([^/]+)$#', $path, $m)) {
    $integration = integrationAuth();
    $d = db();
    
    $q = $d->prepare('UPDATE webhooks SET active = 0 WHERE webhook_id = ? AND system_integration_id = ?');
    $q->execute([$m[1], $integration['id']]);
    
    reply(['ok' => true, 'message' => 'Webhook deactivated']);
}

// --- System Integration Endpoints ---

if ($method === 'GET' && $path === '/api/v1/integration/health') {
    // Health check endpoint (no auth required for monitoring)
    $d = db();
    $status = 'healthy';
    
    try {
        $d->query('SELECT 1')->fetch();
    } catch (Exception $e) {
        $status = 'unhealthy';
    }
    
    reply([
        'status' => $status,
        'timestamp' => date('c'),
        'version' => '1.0.0',
        'integration_enabled' => true
    ]);
}

if ($method === 'GET' && $path === '/api/v1/integration/config') {
    $integration = integrationAuth();
    $d = db();
    
    $q = $d->prepare('SELECT config_key, config_value, config_type, description FROM integration_config');
    $q->execute();
    $configs = $q->fetchAll(PDO::FETCH_ASSOC);
    
    $configArray = [];
    foreach ($configs as $config) {
        $configArray[$config['config_key']] = [
            'value' => $config['config_value'],
            'type' => $config['config_type'],
            'description' => $config['description']
        ];
    }
    
    reply(['configs' => $configArray]);
}

// ==========================================================================
// TRD v4.2 — ARCHIVE, DELETION BIN, ACTIVITY LOG, EXPORT, NAV BADGES
// ==========================================================================

// Shared entity whitelist for archive / trash / restore / purge.
// Every key maps to (table, ref column used for display).
function archiveEntities(): array {
    return [
        'asset'       => ['table' => 'assets', 'label' => 'name', 'ref' => 'qr_code'],
        'po'          => ['table' => 'purchase_orders', 'label' => 'po_number', 'ref' => 'po_number'],
        'requisition' => ['table' => 'requisitions', 'label' => 'title', 'ref' => 'req_number'],
        'supplier'    => ['table' => 'vendors', 'label' => 'name', 'ref' => 'id'],
        'document'    => ['table' => 'documents', 'label' => 'document_type', 'ref' => 'reference_no'],
    ];
}

// GET /api/v1/archives — Admin-only centralized archive folder.
if ($method === 'GET' && $path === '/api/v1/archives') {
    auth(['Admin']);
    $d = db();
    $items = [];
    foreach (archiveEntities() as $type => $cfg) {
        $rows = $d->query("SELECT id, {$cfg['label']} AS label, {$cfg['ref']} AS ref, archived_at,
                                  archived_by, archive_reason
                           FROM {$cfg['table']} WHERE archived_at IS NOT NULL AND deleted_at IS NULL
                           ORDER BY archived_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) { $r['entity'] = $type; $items[] = $r; }
    }
    usort($items, fn($a, $b) => strcmp($b['archived_at'], $a['archived_at']));
    reply(['items' => $items]);
}

// GET /api/v1/trash — Admin-only deletion bin with a 30-day retention span;
// anything past retention is purged automatically on read.
if ($method === 'GET' && $path === '/api/v1/trash') {
    auth(['Admin']);
    $d = db();
    $retentionDays = 30;
    foreach (archiveEntities() as $cfg) {
        $d->exec("DELETE FROM {$cfg['table']} WHERE deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL $retentionDays DAY)");
    }
    $items = [];
    foreach (archiveEntities() as $type => $cfg) {
        $rows = $d->query("SELECT id, {$cfg['label']} AS label, {$cfg['ref']} AS ref, deleted_at,
                           GREATEST(0, $retentionDays - DATEDIFF(NOW(), deleted_at)) AS days_left
                           FROM {$cfg['table']} WHERE deleted_at IS NOT NULL
                           ORDER BY deleted_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $r) { $r['entity'] = $type; $items[] = $r; }
    }
    usort($items, fn($a, $b) => strcmp($b['deleted_at'], $a['deleted_at']));
    reply(['items' => $items, 'retention_days' => $retentionDays]);
}

// POST /api/v1/records/{entity}/{id}/archive|restore — archiving is open to
// Admins and Managers (§4, subject to admin review) and requires a reason;
// restore stays Admin-only. The actor's name/ID/timestamp are logged.
if ($method === 'POST' && preg_match('#^/api/v1/records/([a-z]+)/(\d+)/(archive|restore)$#', $path, $m)) {
    $u = auth(['Admin', 'Manager']);
    if ($m[3] === 'restore' && $u['role'] !== 'Admin') {
        reply(['error' => 'Only a System Administrator may restore archived records.'], 403);
    }
    $cfg = archiveEntities()[$m[1]] ?? null;
    if (!$cfg) reply(['error' => 'Unknown record type.'], 400);
    $d = db();
    if ($m[3] === 'archive') {
        $reason = trim((string)(body()['reason'] ?? ''));
        if ($reason === '') reply(['error' => 'An archiving reason is required.'], 400);
        // Record the actor's name + user ID and the reason on the record
        // itself so the archive list can display who/when/why.
        $archivedBy = $u['name'] . ' (ID ' . $u['id'] . ')';
        $d->prepare("UPDATE {$cfg['table']} SET archived_at = NOW(), archived_by = ?, archive_reason = ?, deleted_at = NULL WHERE id = ? AND deleted_at IS NULL")
          ->execute([$archivedBy, $reason, (int)$m[2]]);
        logActivity($d, $u, 'Archived record', $m[1], (string)$m[2], 'Reason: ' . $reason);
    } else {
        $d->prepare("UPDATE {$cfg['table']} SET archived_at = NULL, archived_by = NULL, archive_reason = NULL, deleted_at = NULL WHERE id = ?")
          ->execute([(int)$m[2]]);
        logActivity($d, $u, 'Restored record', $m[1], (string)$m[2]);
    }
    reply(['ok' => true]);
}

// DELETE /api/v1/records/{entity}/{id} — soft-delete to the retention bin.
// ?permanent=1 purges outright. Both are Admin-only (TRD §7).
if ($method === 'DELETE' && preg_match('#^/api/v1/records/([a-z]+)/(\d+)$#', $path, $m)) {
    $u = auth(['Admin']);
    $cfg = archiveEntities()[$m[1]] ?? null;
    if (!$cfg) reply(['error' => 'Unknown record type.'], 400);
    $d = db();
    if (($_GET['permanent'] ?? '') === '1') {
        $d->prepare("DELETE FROM {$cfg['table']} WHERE id = ?")->execute([(int)$m[2]]);
        logActivity($d, $u, 'Permanently deleted record', $m[1], (string)$m[2]);
    } else {
        $d->prepare("UPDATE {$cfg['table']} SET deleted_at = NOW() WHERE id = ?")->execute([(int)$m[2]]);
        logActivity($d, $u, 'Moved record to deletion bin', $m[1], (string)$m[2]);
    }
    reply(['ok' => true]);
}

// GET /api/v1/activity-log — own actions for everyone; ?all=1 shows the
// platform-wide feed to Admins. Optional ?from=&to=&search= filters.
if ($method === 'GET' && $path === '/api/v1/activity-log') {
    $u = auth();
    $d = db();
    $where = '1=1';
    $params = [];
    if (!($u['role'] === 'Admin' && ($_GET['all'] ?? '') === '1')) {
        $where .= ' AND user_id = ?';
        $params[] = $u['id'];
    }
    if (!empty($_GET['from'])) { $where .= ' AND created_at >= ?'; $params[] = $_GET['from'] . ' 00:00:00'; }
    if (!empty($_GET['to']))   { $where .= ' AND created_at <= ?'; $params[] = $_GET['to'] . ' 23:59:59'; }
    if (!empty($_GET['search'])) {
        $where .= ' AND (action LIKE ? OR entity_ref LIKE ? OR details LIKE ?)';
        $like = '%' . $_GET['search'] . '%';
        $params = array_merge($params, [$like, $like, $like]);
    }
    $q = $d->prepare("SELECT * FROM activity_log WHERE $where ORDER BY created_at DESC LIMIT 500");
    $q->execute($params);
    reply(['items' => $q->fetchAll(PDO::FETCH_ASSOC), 'can_view_all' => $u['role'] === 'Admin']);
}

// ==========================================================================
// INTERNAL LOGISTICS REQUESTS (§4) — inventory submits transport requests
// to Fleet & Vehicle Management for moving items/assets to staff.
// ==========================================================================
if ($method === 'GET' && $path === '/api/v1/fleet-requests') {
    auth();
    reply(['items' => db()->query('SELECT fr.*, u.full_name AS requested_by_name FROM fleet_requests fr LEFT JOIN users u ON u.id=fr.requested_by ORDER BY fr.created_at DESC')->fetchAll(PDO::FETCH_ASSOC)]);
}

if ($method === 'POST' && $path === '/api/v1/fleet-requests') {
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $x = body();
    $item = trim((string)($x['item_name'] ?? ''));
    $destination = trim((string)($x['destination'] ?? ''));
    if ($item === '' || $destination === '') {
        reply(['error' => 'Item/asset and destination are required.'], 400);
    }
    $d = db();
    $n = (int)$d->query("SELECT COUNT(*)+1 FROM fleet_requests WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $ref = 'FLT-' . date('Y') . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);
    $d->prepare('INSERT INTO fleet_requests(req_number, item_name, quantity, origin, destination, notes, requested_by, asset_ref, recipient_name, recipient_dept, requested_date, priority, special_instructions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      ->execute([$ref, $item, max(1, (int)($x['quantity'] ?? 1)), $x['origin'] ?? 'Warehouse', $destination, $x['notes'] ?? null, $u['id'],
                 $x['asset_ref'] ?? null, $x['recipient_name'] ?? null, $x['recipient_dept'] ?? null,
                 $x['requested_date'] ?: null, in_array($x['priority'] ?? '', ['Low', 'Normal', 'High', 'Urgent'], true) ? $x['priority'] : 'Normal',
                 $x['special_instructions'] ?? null]);
    logActivity($d, $u, 'Requested fleet transport', 'fleet_request', $ref, "$item → $destination");
    // Outbound hand-off marker for the Fleet & Vehicle Management system.
    $d->prepare('INSERT INTO integration_audit_log(external_system, action, entity_type, entity_id, request_data, status) VALUES(?,?,?,?,?,?)')
      ->execute(['Fleet & Vehicle Management', 'Transport Request Submitted', 'fleet_request', (int)$d->lastInsertId(),
                 json_encode(['req_number' => $ref, 'item' => $item, 'destination' => $destination, 'requested_by' => $u['name']]), 'Success']);
    reply(['id' => (int)$d->lastInsertId(), 'req_number' => $ref], 201);
}

if ($method === 'PUT' && preg_match('#^/api/v1/fleet-requests/(\d+)$#', $path, $m)) {
    $u = auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $status = $x['status'] ?? '';
    if (!in_array($status, ['Submitted', 'Scheduled', 'In Transit', 'Delivered', 'Cancelled'], true)) {
        reply(['error' => 'Invalid transport status.'], 400);
    }
    $d->prepare('UPDATE fleet_requests SET status = ? WHERE id = ?')->execute([$status, $m[1]]);
    logActivity($d, $u, 'Updated fleet request', 'fleet_request', (string)$m[1], "Status → $status");
    reply(['ok' => true]);
}

// GET /api/v1/nav-badges — live sidebar counters for every module.
if ($method === 'GET' && $path === '/api/v1/nav-badges') {
    auth();
    $d = db();
    reply(['badges' => [
        'pending_adjustments' => (int)$d->query("SELECT COUNT(*) FROM assets WHERE status='Awaiting Print' AND deleted_at IS NULL")->fetchColumn(),
        'low_stock'           => (int)$d->query("SELECT COUNT(*) FROM assets WHERE status='In Warehouse' AND deleted_at IS NULL AND low_stock_threshold IS NOT NULL AND quantity < low_stock_threshold")->fetchColumn(),
        'open_requisitions'   => (int)$d->query("SELECT COUNT(*) FROM requisitions WHERE status IN ('Submitted','Inventory Review','Inventory Approved') AND deleted_at IS NULL")->fetchColumn(),
        'arrived_pos'         => (int)$d->query("SELECT COUNT(*) FROM purchase_orders WHERE status='Arrived' AND deleted_at IS NULL")->fetchColumn(),
        'pending_docs'        => (int)$d->query("SELECT COUNT(*) FROM documents WHERE status LIKE 'Pending%' AND deleted_at IS NULL")->fetchColumn(),
        'unread_notices'      => (int)$d->query("SELECT COUNT(*) FROM admin_notifications WHERE status='Pending'")->fetchColumn(),
    ]]);
}

// GET /api/v1/export/{entity}.csv-compatible — Excel export for all
// historical datasets with ?from=&to= date-range filtering.
if ($method === 'GET' && preg_match('#^/api/v1/export/([a-z_]+)$#', $path, $m)) {
    $u = auth(['Admin', 'Manager']);
    $d = db();
    $exportMap = [
        'assets'       => ['sql' => "SELECT qr_code AS id, name, category, status, quantity, value, location, date_purchased, lifespan_months, created_at FROM assets WHERE deleted_at IS NULL", 'date' => 'created_at'],
        'transactions' => ['sql' => "SELECT t.created_at, a.qr_code AS asset_id, a.name AS asset, t.action, t.zone FROM asset_transactions t LEFT JOIN assets a ON a.id=t.asset_id", 'date' => 't.created_at'],
        'requisitions' => ['sql' => "SELECT req_number, title, department, priority, estimated_cost, actual_cost, status, created_at FROM requisitions WHERE deleted_at IS NULL", 'date' => 'created_at'],
        'pos'          => ['sql' => "SELECT po_number, vendor, total, status, expected_delivery, created_at, updated_at FROM purchase_orders WHERE deleted_at IS NULL", 'date' => 'created_at'],
        'settlements'  => ['sql' => "SELECT po_number, vendor_name, amount, status, verification_timestamp, created_at FROM finance_settlements", 'date' => 'created_at'],
        'scans'        => ['sql' => "SELECT created_at, qr_code, action, details, scanned_by, collision FROM scan_logs", 'date' => 'created_at'],
        'activity'     => ['sql' => "SELECT created_at, user_name, action, entity, entity_ref, details FROM activity_log", 'date' => 'created_at'],
        'documents'    => ['sql' => "SELECT reference_no, document_type, owner, related_po, status, due_date, created_at FROM documents WHERE deleted_at IS NULL", 'date' => 'created_at'],
        'suppliers'    => ['sql' => "SELECT name, email, phone, category, on_time_rate, defect_rate, rating, created_at FROM vendors WHERE deleted_at IS NULL", 'date' => 'created_at'],
    ];
    $cfg = $exportMap[$m[1]] ?? null;
    if (!$cfg) reply(['error' => 'Unknown export dataset.'], 400);
    $sql = $cfg['sql'];
    $clauses = [];
    $params = [];
    if (!empty($_GET['from'])) { $clauses[] = "{$cfg['date']} >= ?"; $params[] = $_GET['from'] . ' 00:00:00'; }
    if (!empty($_GET['to']))   { $clauses[] = "{$cfg['date']} <= ?"; $params[] = $_GET['to'] . ' 23:59:59'; }
    if ($clauses) $sql .= (stripos($sql, 'WHERE') === false ? ' WHERE ' : ' AND ') . implode(' AND ', $clauses);
    $q = $d->prepare($sql);
    $q->execute($params);
    $rows = $q->fetchAll(PDO::FETCH_ASSOC);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="scim-' . $m[1] . '-' . date('Ymd') . '.csv"');
    $out = fopen('php://output', 'w');
    fprintf($out, "\xEF\xBB\xBF"); // BOM so Excel opens UTF-8 correctly
    if ($rows) fputcsv($out, array_keys($rows[0]));
    foreach ($rows as $r) fputcsv($out, $r);
    fclose($out);
    exit;
}

// DELETE /api/v1/warehouse/zones/{zone} — Admin only; refuses occupied zones
// and protects the dedicated DISPOSAL zone.
if ($method === 'DELETE' && preg_match('#^/api/v1/warehouse/zones/([^/]+)$#', $path, $m)) {
    $u = auth(['Admin']);
    $zone = rawurldecode($m[1]);
    if (strtoupper($zone) === 'DISPOSAL') {
        reply(['error' => 'The DISPOSAL zone is dedicated to write-offs and cannot be deleted.'], 400);
    }
    $d = db();
    $q = $d->prepare('SELECT 1 FROM warehouse_zones WHERE zone = ?');
    $q->execute([$zone]);
    if (!$q->fetch()) reply(['error' => 'Zone not found.'], 404);
    // Count live assets — the stored occupied column is stale seed data.
    $occ = $d->prepare("SELECT COUNT(*) FROM assets WHERE location = ? AND status = 'In Warehouse' AND deleted_at IS NULL AND archived_at IS NULL");
    $occ->execute([$zone]);
    if ((int)$occ->fetchColumn() > 0) {
        reply(['error' => 'Zone still holds stock — transfer or dispose of its contents first.'], 409);
    }
    $d->prepare('DELETE FROM warehouse_rows WHERE zone = ?')->execute([$zone]);
    $d->prepare('DELETE FROM warehouse_zones WHERE zone = ?')->execute([$zone]);
    logActivity($d, $u, 'Deleted warehouse zone', 'zone', $zone);
    reply(['ok' => true]);
}

// Fallback Route
reply(['error' => 'Route not found.'], 404);