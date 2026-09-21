<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://scim.greatsolomonmpservices.com');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function respond(mixed $body, int $code = 200): never { http_response_code($code); echo json_encode($body); exit; }
function db(): PDO {
  static $connection;
  if ($connection) return $connection;
  $configFile = dirname(__DIR__) . '/config.php';
  $c = file_exists($configFile) ? require $configFile : [
    'host'=>getenv('DB_HOST') ?: '', 'database'=>getenv('DB_NAME') ?: '',
    'username'=>getenv('DB_USER') ?: '', 'password'=>getenv('DB_PASS') ?: ''
  ];
  if (!$c['host'] || !$c['database'] || !$c['username']) respond(['error'=>'Server configuration is incomplete. Add database variables.'], 503);
  try { $connection = new PDO("mysql:host={$c['host']};dbname={$c['database']};charset=utf8mb4", $c['username'], $c['password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); }
  catch (PDOException) { respond(['error'=>'Database connection failed.'], 503); }
  return $connection;
}
function input(): array { return json_decode(file_get_contents('php://input'), true) ?: []; }
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

if ($method==='POST' && $path==='/api/v1/auth/login') {
  $x=input();
  if (($x['email']??'')==='admin@greatsolomon.test' && ($x['password']??'')==='Welcome123!') respond(['token'=>'demo-admin-token','user'=>['name'=>'Felix Ramos','role'=>'Admin','initials'=>'FR'],'expiresIn'=>1800]);
  respond(['error'=>'Invalid email or password'],401);
}
if ($method==='GET' && $path==='/api/v1/dashboard') {
  $d=db(); $stats=$d->query("SELECT COALESCE(SUM(value),0) value, SUM(status='Deployed') deployed, COUNT(*) total FROM assets")->fetch(PDO::FETCH_ASSOC);
  $zones=$d->query('SELECT zone,capacity,occupied,ROUND(occupied/capacity*100) pct FROM warehouse_shelves ORDER BY zone')->fetchAll(PDO::FETCH_ASSOC);
  $scans=$d->query("SELECT t.action,t.created_at,a.name,a.qr_code FROM asset_transactions t JOIN assets a ON a.id=t.asset_id ORDER BY t.created_at DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
  respond(compact('stats','zones','scans'));
}
if ($method==='GET' && preg_match('#^/api/v1/assets/([^/]+)$#',$path,$m)) { $s=db()->prepare('SELECT * FROM assets WHERE qr_code=?');$s->execute([$m[1]]);$asset=$s->fetch(PDO::FETCH_ASSOC);respond($asset?:['error'=>'Asset not found'],$asset?200:404); }
if ($method==='POST' && $path==='/api/v1/assets/scan') { $x=input();$s=db()->prepare('SELECT id,name,status FROM assets WHERE qr_code=?');$s->execute([$x['qr_code']??'']);$asset=$s->fetch(PDO::FETCH_ASSOC);if(!$asset)respond(['error'=>'Unknown QR code'],404);$action=$x['action']??'Inventory Intake';db()->prepare('INSERT INTO asset_transactions(asset_id,action,created_at) VALUES(?,?,NOW())')->execute([$asset['id'],$action]);respond(['ok'=>true,'asset'=>$asset,'action'=>$action]); }
if ($method==='GET' && $path==='/api/v1/pos/pending') respond(db()->query('SELECT * FROM purchase_orders ORDER BY updated_at DESC')->fetchAll(PDO::FETCH_ASSOC));
if ($method==='PUT' && preg_match('#^/api/v1/pos/(\d+)/status$#',$path,$m)) { $x=input();db()->prepare('UPDATE purchase_orders SET status=?,updated_at=NOW() WHERE id=?')->execute([$x['status']??'Draft',$m[1]]);respond(['ok'=>true]); }
if ($method==='GET' && $path==='/api/v1/vendors') respond(db()->query('SELECT * FROM vendors ORDER BY on_time_rate DESC')->fetchAll(PDO::FETCH_ASSOC));
if ($method==='GET' && $path==='/api/v1/documents') respond(db()->query('SELECT * FROM document_logs ORDER BY due_date')->fetchAll(PDO::FETCH_ASSOC));
respond(['error'=>'Route not found'],404);
