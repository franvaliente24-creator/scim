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

if (typeof initializePermissions === 'function') initializePermissions();
loadProfileData();
