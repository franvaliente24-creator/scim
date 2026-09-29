<?php
// smtp-test.php — Upload to site ROOT (same folder as index.html).
// Visit https://scim.greatsolomonmpservices.com/smtp-test.php in your browser.
// DELETE THIS FILE after testing — it reveals config details.

echo "<pre>";
echo "=== SCIM SMTP Diagnostic ===\n\n";

// 1. Check config.php exists
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    echo "[FAIL] config.php NOT FOUND at: $configFile\n";
    echo "       Upload config.php to this folder and retry.\n";
    exit;
}
echo "[OK] config.php found\n";

$config = require $configFile;
$host = $config['smtp_host'] ?? '';
$port = (int)($config['smtp_port'] ?? 587);
$user = $config['smtp_user'] ?? '';
$pass = $config['smtp_pass'] ?? '';

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
