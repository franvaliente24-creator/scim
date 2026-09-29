// ==========================================
// 1. DOM ELEMENTS
// ==========================================
const form = document.querySelector('#loginForm');
const error = document.querySelector('#loginError');
const password = document.querySelector('#password');


// ==========================================
// 2. EVENT LISTENERS
// ==========================================

// Toggle Password Visibility
const togglePasswordBtn = document.querySelector('#togglePassword');
if (togglePasswordBtn) {
  togglePasswordBtn.onclick = () => {
    const isPassword = password.type === 'password';
    password.type = isPassword ? 'text' : 'password';
    togglePasswordBtn.querySelector('.material-symbols-outlined').textContent =
      isPassword ? 'visibility_off' : 'visibility';
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  };
}

// Forgot Password — notify the administrator for a reset
const forgotLink = document.querySelector('#forgotPassword');
const forgotModal = document.querySelector('#forgotModal');
const forgotModalClose = document.querySelector('#forgotModalClose');
const forgotModalSend = document.querySelector('#forgotModalSend');
const forgotEmail = document.querySelector('#forgotEmail');
const forgotStatus = document.querySelector('#forgotStatus');

if (forgotLink && forgotModal) {
  forgotLink.onclick = (e) => {
    e.preventDefault();
    forgotEmail.value = form.email?.value || '';
    forgotStatus.textContent = '';
    forgotModal.classList.remove('hidden');
  };

  const closeModal = () => forgotModal.classList.add('hidden');
  forgotModalClose.onclick = closeModal;
  forgotModal.onclick = (e) => { if (e.target === forgotModal) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  forgotModalSend.onclick = async () => {
    forgotModalSend.disabled = true;
    forgotModalSend.textContent = 'Sending...';
    forgotStatus.style.color = '#64748b';
    forgotStatus.textContent = '';
    try {
      const res = await fetch('/api/v1/auth/reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed.');
      forgotStatus.style.color = '#059669';
      forgotStatus.textContent = 'Administrator notified. You will be contacted once your credentials are reset.';
      forgotModalSend.style.display = 'none';
    } catch (err) {
      forgotStatus.style.color = '#dc2626';
      forgotStatus.textContent = err.message;
    } finally {
      forgotModalSend.disabled = false;
      forgotModalSend.textContent = 'Notify Admin';
    }
  };
}

// Form Submission / Sign In Handler
form.onsubmit = async (e) => {
  e.preventDefault();
  error.textContent = '';
  
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  button.textContent = 'Signing in...';

  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to sign in.');
    }

    // Check if 2FA is required
    if (data.requires_2fa) {
      // Per-tab MFA ticket + email for the OTP page (sessionStorage = tab-scoped)
      if (window.scimSetTicket) scimSetTicket(data.ticket || '');
      sessionStorage.setItem('mfa_email', data.email || '');
      sessionStorage.setItem('otp_issued_at', Date.now().toString());
      window.location.href = 'otp.html';
      return;
    }

    // Direct login without 2FA
    window.location.href = 'index.html';
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    button.textContent = 'Sign In';
  }
};