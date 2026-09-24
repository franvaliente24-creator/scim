// ==========================================
// MFA SETUP PAGE LOGIC
// ==========================================

const $ = (s) => document.querySelector(s);

const api = (path, options) => fetch(`/api/v1/${path}`, options);

// ==========================================
// MFA STATUS LOADING
// ==========================================
async function loadMFAStatus() {
  try {
    const response = await api('auth/me');
    const data = await response.json();
    
    if (data.user && data.user.mfa_enabled) {
      $('#mfaStatus').innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
          <h3 style="margin: 0 0 8px; color: #059669;">MFA Enabled</h3>
          <p class="muted">Your account is protected with two-factor authentication.</p>
        </div>
      `;
      $('#mfaSetup').style.display = 'none';
    } else {
      $('#mfaStatus').innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
          <h3 style="margin: 0 0 8px; color: #d97706;">MFA Not Enabled</h3>
          <p class="muted">Set up two-factor authentication for enhanced security.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading MFA status:', error);
    $('#mfaStatus').innerHTML = '<p class="muted">Unable to load MFA status</p>';
  }
}

// ==========================================
// MFA SETUP FUNCTIONS
// ==========================================
$('#generateMFA').onclick = async () => {
  try {
    const response = await api('mfa/setup', {
      method: 'POST',
    });

    const data = await response.json();

    if (response.ok) {
      $('#mfaSetup').style.display = 'none';
      $('#mfaQRCode').style.display = 'block';
      $('#mfaVerify').style.display = 'block';
      
      // Display secret (in production, this should be shown more securely)
      $('#secretDisplay').textContent = data.secret;
      
      // Generate QR code using a QR code library or API
      // For now, we'll show the URI that can be used to generate a QR code
      $('#qrCodeDisplay').innerHTML = `
        <p class="muted" style="margin: 0;">QR Code URI:</p>
        <textarea style="width: 200px; height: 60px; font-size: 10px; margin: 8px 0;">${data.qr_code_uri}</textarea>
        <p class="muted" style="font-size: 11px;">Use this URI with a QR code generator</p>
      `;
    } else {
      alert('Failed to generate MFA secret');
    }
  } catch (error) {
    console.error('Error generating MFA secret:', error);
    alert('Error generating MFA secret');
  }
};

$('#verifyMFA').onclick = async () => {
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
      body: JSON.stringify({ code: code }),
    });

    const data = await response.json();

    if (response.ok) {
      message.textContent = data.message;
      message.style.color = '#059669';
      $('#mfaCode').disabled = true;
      $('#verifyMFA').disabled = true;
      setTimeout(() => {
        loadMFAStatus();
        window.location.href = 'index.html';
      }, 2000);
    } else {
      message.textContent = data.error;
      message.style.color = '#dc2626';
    }
  } catch (error) {
    console.error('Error verifying MFA:', error);
    message.textContent = 'Error verifying MFA code';
    message.style.color = '#dc2626';
  }
};

// ==========================================
// MFA DISABLE FUNCTION
// ==========================================
$('#disableMFAForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  if (!confirm('Are you sure you want to disable MFA? This will reduce your account security.')) {
    return;
  }

  try {
    const response = await api('mfa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (response.ok) {
      alert(result.message);
      e.target.reset();
      loadMFAStatus();
    } else {
      alert(result.error);
    }
  } catch (error) {
    console.error('Error disabling MFA:', error);
    alert('Error disabling MFA');
  }
};

// ==========================================
// NAVIGATION
// ==========================================
$('#logout').onclick = () =>
  api('auth/logout', { method: 'POST' }).finally(() =>
    window.location.replace('login.html')
  );

// ==========================================
// INITIALIZATION
// ==========================================
loadMFAStatus();