<?php
declare(strict_types=1);

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
    return $_SESSION['user'] ?? null;
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

    session_regenerate_id(true);
    $_SESSION['user'] = [
        'id' => (int)$u['id'],
        'name' => $u['full_name'],
        'email' => $u['email'],
        'role' => $u['role'],
        'initials' => strtoupper(substr($u['full_name'], 0, 1))
    ];
    
    audit(db(), $email, true, (int)$u['id']);
    reply(['user' => currentUser()]);
}

if ($method === 'POST' && $path === '/api/v1/auth/logout') {
    session_destroy();
    reply(['ok' => true]);
}

if ($method === 'GET' && $path === '/api/v1/auth/me') {
    reply(['user' => currentUser()]);
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

if ($method === 'POST' && $path === '/api/v1/assets/scan') {
    auth();
    $x = body();
    $q = db()->prepare('SELECT id, name, status FROM assets WHERE qr_code = ?');
    $q->execute([$x['qr_code'] ?? '']);
    $a = $q->fetch(PDO::FETCH_ASSOC);
    
    if (!$a) {
        reply(['error' => 'Unknown QR code.'], 404);
    }
    
    $action = $x['action'] ?? 'Inventory Intake';
    db()->prepare('INSERT INTO asset_transactions(asset_id, action, zone, created_at) VALUES(?, ?, ?, NOW())')
      ->execute([$a['id'], $action, $x['zone'] ?? null]);
      
    reply(['ok' => true, 'asset' => $a, 'action' => $action]);
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
    $d->prepare('UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?')
      ->execute([$x['status'] ?? 'Draft', $m[1]]);
    
    // Log activity with notes
    $actionDetails = 'Status changed to ' . ($x['status'] ?? 'Draft');
    if (!empty($x['notes'])) {
        $actionDetails .= '. Notes: ' . $x['notes'];
    }
    $d->prepare('INSERT INTO po_activity(po_id, action, details) VALUES(?, ?, ?)')
      ->execute([$m[1], 'Status Updated', $actionDetails]);
    
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
    reply(db()->query('SELECT id, full_name, email, role, is_active, created_at FROM users ORDER BY full_name')->fetchAll(PDO::FETCH_ASSOC));
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
    reply(db()->query('SELECT lh.*, u.full_name FROM login_history lh LEFT JOIN users u ON lh.user_id = u.id ORDER BY lh.created_at DESC LIMIT 50')->fetchAll(PDO::FETCH_ASSOC));
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
    
    // Generate QR code URI (for authenticator apps)
    $issuer = 'Great Solomon SCIM';
    $account = $u['email'];
    $qrCodeUri = sprintf('otpauth://totp/%s:%s?secret=%s&issuer=%s', 
        rawurlencode($issuer), 
        rawurlencode($account), 
        $secret, 
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
    
    if (empty($x['code']) || empty($x['user_id'])) {
        reply(['error' => 'Missing required fields'], 400);
    }
    
    $d = db();
    $q = $d->prepare('SELECT mfa_secret FROM users WHERE id = ?');
    $q->execute([$x['user_id']]);
    $user = $q->fetch(PDO::FETCH_ASSOC);
    
    if (empty($user['mfa_secret'])) {
        reply(['error' => 'MFA not enabled for this user'], 400);
    }
    
    if (!verifyTOTP($x['code'], $user['mfa_secret'])) {
        reply(['error' => 'Invalid MFA code'], 401);
    }
    
    reply(['ok' => true]);
}

// Simplified TOTP verification (in production, use a proper library like Spomky-Labs/otphp)
function verifyTOTP($code, $secret) {
    // This is a simplified version. In production, use a proper TOTP library.
    // For demonstration, we'll accept any 6-digit code for now
    return preg_match('/^\d{6}$/', $code) === 1;
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
    $q->execute([$m[1]]);
    $a = $q->fetch(PDO::FETCH_ASSOC);
    reply($a ?: ['error' => 'Asset not found'], $a ? 200 : 404);
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
    $q = $d->prepare('SELECT r.*, u.full_name AS created_by_name FROM requisitions r LEFT JOIN users u ON r.created_by=u.id WHERE r.req_number = ?');
    $q->execute([$m[1]]);
    $r = $q->fetch(PDO::FETCH_ASSOC);
    reply($r ?: ['error' => 'Requisition not found'], $r ? 200 : 404);
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