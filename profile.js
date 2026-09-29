// Profile Page - Load user data
const $ = (id) => document.getElementById(id);

// Load user profile data
async function loadProfileData() {
    try {
        const response = await fetch('/api/v1/auth/me');
        const data = await response.json();
        
        if (response.ok && data.user) {
            const user = data.user;
            
            // Update profile information
            if ($('#profileName')) $('#profileName').textContent = user.name || 'User Name';
            if ($('#profileEmail')) $('#profileEmail').textContent = user.email || 'user@example.com';
            if ($('#profileRole')) $('#profileRole').textContent = user.role || 'User';
            if ($('#profileUserRole')) $('#profileUserRole').textContent = user.role || 'User';
            if ($('#profileStatus')) $('#profileStatus').textContent = user.status || 'Active';
            if ($('#profileMFAStatus')) $('#profileMFAStatus').textContent = user.mfa_enabled ? 'Enabled' : 'Disabled';
            
            // Update header
            if ($('#headerUserRole')) $('#headerUserRole').textContent = user.role || 'User';
            if ($('#dropdownUserName')) $('#dropdownUserName').textContent = user.name || 'User';
            if ($('#dropdownUserEmail')) $('#dropdownUserEmail').textContent = user.email || 'user@example.com';
        }
    } catch (error) {
        console.error('Error loading profile data:', error);
    }
}

// Initialize permissions
if (typeof initializePermissions === 'function') {
    initializePermissions();
}

// Load profile data on page load
loadProfileData();
