// ==========================================
// 1. UTILITY FUNCTIONS
// ==========================================
const $ = (s) => document.querySelector(s);

const api = (path, options) => fetch(`/api/v1/${path}`, options);


// ==========================================
// 2. AUTHENTICATION & ACCESS CONTROL
// ==========================================
async function requireAdmin() {
  const response = await api('auth/me');
  const data = await response.json();

  if (!data.user) {
    location.replace('login.html');
    return false;
  }

  if (data.user.role !== 'Admin') {
    document.querySelector('.admin-page').innerHTML = `
      <section class="access-denied">
        <h1>Access denied</h1>
        <p>Only administrators can manage accounts.</p>
        <a href="index.html">Return to dashboard</a>
      </section>
    `;
    return false;
  }

  return true;
}


// ==========================================
// 3. USER MANAGEMENT FUNCTIONS
// ==========================================
async function loadUsers() {
  const response = await api('users');
  const users = await response.json();

  $('#users').innerHTML = users
    .map(
      (u) => `
        <div class="user-row">
          <div>
            <b>${u.full_name}</b>
            <small>${u.email}</small>
          </div>
          <span class="role ${u.role.toLowerCase()}">${u.role}</span>
        </div>
      `
    )
    .join('');
}


// ==========================================
// 4. EVENT LISTENERS
// ==========================================

// Create User Form Submission
$('#userForm').onsubmit = async (e) => {
  e.preventDefault();
  const message = $('#formMessage');
  const button = e.target.querySelector('button');

  button.disabled = true;
  message.textContent = '';

  try {
    const response = await api('users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not create account.');
    }

    e.target.reset();
    message.textContent = 'Account created.';
    await loadUsers();
  } catch (err) {
    message.textContent = err.message;
  } finally {
    button.disabled = false;
  }
};

// Logout Handler
$('#logout').onclick = () =>
  api('auth/logout', { method: 'POST' }).finally(() =>
    location.replace('login.html')
  );


// ==========================================
// 5. INITIALIZATION
// ==========================================
requireAdmin().then((isAuthorized) => {
  if (isAuthorized) {
    loadUsers();
  }
});