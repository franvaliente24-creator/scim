// ==========================================
// LOGIN PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

// Authentication
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData)),
  });

  if (!response.ok) {
    alert('Sign-in failed.');
    return;
  }

  // Redirect to dashboard on successful login
  window.location.href = 'index.html';
};
