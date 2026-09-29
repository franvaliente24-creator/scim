// ==========================================
// 1. UTILITY FUNCTIONS
// ==========================================
const $ = (s) => document.querySelector(s);

const api = (path, options) => fetch(`/api/v1/${path}`, options);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mask an email for display: f*****e@gmail.com
const maskEmail = (email) => {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return '•••';
  const visible = name.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(3, name.length - 2))}@${domain}`;
};

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
    const main = document.querySelector('main');
    if (main) main.innerHTML = `
      <section class="access-denied" style="padding:60px;text-align:center;">
        <h1 style="font-size:22px;font-weight:700;">Access denied</h1>
        <p style="color:#64748b;margin:8px 0 20px;">Only administrators can manage accounts.</p>
        <a href="index.html" style="background:#5046e5;color:#fff;padding:10px 24px;border-radius:10px;text-decoration:none;">Return to dashboard</a>
      </section>`;
    return false;
  }

  return true;
}

// ==========================================
// 3. USER MANAGEMENT FUNCTIONS
// ==========================================
let allUsers = [];

async function loadUsers() {
  const response = await api('users');
  const users = await response.json();
  allUsers = Array.isArray(users) ? users : [];
  const list = $('#users');
  if (!list) return;

  list.innerHTML = allUsers.map((u) => `
    <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm overflow-hidden shrink-0">
          ${u.avatar ? `<img src="${esc(u.avatar)}" class="w-full h-full object-cover" alt="">` : esc((u.full_name || '?').charAt(0).toUpperCase())}
        </div>
        <div class="min-w-0">
          <b class="text-sm block truncate">${esc(u.full_name)}</b>
          <small class="text-slate-500 block truncate">${esc(maskEmail(u.email))}</small>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="role ${esc(u.role.toLowerCase())}">${esc(u.role)}</span>
        <span class="text-xs ${u.is_active ? 'text-emerald-600' : 'text-slate-400'}">${u.is_active ? 'Active' : 'Disabled'}</span>
        <button class="action-btn action-btn-edit" onclick="editUser(${u.id})">Edit</button>
        <button class="action-btn action-btn-danger" onclick="deleteUser(${u.id})">Delete</button>
      </div>
    </div>`).join('');
}

// Login history — paginated + filterable
let historyPage = 1;
function historyQuery(page) {
  const p = new URLSearchParams({ page, per_page: 10 });
  const s = $('#historySearch')?.value.trim();
  const r = $('#historyResult')?.value;
  const f = $('#historyDateFrom')?.value;
  const t = $('#historyDateTo')?.value;
  if (s) p.set('search', s);
  if (r) p.set('result', r);
  if (f) p.set('date_from', f);
  if (t) p.set('date_to', t);
  return p.toString();
}
async function loadLoginHistory(page = 1) {
  const el = $('#loginHistory');
  if (!el) return;
  try {
    const res = await api(`login-history?${historyQuery(page)}`);
    const data = await res.json();
    const items = data.items || [];
    historyPage = data.page || 1;

    el.innerHTML = items.length
      ? `<table class="data-table w-full text-sm">
          <thead><tr><th>User</th><th>Email</th><th>Result</th><th>IP</th><th>Time</th></tr></thead>
          <tbody>${items.map((h) => `
            <tr>
              <td><b>${esc(h.full_name || '—')}</b></td>
              <td>${esc(maskEmail(h.email))}</td>
              <td><span class="role ${h.success ? 'manager' : 'admin'}">${h.success ? 'Success' : 'Failed'}</span></td>
              <td class="text-slate-500">${esc(h.ip_address || '—')}</td>
              <td class="text-slate-500">${new Date(h.created_at).toLocaleString()}</td>
            </tr>`).join('')}</tbody>
        </table>`
      : '<p class="text-slate-400 text-sm py-4">No login history yet.</p>';

    const totalEl = $('#historyTotal');
    if (totalEl) totalEl.textContent = `${data.total} events`;
    const infoEl = $('#historyPageInfo');
    if (infoEl) infoEl.textContent = `Page ${data.page} of ${data.pages}`;
    const prev = $('#historyPrev');
    const next = $('#historyNext');
    if (prev) prev.disabled = data.page <= 1;
    if (next) next.disabled = data.page >= data.pages;
  } catch (error) {
    console.error('Error loading login history:', error);
    el.innerHTML = '<p class="text-red-500 text-sm py-4">Unable to load login history</p>';
  }
}

// Admin request queue (password resets etc.)
async function loadAdminRequests() {
  const el = $('#adminRequests');
  if (!el) return;
  try {
    const res = await api('admin-notifications');
    const data = await res.json();
    const items = (data.items || []).filter((i) => i.status === 'Pending');

    const badge = $('#requestsBadge');
    if (badge) {
      badge.textContent = items.length;
      badge.classList.toggle('hidden', !items.length);
    }

    el.innerHTML = items.length
      ? items.map((n) => `
        <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
          <div class="min-w-0">
            <b class="text-sm">${esc(n.title)}</b>
            <p class="text-xs text-slate-500 truncate">${esc(n.details || '')} ${n.user_email ? '· ' + esc(n.user_email) : ''}</p>
            <small class="text-slate-400">${new Date(n.created_at).toLocaleString()}</small>
          </div>
          <button class="text-button text-emerald-600" onclick="resolveRequest(${n.id})">Resolve</button>
        </div>`).join('')
      : '<p class="text-slate-400 text-sm py-2">No pending requests.</p>';
  } catch (e) {
    console.error('Requests error:', e);
  }
}

window.resolveRequest = async (id) => {
  await api('notifications/dismiss', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  });
  loadAdminRequests();
};

// ==========================================
// 4. EVENT LISTENERS
// ==========================================

// Password visibility toggles (both fields)
document.querySelectorAll('.pw-eye').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.querySelector('.material-symbols-outlined').textContent = show ? 'visibility_off' : 'visibility';
  });
});

// Create User Form Submission
const userForm = $('#userForm');
if (userForm) userForm.onsubmit = async (e) => {
  e.preventDefault();
  const message = $('#formMessage');
  const button = e.target.querySelector('button[type=submit]');
  const payload = Object.fromEntries(new FormData(e.target));

  if (payload.password !== payload.confirm_password) {
    message.style.color = '#dc2626';
    message.textContent = 'Passwords do not match.';
    return;
  }
  delete payload.confirm_password;

  button.disabled = true;
  message.textContent = '';

  try {
    const response = await api('users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not create account.');

    e.target.reset();
    message.style.color = '#059669';
    message.textContent = 'Account created.';
    await loadUsers();
  } catch (err) {
    message.style.color = '#dc2626';
    message.textContent = err.message;
  } finally {
    button.disabled = false;
  }
};

// Pagination + filter controls
$('#historyPrev')?.addEventListener('click', () => loadLoginHistory(historyPage - 1));
$('#historyNext')?.addEventListener('click', () => loadLoginHistory(historyPage + 1));
$('#historySearch')?.addEventListener('input', () => loadLoginHistory(1));
$('#historyResult')?.addEventListener('change', () => loadLoginHistory(1));
$('#historyDateFrom')?.addEventListener('change', () => loadLoginHistory(1));
$('#historyDateTo')?.addEventListener('change', () => loadLoginHistory(1));

// NOTE: logout is handled centrally by layout.js (confirmation modal)

// ==========================================
// 5. INITIALIZATION
// ==========================================
requireAdmin().then((isAuthorized) => {
  if (isAuthorized) {
    initializePermissions().then(() => {
      loadUsers();
      loadLoginHistory();
      loadAdminRequests();
    });
  }
});

// Edit User — modal card (prefilled from the cached user list)
const editUserModal = $('#editUserModal');
const deleteUserModal = $('#deleteUserModal');
let deleteTargetId = null;

window.editUser = (userId) => {
  const u = allUsers.find((x) => x.id === userId);
  if (!u) return;
  $('#editUserId').value = u.id;
  $('#editUserName').value = u.full_name || '';
  $('#editUserEmail').value = u.email || '';
  $('#editUserRole').value = u.role || 'WarehouseStaff';
  $('#editUserActive').checked = !!Number(u.is_active);
  const sub = $('#editUserSubtitle');
  if (sub) sub.textContent = maskEmail(u.email || '');
  editUserModal?.showModal();
};

$('#closeEditUserModal')?.addEventListener('click', () => editUserModal?.close());
$('#editUserCancel')?.addEventListener('click', () => editUserModal?.close());

$('#editUserForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = $('#editUserId').value;
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const response = await api(`users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: $('#editUserName').value.trim(),
        email: $('#editUserEmail').value.trim(),
        role: $('#editUserRole').value,
        is_active: $('#editUserActive').checked ? 1 : 0,
      }),
    });
    if (response.ok) { editUserModal?.close(); loadUsers(); }
    else {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Failed to update user');
    }
  } catch (error) {
    console.error('Error updating user:', error);
    alert('Error updating user');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

// Delete User — confirmation card
window.deleteUser = (userId) => {
  const u = allUsers.find((x) => x.id === userId);
  deleteTargetId = userId;
  const nameEl = $('#deleteUserName');
  if (nameEl) nameEl.textContent = u ? u.full_name : 'this user';
  deleteUserModal?.showModal();
};

$('#deleteUserCancel')?.addEventListener('click', () => { deleteTargetId = null; deleteUserModal?.close(); });
$('#deleteUserConfirm')?.addEventListener('click', async () => {
  if (deleteTargetId == null) return;
  const btn = $('#deleteUserConfirm');
  btn.disabled = true;
  btn.textContent = 'Deleting...';
  try {
    const response = await api(`users/${deleteTargetId}`, { method: 'DELETE' });
    if (response.ok) { deleteUserModal?.close(); loadUsers(); }
    else alert('Failed to delete user');
  } catch (error) {
    console.error('Error deleting user:', error);
    alert('Error deleting user');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
    deleteTargetId = null;
  }
});
