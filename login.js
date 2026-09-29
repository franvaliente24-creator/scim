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

// Forgot Password Modal
const forgotLink = document.querySelector('#forgotPassword');
const forgotModal = document.querySelector('#forgotModal');
const forgotModalClose = document.querySelector('#forgotModalClose');

if (forgotLink && forgotModal) {
  forgotLink.onclick = (e) => {
    e.preventDefault();
    forgotModal.classList.remove('hidden');
  };
  
  const closeModal = () => forgotModal.classList.add('hidden');
  forgotModalClose.onclick = closeModal;
  forgotModal.onclick = (e) => { if (e.target === forgotModal) closeModal(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
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
      // Store email in sessionStorage for OTP page
      sessionStorage.setItem('mfa_email', data.email || '');
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