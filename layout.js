// ==========================================
// LAYOUT INTERACTIONS (Sidebar, Profile Dropdown)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('Layout.js loaded'); // Debug log
  
  // Sidebar Toggle Functionality
  const sidebarToggle = document.getElementById('desktop-sidebar-toggle');
  const sidebar = document.getElementById('app-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
  
  console.log('Sidebar elements:', { sidebarToggle, sidebar, sidebarBackdrop, sidebarToggleIcon }); // Debug log
  
  if (!sidebarToggle) {
    console.error('Sidebar toggle button not found');
    return;
  }
  
  if (!sidebar) {
    console.error('Sidebar element not found');
    return;
  }
  
  let sidebarOpen = false;

  function toggleSidebar() {
    console.log('Toggle sidebar called, current state:', sidebarOpen); // Debug log
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
  sidebarToggle.addEventListener('click', () => {
    console.log('Sidebar toggle clicked, window width:', window.innerWidth); // Debug log
    if (window.innerWidth >= 768) {
      toggleDesktopSidebar();
    } else {
      toggleSidebar();
    }
  });

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

  // Logout functionality with confirmation modal
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    // Inject sign-out confirmation modal
    document.body.insertAdjacentHTML('beforeend', `
      <div id="logoutModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] hidden items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center relative" role="dialog" aria-modal="true">
          <button id="logoutModalX" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Close">
            <span class="material-symbols-outlined text-xl">close</span>
          </button>
          <div class="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-5">
            <span class="material-symbols-outlined text-indigo-600 text-3xl">logout</span>
          </div>
          <h2 class="text-xl font-bold text-slate-900 mb-2">Sign Out of Session?</h2>
          <p class="text-sm text-slate-500 leading-relaxed mb-7">Are you sure you want to log out of your current administration session?</p>
          <div class="flex gap-3">
            <button id="logoutCancel" class="flex-1 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
            <button id="logoutConfirm" class="flex-1 px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors">Sign Out</button>
          </div>
        </div>
      </div>
    `);
    
    const logoutModal = document.getElementById('logoutModal');
    const openModal = () => {
      closeProfileMenu();
      logoutModal.classList.remove('hidden');
      logoutModal.classList.add('flex');
    };
    const closeModal = () => {
      logoutModal.classList.add('hidden');
      logoutModal.classList.remove('flex');
    };
    
    logoutBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    document.getElementById('logoutCancel').addEventListener('click', closeModal);
    document.getElementById('logoutModalX').addEventListener('click', closeModal);
    logoutModal.addEventListener('click', (e) => { if (e.target === logoutModal) closeModal(); });
    
    document.getElementById('logoutConfirm').addEventListener('click', async () => {
      try {
        await fetch('/api/v1/auth/logout', { method: 'POST' });
      } catch (error) {
        console.error('Logout error:', error);
      }
      window.location.href = 'login.html';
    });
  }

  // ==========================================
  // NOTIFICATION BELL (injected left of profile dropdown)
  // ==========================================
  if (profileToggle && profileToggle.parentElement) {
    profileToggle.parentElement.insertAdjacentHTML('afterbegin', `
      <div class="relative">
        <button id="notif-toggle" type="button" class="relative flex items-center justify-center w-10 h-10 rounded-full text-on-surface-variant hover:bg-surface-container-low transition-colors" aria-label="Notifications">
          <span class="material-symbols-outlined">notifications</span>
          <span id="notif-badge" class="hidden absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"></span>
        </button>
        <div id="notif-menu" class="absolute right-0 top-12 w-80 bg-surface rounded-2xl shadow-xl border border-outline-variant/30 z-50 hidden opacity-0 scale-95 origin-top-right transition-all duration-200 overflow-hidden">
          <div class="px-4 py-3 border-b border-outline-variant/20 flex justify-between items-center">
            <p class="text-sm font-bold text-on-surface">Notifications</p>
            <span id="notif-count-label" class="text-xs text-on-surface-variant"></span>
          </div>
          <div id="notif-list" class="max-h-72 overflow-y-auto"></div>
        </div>
      </div>
    `);
    
    const notifToggle = document.getElementById('notif-toggle');
    const notifMenu = document.getElementById('notif-menu');
    const notifBadge = document.getElementById('notif-badge');
    const notifList = document.getElementById('notif-list');
    const notifCountLabel = document.getElementById('notif-count-label');
    let notifMenuOpen = false;
    let notifLoaded = false;
    
    function closeNotifMenu() {
      if (notifMenuOpen) {
        notifMenuOpen = false;
        notifMenu.classList.add('opacity-0', 'scale-95');
        setTimeout(() => notifMenu.classList.add('hidden'), 200);
      }
    }
    
    async function loadNotifications() {
      notifList.innerHTML = '<p class="text-sm text-slate-400 text-center py-6">Loading...</p>';
      const items = [];
      
      try {
        const [pos, docs] = await Promise.all([
          fetch('/api/v1/pos').then((r) => r.ok ? r.json() : {}),
          fetch('/api/v1/documents').then((r) => r.ok ? r.json() : {}),
        ]);
        
        (Array.isArray(pos.pos) ? pos.pos : [])
          .filter((p) => p.status === 'Pending Approval')
          .slice(0, 5)
          .forEach((p) => items.push({
            icon: 'approval', color: 'text-amber-600 bg-amber-100',
            title: `PO ${p.po_number} awaiting approval`,
            sub: p.vendor_name || p.vendor || '',
            href: 'purchase-orders.html',
          }));
        
        (Array.isArray(docs.documents) ? docs.documents : [])
          .filter((doc) => doc.status !== 'Verified')
          .slice(0, 5)
          .forEach((doc) => items.push({
            icon: 'description', color: 'text-red-600 bg-red-100',
            title: `Document ${doc.reference_no} needs attention`,
            sub: doc.status || '',
            href: 'documents.html',
          }));
      } catch (err) {
        console.error('Notifications error:', err);
      }
      
      notifCountLabel.textContent = items.length ? `${items.length} new` : '';
      if (items.length) {
        notifBadge.textContent = items.length;
        notifBadge.classList.remove('hidden');
      } else {
        notifBadge.classList.add('hidden');
      }
      
      notifList.innerHTML = items.length
        ? items.map((n) => `
            <a href="${n.href}" class="flex items-start gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span class="w-9 h-9 rounded-full ${n.color} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-lg">${n.icon}</span>
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium text-on-surface truncate">${n.title}</span>
                <span class="block text-xs text-on-surface-variant truncate">${n.sub}</span>
              </span>
            </a>
          `).join('')
        : '<p class="text-sm text-slate-400 text-center py-8">No new notifications</p>';
    }
    
    notifToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProfileMenu();
      notifMenuOpen = !notifMenuOpen;
      if (notifMenuOpen) {
        notifMenu.classList.remove('hidden');
        setTimeout(() => notifMenu.classList.remove('opacity-0', 'scale-95'), 10);
        if (!notifLoaded) { loadNotifications(); notifLoaded = true; }
      } else {
        closeNotifMenu();
      }
    });
    
    document.addEventListener('click', (e) => {
      if (notifMenuOpen && !notifMenu.contains(e.target) && !notifToggle.contains(e.target)) {
        closeNotifMenu();
      }
    });
  }

  // Profile dropdown links are handled as regular HTML links (<a href="...">)
  // No JavaScript needed for navigation links in the dropdown
});