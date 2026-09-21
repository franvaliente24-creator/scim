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
document.querySelector('#togglePassword').onclick = () => {
  password.type = password.type === 'password' ? 'text' : 'password';
};

// Forgot Password Notice
document.querySelector('#forgotPassword').onclick = (e) => {
  e.preventDefault();
  error.textContent = 'Please contact your system administrator to reset your password.';
};

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

    window.location.href = 'index.html';
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    button.textContent = 'Sign In';
  }
};