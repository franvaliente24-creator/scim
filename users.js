// ==========================================
// 1. UTILITY FUNCTIONS
// ==========================================
const $ = (s) => {
  const element = document.querySelector(s);
  if (!element) {
    console.warn(`Element not found: ${s}`);
    return null;
  }
  return element;
};

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
          <div>
            <span class="role ${u.role.toLowerCase()}">${u.role}</span>
            <button class="text-button" onclick="editUser(${u.id})">Edit</button>
            <button class="text-button" onclick="deleteUser(${u.id})" style="color: #dc2626;">Delete</button>
          </div>
        </div>
      `
    )
    .join('');
}

async function loadLoginHistory() {
  try {
    const response = await api('login-history');
    const history = await response.json();
    
    $('#loginHistory').innerHTML = history.map((h) => `
      <div class="user-row">
        <div>
          <b>${h.email}</b>
          <small>${new Date(h.created_at).toLocaleString()}</small>
        </div>
        <span class="role ${h.success ? 'manager' : 'admin'}">${h.success ? 'Success' : 'Failed'}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading login history:', error);
    $('#loginHistory').innerHTML = '<p class="muted">Unable to load login history</p>';
  }
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
    // Initialize permissions
    initializePermissions().then(() => {
      loadUsers();
      loadLoginHistory();
    });
  }
});

// Edit User Function
window.editUser = async (userId) => {
  const fullName = prompt('Enter new full name:');
  if (fullName === null) return;
  
  const email = prompt('Enter new email:');
  if (email === null) return;
  
  const role = prompt('Enter new role (Admin, Manager, WarehouseStaff):');
  if (role === null) return;
  
  const isActive = confirm('Is this user active?');
  
  try {
    const response = await api(`users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        email: email,
        role: role,
        is_active: isActive ? 1 : 0
      }),
    });

    if (response.ok) {
      loadUsers();
    } else {
      alert('Failed to update user');
    }
  } catch (error) {
    console.error('Error updating user:', error);
    alert('Error updating user');
  }
};

// Delete User Function
window.deleteUser = async (userId) => {
  if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await api(`users/${userId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      loadUsers();
    } else {
      alert('Failed to delete user');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    alert('Error deleting user');
  }
};