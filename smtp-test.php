<?php
// smtp-test.php — Upload to site ROOT (same folder as index.html).
// Visit https://scim.greatsolomonmpservices.com/smtp-test.php in your browser.
// DELETE THIS FILE after testing — it reveals config details.

echo "<pre>";
echo "=== SCIM SMTP Diagnostic ===\n\n";

// 1. Check config sources
function envVal(string $key, string $fallback = ''): string {
    $v = getenv($key);
    if ($v === false || $v === '') $v = $_SERVER[$key] ?? $_ENV[$key] ?? '';
    return ($v === false || $v === '') ? $fallback : $v;
}

$configFile = __DIR__ . '/config.php';
$fileConfig = [];
if (file_exists($configFile)) {
    $fileConfig = require $configFile;
    echo "[OK] config.php found\n";
} else {
    echo "[--] config.php not found (OK if using env vars)\n";
}

$host = $fileConfig['smtp_host'] ?? envVal('SMTP_HOST');
$port = (int)($fileConfig['smtp_port'] ?? envVal('SMTP_PORT', '587'));
$user = $fileConfig['smtp_user'] ?? envVal('SMTP_USER');
$pass = $fileConfig['smtp_pass'] ?? envVal('SMTP_PASS');

// Show what env vars PHP can see
echo "\nEnv vars visible to PHP:\n";
foreach (['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'] as $k) {
    $v = envVal($k);
    echo "     $k = " . ($v ? ($k === 'SMTP_PASS' ? '(set)' : $v) : '(not set)') . "\n";
}
echo "\n";

echo "     host: $host  port: $port\n";
echo "     user: " . ($user ?: '(EMPTY!)') . "\n";
echo "     pass: " . ($pass ? '(set, ' . strlen($pass) . ' chars)' : '(EMPTY!)') . "\n\n";

if (!$host || !$user || !$pass) {
    echo "[FAIL] config.php has empty values — fill in smtp_host, smtp_user, smtp_pass\n";
    exit;
}

// 2. Check fsockopen exists
if (!function_exists('fsockopen')) {
    echo "[FAIL] fsockopen() is DISABLED on this server — SMTP cannot work.\n";
    echo "       You must use an HTTP email API instead (Brevo/SendGrid).\n";
    exit;
}
echo "[OK] fsockopen() available\n";

// 3. Test TCP connection
echo "\n--- Testing connection to $host:$port ---\n";
$useSsl = ($port === 465);
$remote = ($useSsl ? 'ssl://' : '') . $host;
$socket = @fsockopen($remote, $port, $errno, $errstr, 15);

if (!$socket) {
    echo "[FAIL] Cannot connect: $errstr ($errno)\n";
    echo "       HostForge is likely BLOCKING outbound SMTP ports.\n";
    echo "       Options: try port 465, ask HostForge to open the port,\n";
    echo "       or use an HTTP email API (Brevo free tier = 300/day).\n";
    exit;
}
echo "[OK] TCP connection established\n";

// 4. SMTP conversation
$read = function() use ($socket) {
    $data = '';
    while ($line = fgets($socket, 515)) {
        $data .= $line;
        if (isset($line[3]) && $line[3] === ' ') break;
    }
    return $data;
};

echo "Greeting: " . trim($read()) . "\n";
fwrite($socket, "EHLO test\r\n");
echo "EHLO: " . trim($read()) . "\n";

if (!$useSsl) {
    fwrite($socket, "STARTTLS\r\n");
    $tlsResp = trim($read());
    echo "STARTTLS: $tlsResp\n";
    if (strpos($tlsResp, '220') === false) {
        echo "[FAIL] Server rejected STARTTLS — try port 465\n";
        fclose($socket);
        exit;
    }
    if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
        echo "[FAIL] TLS handshake failed — server SSL misconfigured or blocked\n";
        fclose($socket);
        exit;
    }
    echo "[OK] TLS encryption enabled\n";
    fwrite($socket, "EHLO test\r\n");
    $read();
}

fwrite($socket, "AUTH LOGIN\r\n");
echo "AUTH LOGIN: " . trim($read()) . "\n";
fwrite($socket, base64_encode($user) . "\r\n");
$read();
fwrite($socket, base64_encode($pass) . "\r\n");
$authResp = trim($read());
echo "Auth: $authResp\n";

if (strpos($authResp, '235') === false) {
    echo "\n[FAIL] Authentication rejected.\n";
    echo "       - Make sure you used an APP PASSWORD, not your Gmail password\n";
    echo "       - 2-Step Verification must be ON for the account\n";
    echo "       - Generate a fresh app password at myaccount.google.com/apppasswords\n";
    fclose($socket);
    exit;
}

echo "[OK] Authenticated!\n";
fwrite($socket, "QUIT\r\n");
fclose($socket);

echo "\n=== ALL CHECKS PASSED — SMTP is working! ===\n";
echo "If OTP still fails, the problem is in api/index.php, not SMTP.\n";
echo "DELETE this file now.\n";
echo "</pre>";
