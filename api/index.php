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
function migrate(PDO $d): void {
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
        
        // Migrate data from document_logs to documents
        $d->exec("INSERT INTO documents (document_type, reference_no, owner, description, related_po, due_date, status, created_at)
            SELECT document_type, reference_no, owner, description, related_po, due_date, status, created_at 
            FROM document_logs");
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
    $d->exec("INSERT IGNORE INTO roles(name) VALUES ('Admin'),('Manager'),('WarehouseStaff')");
    
    // Create default admin user if not exists
    if (!(int)$d->query('SELECT COUNT(*) FROM users')->fetchColumn()) {
        $q = $d->prepare('INSERT INTO users(full_name, email, password_hash, role) VALUES(?, ?, ?, ?)');
        $q->execute(['System Administrator', 'admin@greatsolomon.test', password_hash('Welcome123!', PASSWORD_DEFAULT), 'Admin']);
    }
    
    // Insert sample warehouse zones if not exists
    if (!(int)$d->query('SELECT COUNT(*) FROM warehouse_zones')->fetchColumn()) {
        $d->exec("INSERT INTO warehouse_zones(zone, capacity, occupied) VALUES ('A', 100, 32), ('B', 100, 68), ('C', 100, 91), ('D', 100, 48)");
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
}

// Look up an authenticated user from a per-tab bearer token
function tokenUser(PDO $d): ?array {
    $t = $_SERVER['HTTP_X_SCIM_TOKEN'] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) return null;
    $q = $d->prepare("SELECT u.id, u.full_name AS name, u.email, u.role, u.avatar
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

// Serialized QR format: AGENCY-ASSET-<CATEGORY>-<6-digit sequence>
function genAssetSerial(PDO $d, string $category): string {
    $code = strtoupper(preg_replace('/[^A-Za-z]/', '', $category));
    $code = substr($code !== '' ? $code : 'ASSET', 0, 8);
    $q = $d->prepare("SELECT qr_code FROM assets WHERE qr_code LIKE ? ORDER BY qr_code DESC LIMIT 1");
    $q->execute(["AGENCY-ASSET-$code-%"]);
    $last = $q->fetchColumn();
    $seq = $last ? ((int)substr($last, -6)) + 1 : 1;
    return sprintf('AGENCY-ASSET-%s-%06d', $code, $seq);
}

// Outbound stream: forward a verified PO to Accounts Payable (Financial Mgmt)
function forwardToFinance(PDO $d, array $po): void {
    $exists = $d->prepare('SELECT id FROM finance_settlements WHERE po_id = ? LIMIT 1');
    $exists->execute([$po['id']]);
    if ($exists->fetch()) return;
    $vendorName = $po['vendor_name'] ?? $po['vendor'] ?? 'Unknown';
    $d->prepare('INSERT INTO finance_settlements(po_id, po_number, vendor_id, vendor_name, amount, verification_timestamp, status) VALUES(?,?,?,?,?,NOW(),?)')
      ->execute([$po['id'], $po['po_number'], $po['vendor_id'], $vendorName, (float)$po['total'], 'Forwarded to AP']);
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
    $payload = json_encode([
        'requires_2fa' => true,
        'message' => 'Verification code sent to your email',
        'email' => $u['email'],
        'ticket' => $ticket,
    ]);
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
    $zones = $d->query('SELECT zone, capacity, occupied, ROUND(occupied/capacity*100) pct FROM warehouse_zones ORDER BY zone')->fetchAll(PDO::FETCH_ASSOC);
    $scans = $d->query("SELECT t.action, t.created_at, a.name, a.qr_code FROM asset_transactions t JOIN assets a ON a.id=t.asset_id ORDER BY t.created_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
    reply(compact('stats', 'zones', 'scans'));
}

// --- Assets Endpoints ---
if ($method === 'GET' && $path === '/api/v1/assets') {
    auth();
    reply(db()->query('SELECT * FROM assets ORDER BY name')->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST' && $path === '/api/v1/assets') {
    auth(['Admin', 'Manager']);
    $x = body();
    $q = db()->prepare('INSERT INTO assets(qr_code, name, category, value, status, location) VALUES(?, ?, ?, ?, ?, ?)');
    $q->execute([$x['qr_code'], $x['name'], $x['category'], $x['value'], $x['status'] ?? 'In Warehouse', $x['location']]);
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
            $params[] = $x[$field];
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
    $d->prepare('DELETE FROM asset_transactions WHERE asset_id = ?')->execute([$a['id']]);
    $d->prepare('DELETE FROM assets WHERE id = ?')->execute([$a['id']]);
    reply(['ok' => true]);
}

if ($method === 'POST' && $path === '/api/v1/assets/scan') {
    $u = auth();
    $x = body();
    $d = db();
    $qr = trim($x['qr_code'] ?? '');
    $action = $x['action'] ?? 'Inventory Intake';
    $zone = $x['zone'] ?? null;
    $autoCreated = false;

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
        if (!in_array($poVerified['status'], ['Sent to Vendor', 'Shipped', 'Received'], true)) {
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
            $d->prepare('INSERT INTO assets(qr_code, name, category, value, status, location) VALUES(?,?,?,?,?,?)')
              ->execute([$qr, $name, $category, (float)($poVerified['total'] ?? $x['value'] ?? 0), 'In Warehouse', $loc]);
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
            break;
        case 'Check-Out':
        case 'Contractor Check-Out':
            $updates = ['status = ?']; $params[] = 'Deployed';
            break;
        case 'Check-In':
            $checkInAssignee = $a['external_employee_name'] ?? '';
            $updates = ['status = ?', 'external_employee_name = NULL']; $params[] = 'In Warehouse';
            if ($zone) { $updates[] = 'location = ?'; $params[] = $zone; }
            break;
        case 'Assign to Staff':
            $updates = ['status = ?', 'external_employee_name = ?', 'assignment_date = CURDATE()'];
            $params[] = 'Deployed';
            $params[] = trim($x['assignee'] ?? 'Staff');
            $details .= ' — ' . trim($x['assignee'] ?? 'Staff');
            break;
        case 'Move to Zone':
        case 'Asset Transfer':
            if ($zone) { $updates = ['location = ?']; $params[] = $zone; $details .= ' — ' . $zone; }
            break;
        case 'PO Receipt':
            $updates = ['status = ?']; $params[] = 'In Warehouse';
            $details .= ' — verified against ' . $poVerified['po_number'];
            // Mark the contract received once its first item scans in
            if ($poVerified['status'] !== 'Received') {
                $d->prepare("UPDATE purchase_orders SET status = 'Received', updated_at = NOW() WHERE id = ?")->execute([$poVerified['id']]);
                $d->prepare("INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)")
                  ->execute([$poVerified['id'], 'Received', 'Shipment verified via QR scan ' . $qr . ' by ' . $u['name']]);
                // Outbound stream → Financial Management / Accounts Payable
                forwardToFinance($d, $poVerified);
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

    // Transaction + immutable compliance log
    $d->prepare('INSERT INTO asset_transactions(asset_id, action, zone, created_at) VALUES(?, ?, ?, NOW())')
      ->execute([$a['id'], $action, $zone]);
    $d->prepare('INSERT INTO scan_logs(asset_id, qr_code, action, details, scanned_by, user_id, ip_address) VALUES(?,?,?,?,?,?,?)')
      ->execute([$a['id'], $qr, $action, $details, $u['name'], $u['id'], $_SERVER['REMOTE_ADDR'] ?? null]);

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
    reply(db()->query('SELECT * FROM purchase_orders ORDER BY updated_at DESC')->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'PUT' && preg_match('#^/api/v1/pos/(\d+)/status$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $newStatus = $x['status'] ?? 'Draft';
    $d->prepare('UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?')
      ->execute([$newStatus, $m[1]]);

    // Log activity with notes
    $actionDetails = 'Status changed to ' . $newStatus;
    if (!empty($x['notes'])) {
        $actionDetails .= '. Notes: ' . $x['notes'];
    }
    $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)')
      ->execute([$m[1], 'Status Updated', $actionDetails]);

    // Outbound stream: a received/fulfilled order settles to Accounts Payable
    if (in_array($newStatus, ['Received', 'Fulfilled'], true)) {
        $pq = $d->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id = v.id WHERE po.id = ?');
        $pq->execute([$m[1]]);
        if ($po = $pq->fetch(PDO::FETCH_ASSOC)) forwardToFinance($d, $po);
    }

    reply(['ok' => true]);
}

// --- Vendors Endpoints ---
if ($method === 'GET' && $path === '/api/v1/vendors') {
    auth();
    reply(db()->query('SELECT * FROM vendors ORDER BY on_time_rate DESC')->fetchAll(PDO::FETCH_ASSOC));
}

// --- Users Endpoints ---
if ($method === 'GET' && $path === '/api/v1/users') {
    auth(['Admin']);
    reply(db()->query('SELECT id, full_name, email, role, is_active, avatar, created_at FROM users ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC));
}

if ($method === 'POST' && $path === '/api/v1/users') {
    auth(['Admin']);
    $x = body();
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
        $items[] = ['icon' => 'receipt_long', 'title' => 'PO awaiting approval: ' . $r['po_number'], 'sub' => $r['vendor_name'] ?: 'Vendor TBD', 'time' => $r['created_at'], 'href' => 'purchase-orders.html'];
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
    $d->prepare('INSERT INTO session_tokens(token, user_id, expires_at) VALUES(?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))')
      ->execute([$token, $userId]);
    
    // Also set the cookie session for legacy endpoints
    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => $userId,
        'name' => $user['full_name'],
        'email' => $user['email'],
        'role' => $user['role'],
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
    $payload = json_encode(['ok' => true, 'ticket' => $newTicket]);
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
    $zones = $d->query('SELECT zone, capacity, occupied, ROUND(occupied/capacity*100) pct FROM warehouse_zones ORDER BY zone')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($zones as &$zone) {
        $stmt = $d->prepare('SELECT row_num AS row, capacity, occupied, ROUND(occupied/capacity*100) pct FROM warehouse_rows WHERE zone = ? ORDER BY row_num');
        $stmt->execute([$zone['zone']]);
        $zone['rows'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    reply(['zones' => $zones]);
}

if ($method === 'POST' && $path === '/api/v1/warehouse/zones') {
    auth(['Admin', 'Manager']);
    $x = body();
    $zone = trim((string)($x['zone'] ?? ''));
    $capacity = filter_var($x['capacity'] ?? null, FILTER_VALIDATE_INT);
    $rowCount = filter_var($x['row_count'] ?? 4, FILTER_VALIDATE_INT);

    if ($zone === '' || strlen($zone) > 20 || $capacity === false || $capacity < 1 ||
        $rowCount === false || $rowCount < 1 || $rowCount > 20 || $rowCount > $capacity) {
        reply(['error' => 'Enter a zone name, a positive capacity, and 1 to 20 rows not exceeding the capacity.'], 400);
    }

    $d = db();
    try {
        $d->beginTransaction();
        $d->prepare('INSERT INTO warehouse_zones(zone, capacity, occupied) VALUES(?, ?, 0)')
          ->execute([$zone, $capacity]);

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
    $assets = $d->query('SELECT * FROM assets ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['assets' => $assets]);
}

if ($method === 'POST' && $path === '/api/v1/inventory/assets') {
    auth(['Admin', 'Manager']);
    $x = body();
    $q = db()->prepare('INSERT INTO assets(qr_code, name, category, value, status, location) VALUES(?,?,?,?,?,?)');
    $q->execute([$x['qr_code'], $x['name'], $x['category'], $x['value'], $x['status'] ?? 'In Warehouse', $x['location']]);
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
    auth(['Admin', 'Manager']);
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
        $updateFields[] = 'location = ?';
        $params[] = $x['location'];
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
    $requisitions = $d->query('SELECT r.*, u.full_name AS created_by_name FROM requisitions r LEFT JOIN users u ON r.created_by=u.id ORDER BY r.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['requisitions' => $requisitions]);
}

if ($method === 'POST' && $path === '/api/v1/procurement/requisitions') {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $u = auth();
    $req_count = (int)$d->query("SELECT COUNT(*)+1 FROM requisitions WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $req_number='REQ-'.date('Y').'-'.str_pad((string)$req_count,3,'0',STR_PAD_LEFT);    $q = $d->prepare('INSERT INTO requisitions(req_number, title, department, description, estimated_cost, priority, needed_by, created_by) VALUES(?,?,?,?,?,?,?,?)');
    $q->execute([$req_number, $x['title'], $x['department'], $x['description'], $x['estimated_cost'], $x['priority'], $x['needed_by'], $u['id']]);
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
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();

    $lookup = $d->prepare('SELECT id FROM requisitions WHERE req_number = ? OR id = ? LIMIT 1');
    $lookup->execute([$m[1], $m[1]]);
    $req = $lookup->fetch(PDO::FETCH_ASSOC);

    if (!$req) {
        reply(['error' => 'Requisition not found'], 404);
    }

    $updateFields = [];
    $params = [];

    foreach (['title', 'department', 'description', 'priority', 'status'] as $field) {
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

    reply(['ok' => true]);
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
    $suppliers = $d->query('SELECT * FROM vendors ORDER BY rating DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['suppliers' => $suppliers]);
}

if ($method === 'POST' && $path === '/api/v1/suppliers') {
    auth(['Admin', 'Manager']);
    $x = body();
    $q = db()->prepare('INSERT INTO vendors(name, email, phone, address, category) VALUES(?,?,?,?,?)');
    $q->execute([$x['name'], $x['email'], $x['phone'], $x['address'], $x['category']]);
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

    foreach (['name', 'email', 'phone', 'address', 'category'] as $field) {
        if (array_key_exists($field, $x)) {
            $updateFields[] = $field . ' = ?';
            $params[] = $x[$field];
        }
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

    foreach (['name', 'email', 'phone', 'address', 'category'] as $field) {
        if (array_key_exists($field, $x)) {
            $updateFields[] = $field . ' = ?';
            $params[] = $x[$field];
        }
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
    $pos = $d->query('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id=v.id ORDER BY po.created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['pos' => $pos]);
}

if ($method === 'POST' && $path === '/api/v1/pos') {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $po_count = (int)$d->query("SELECT COUNT(*)+1 FROM purchase_orders WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $po_number='PO-'.date('Y').'-'.str_pad((string)$po_count,3,'0',STR_PAD_LEFT);    $vendor_id = $x['vendor_id'] ?? null;
    $vendor_name = $x['vendor'] ?? 'Unknown';
    
    if ($vendor_id) {
        $v = $d->prepare('SELECT name FROM vendors WHERE id = ?');
        $v->execute([$vendor_id]);
        $vendor_name = $v->fetchColumn() ?: 'Unknown';
    }
    
    $q = $d->prepare('INSERT INTO purchase_orders(po_number, vendor_id, vendor, items, total, expected_delivery, notes) VALUES(?,?,?,?,?,?,?)');
    $q->execute([$po_number, $vendor_id, $vendor_name, $x['items'], $x['total'], $x['expected_delivery'], $x['notes']]);
    $po_id = $d->lastInsertId();
    
    $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?,?,?)')
      ->execute([$po_id, 'Created', 'Purchase order created by ' . auth()['name']]);
      
    reply(['id' => $po_id, 'po_number' => $po_number], 201);
}

if ($method === 'GET' && preg_match('#^/api/v1/pos/(\d+)$#', $path, $m)) {
    auth();
    $q = db()->prepare('SELECT po.*, v.name AS vendor_name FROM purchase_orders po LEFT JOIN vendors v ON po.vendor_id=v.id WHERE po.id = ?');
    $q->execute([$m[1]]);
    $po = $q->fetch(PDO::FETCH_ASSOC);
    reply($po ?: ['error' => 'PO not found'], $po ? 200 : 404);
}



if ($method === 'POST' && preg_match('#^/api/v1/pos/(\d+)/qr-pdf$#', $path, $m)) {
    auth(['Admin', 'Manager']);
    reply(['ok' => true, 'message' => 'QR PDF generation endpoint - to be implemented with PDF library']);
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
    $u = auth(['Admin', 'Manager', 'WarehouseStaff']);
    $x = body();
    $d = db();
    $name = substr(trim($x['name'] ?? ''), 0, 120);
    $category = substr(trim($x['category'] ?? 'IT Equipment'), 0, 60) ?: 'IT Equipment';
    $qty = min(50, max(1, (int)($x['quantity'] ?? 1)));
    if ($name === '') reply(['error' => 'Item name is required.'], 400);
    $serials = [];
    for ($i = 0; $i < $qty; $i++) {
        $serial = genAssetSerial($d, $category);
        $d->prepare("INSERT INTO assets(qr_code, name, category, value, status, location) VALUES(?,?,?,0,'Awaiting Print','Print Queue')")
          ->execute([$serial, $name, $category]);
        $serials[] = $serial;
    }
    reply(['ok' => true, 'serials' => $serials, 'count' => count($serials)], 201);
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
    $alerts = $d->query("SELECT t.category, t.min_quantity,
            (SELECT COUNT(*) FROM assets a WHERE a.category = t.category AND a.status = 'In Warehouse') AS on_hand
            FROM stock_thresholds t ORDER BY on_hand / t.min_quantity")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($alerts as &$al) {
        $al['on_hand'] = (int)$al['on_hand'];
        $al['min_quantity'] = (int)$al['min_quantity'];
        $al['deficit'] = $al['on_hand'] < $al['min_quantity'];
    }
    reply(['items' => $alerts]);
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
    $documents = $d->query('SELECT * FROM documents ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['documents' => $documents]);
}

if ($method === 'POST' && $path === '/api/v1/documents') {
    auth(['Admin', 'Manager']);
    $x = body();
    $d = db();
    $doc_count = (int)$d->query("SELECT COUNT(*)+1 FROM documents WHERE YEAR(created_at)=YEAR(NOW())")->fetchColumn();
    $ref_number = substr($x['document_type'], 0, 3) . '-' . date('Y') . '-' . str_pad((string)$doc_count, 3, '0', STR_PAD_LEFT);
    $q = $d->prepare('INSERT INTO documents(document_type, reference_no, owner, description, related_po, due_date) VALUES(?,?,?,?,?,?)');
    $q->execute([$x['document_type'], $ref_number, $x['owner'], $x['description'], $x['related_po'], $x['due_date']]);
    $doc_id = $d->lastInsertId();
    
    $d->prepare('INSERT INTO document_activity(document_id, action, details) VALUES(?,?,?)')
      ->execute([$doc_id, 'Created', 'Document created by ' . auth()['name']]);
      
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

// Fallback Route
reply(['error' => 'Route not found.'], 404);