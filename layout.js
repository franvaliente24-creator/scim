// ==========================================
// LAYOUT INTERACTIONS (Sidebar, Profile Dropdown)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar Toggle Functionality
  const sidebarToggle = document.getElementById('desktop-sidebar-toggle');
  const sidebar = document.getElementById('app-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
  let sidebarOpen = false;

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('translate-x-0');
      sidebarBackdrop.classList.remove('hidden');
      setTimeout(() => {
        sidebarBackdrop.classList.remove('opacity-0');
      }, 10);
      sidebarToggleIcon.textContent = 'menu';
    } else {
      sidebar.classList.add('-translate-x-full');
      sidebar.classList.remove('translate-x-0');
      sidebarBackdrop.classList.add('opacity-0');
      setTimeout(() => {
        sidebarBackdrop.classList.add('hidden');
      }, 300);
      sidebarToggleIcon.textContent = 'menu_open';
    }
  }

  // Desktop sidebar collapse (icon-only mode)
  function toggleDesktopSidebar() {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    sidebarToggleIcon.textContent = isCollapsed ? 'menu_open' : 'menu';
  }

  // On desktop, toggle collapsed state instead of mobile behavior
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth >= 768) {
        toggleDesktopSidebar();
      } else {
        toggleSidebar();
      }
    });
  }

  // Close sidebar when clicking backdrop
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', toggleSidebar);
  }

  // Profile Dropdown Functionality
  const profileToggle = document.getElementById('profile-dropdown-toggle');
  const profileMenu = document.getElementById('profile-dropdown-menu');
  let profileMenuOpen = false;

  function toggleProfileMenu(e) {
    e.stopPropagation();
    profileMenuOpen = !profileMenuOpen;
    
    if (profileMenuOpen) {
      profileMenu.classList.remove('hidden');
      setTimeout(() => {
        profileMenu.classList.remove('opacity-0', 'scale-95');
      }, 10);
      profileToggle.setAttribute('aria-expanded', 'true');
    } else {
      profileMenu.classList.add('opacity-0', 'scale-95');
      setTimeout(() => {
        profileMenu.classList.add('hidden');
      }, 200);
      profileToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function closeProfileMenu() {
    if (profileMenuOpen) {
      profileMenuOpen = false;
      profileMenu.classList.add('opacity-0', 'scale-95');
      setTimeout(() => {
        profileMenu.classList.add('hidden');
      }, 200);
      profileToggle.setAttribute('aria-expanded', 'false');
    }
  }

  if (profileToggle) {
    profileToggle.addEventListener('click', toggleProfileMenu);
  }

  // Close profile menu when clicking outside
  document.addEventListener('click', (e) => {
    if (profileMenuOpen && !profileMenu.contains(e.target) && !profileToggle.contains(e.target)) {
      closeProfileMenu();
    }
  });

  // Active link highlighting based on current page
  const currentPath = window.location.pathname;
  const navLinks = document.querySelectorAll('.sidebar-subsystem-link, .sidebar-main-link');
  
  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    if (linkPath && currentPath.includes(linkPath)) {
      link.classList.add('active');
      // Remove active from dashboard link if on a module page
      if (linkPath !== 'index.html') {
        document.getElementById('sidebar-dashboard-link').classList.remove('active');
      }
    }
  });

  // Handle responsive sidebar state
  function handleResize() {
    if (window.innerWidth >= 768) {
      // Desktop: always show sidebar
      sidebar.classList.remove('-translate-x-full');
      sidebar.classList.add('translate-x-0');
      sidebarBackdrop.classList.add('hidden');
    } else {
      // Mobile: hide sidebar by default
      if (!sidebarOpen) {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
      }
    }
  }

  window.addEventListener('resize', handleResize);
  handleResize(); // Initial check

  // Logout functionality
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/v1/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
      } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'login.html';
      }
    });
  }

  // Profile dropdown links are handled as regular HTML links (<a href="...">)
  // No JavaScript needed for navigation links in the dropdown
});