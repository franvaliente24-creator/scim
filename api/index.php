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
    
    // Document tables
    $d->exec("CREATE TABLE IF NOT EXISTS documents (
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
}

function db(): PDO {
    static $d;
    if ($d) return $d;
    
    $h = getenv('DB_HOST') ?: 'mariadb-5tyoddp0.internal';
    $port = getenv('DB_PORT') ?: '35425';
    $n = getenv('DB_NAME') ?: getenv('DB_DATABASE') ?: 'hf_db_5tyoddp0';
    $u = getenv('DB_USER') ?: getenv('DB_USERNAME') ?: 'hf_mt2jba5hlb';
    $p = getenv('DB_PASS') ?: getenv('DB_PASSWORD') ?: 'dxbfdDz8k0tcetXthuRFegIiGfzCiz7C';
    
    
    if (!$h || !$n || !$u) {
        reply(['error' => 'Database configuration is incomplete.'], 503);
    }
    
    try {
        $d = new PDO("mysql:host=$h;dbname=$n;charset=utf8mb4", $u, $p, [
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

// --- Documents Endpoints ---
if ($method === 'GET' && $path === '/api/v1/documents') {
    auth();
    $d = db();
    $documents = $d->query('SELECT * FROM documents ORDER BY created_at DESC')->fetchAll(PDO::FETCH_ASSOC);
    reply(['documents' => $documents]);
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
$ref_number=substr($x['document_type'],0,3).'-'.date('Y').'-'.str_pad((string)$doc_count,3,'0',STR_PAD_LEFT);    
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

// Fallback Route
reply(['error' => 'Route not found.'], 404);