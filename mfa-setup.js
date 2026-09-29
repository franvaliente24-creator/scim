// ==========================================
// MFA SETUP PAGE LOGIC (optional authenticator-app section)
// ==========================================

const $ = (s) => document.querySelector(s);
const api = (path, options) => fetch(`/api/v1/${path}`, options);

const generateBtn = $('#generateMFA');
if (generateBtn) generateBtn.onclick = async () => {
  try {
    const response = await api('mfa/setup', { method: 'POST' });
    const data = await response.json();

    if (response.ok) {
      $('#mfaSetup').style.display = 'none';
      $('#mfaQRCode').style.display = 'block';
      $('#mfaVerify').style.display = 'block';
      $('#secretDisplay').textContent = data.secret;
      $('#qrCodeDisplay').innerHTML = `
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data.qr_code_uri)}" alt="MFA QR Code" style="width:180px;height:180px;">
      `;
    } else {
      alert('Failed to generate MFA secret');
    }
  } catch (error) {
    console.error('Error generating MFA secret:', error);
    alert('Error generating MFA secret');
  }
};

const verifyBtn = $('#verifyMFA');
if (verifyBtn) verifyBtn.onclick = async () => {
  const code = $('#mfaCode').value.trim();
  const message = $('#mfaMessage');

  if (code.length !== 6) {
    message.textContent = 'Please enter a 6-digit code';
    message.style.color = '#dc2626';
    return;
  }

  try {
    const response = await api('mfa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();

    if (response.ok) {
      message.textContent = 'Authenticator app enabled.';
      message.style.color = '#059669';
      $('#mfaCode').disabled = true;
      verifyBtn.disabled = true;
    } else {
      message.textContent = data.error;
      message.style.color = '#dc2626';
    }
  } catch (error) {
    message.textContent = 'Error verifying MFA code';
    message.style.color = '#dc2626';
  }
};

// Logout is handled centrally by layout.js (confirmation modal).

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initializePermissions === 'function') initializePermissions();
});