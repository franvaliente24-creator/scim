// Profile Page - Load user data and handle avatar upload
const $ = (id) => document.getElementById(id);

async function loadProfileData() {
    try {
        const response = await fetch('/api/v1/auth/me');
        const data = await response.json();
        if (response.ok && data.user) {
            const u = data.user;
            const roleLabel = (typeof getRoleDisplayName === 'function') ? getRoleDisplayName(u.role) : u.role;
            if ($('profileName')) $('profileName').textContent = u.name || 'User';
            if ($('profileFullName')) $('profileFullName').textContent = u.name || '—';
            if ($('profileEmail')) $('profileEmail').textContent = u.email || '—';
            if ($('profileRole')) $('profileRole').textContent = roleLabel || '—';
            if ($('profileUserRole')) $('profileUserRole').textContent = roleLabel || '—';
            if ($('profileStatus')) $('profileStatus').textContent = u.status || 'Active';
            if (u.avatar) document.querySelectorAll('img.user-profile-img').forEach(img => { img.src = u.avatar; });
            // Admins can edit their own display name — swap the lock for an edit control
            if (u.role === 'Admin') {
                $('nameEditBtn')?.classList.remove('hidden');
                $('nameLockIcon')?.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Error loading profile data:', error);
    }
}

// Avatar upload
const avatarBtn = $('avatarUploadBtn');
const avatarInput = $('avatarInput');
const avatarStatus = $('avatarStatus');

if (avatarBtn && avatarInput) {
    avatarBtn.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        avatarStatus.textContent = 'Uploading...';
        avatarStatus.style.color = '#64748b';
        const fd = new FormData();
        fd.append('avatar', file);
        try {
            const res = await fetch('/api/v1/profile/avatar', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed.');
            document.querySelectorAll('img.user-profile-img').forEach(img => { img.src = data.avatar + '?t=' + Date.now(); });
            avatarStatus.style.color = '#059669';
            avatarStatus.textContent = 'Profile photo updated.';
        } catch (err) {
            avatarStatus.style.color = '#dc2626';
            avatarStatus.textContent = err.message;
        } finally {
            avatarInput.value = '';
        }
    });
}

// Admin inline name edit
$('nameEditBtn')?.addEventListener('click', () => {
    $('nameEditInput').value = $('profileFullName').textContent === '—' ? '' : $('profileFullName').textContent;
    $('nameEditRow').classList.remove('hidden');
    $('nameEditRow').classList.add('flex');
    $('nameEditInput').focus();
});
$('nameEditCancel')?.addEventListener('click', () => {
    $('nameEditRow').classList.add('hidden');
    $('nameEditRow').classList.remove('flex');
});
$('nameEditSave')?.addEventListener('click', async () => {
    const name = $('nameEditInput').value.trim();
    if (!name) return;
    const btn = $('nameEditSave');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
        const res = await fetch('/api/v1/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed.');
        $('profileFullName').textContent = name;
        $('profileName').textContent = name;
        $('nameEditRow').classList.add('hidden');
        $('nameEditRow').classList.remove('flex');
        avatarStatus.style.color = '#059669';
        avatarStatus.textContent = 'Display name updated.';
    } catch (err) {
        avatarStatus.style.color = '#dc2626';
        avatarStatus.textContent = err.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save';
    }
});

// Activity Log — personal feed; Admins may toggle the platform-wide view.
let activityAll = false;
async function loadActivityLog() {
    const list = $('activityLogList');
    if (!list) return;
    const q = ($('activitySearch')?.value || '').toLowerCase();
    const res = await fetch('/api/v1/activity-log' + (activityAll ? '?all=1' : ''));
    const data = await res.json().catch(() => ({}));
    const rows = (data.items || []).filter((r) => !q || `${r.action} ${r.entity_ref} ${r.details || ''}`.toLowerCase().includes(q));
    if (data.can_view_all) $('activityAllWrap')?.classList.replace('hidden', 'flex');
    list.innerHTML = rows.length ? `<table class="w-full text-sm min-w-[560px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">Time</th><th class="py-2 pr-4 font-medium text-slate-600">User</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Action</th><th class="py-2 font-medium text-slate-600">Record</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="border-b border-slate-100">
            <td class="py-2.5 pr-4 text-slate-500 text-xs whitespace-nowrap">${new Date(r.created_at).toLocaleString()}</td>
            <td class="py-2.5 pr-4 text-slate-600">${r.user_name || '—'}</td>
            <td class="py-2.5 pr-4 font-medium text-slate-800">${r.action}</td>
            <td class="py-2.5 text-slate-500 text-xs">${r.entity || ''} ${r.entity_ref || ''}</td>
        </tr>`).join('')}</tbody></table>`
        : '<p class="text-sm text-slate-400 py-8 text-center">No activity recorded yet.</p>';
}
$('activitySearch')?.addEventListener('input', loadActivityLog);
$('activityAll')?.addEventListener('change', (e) => { activityAll = e.target.checked; loadActivityLog(); });
if (location.hash === '#activity') setTimeout(() => $('activity')?.scrollIntoView({ behavior: 'smooth' }), 300);

if (typeof initializePermissions === 'function') initializePermissions();
loadProfileData();
loadActivityLog();
