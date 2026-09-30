// ==========================================
// LAYOUT INTERACTIONS (Sidebar, Profile Dropdown)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  
  // Sidebar Toggle Functionality
  const sidebarToggle = document.getElementById('desktop-sidebar-toggle');
  const sidebar = document.getElementById('app-sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
  
  
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

  // Desktop sidebar collapse (icon-only mode) — persisted so the header
  // state carries across page navigation
  function toggleDesktopSidebar() {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    sidebarToggleIcon.textContent = isCollapsed ? 'menu_open' : 'menu';
    try { sessionStorage.setItem('scim_sidebar_collapsed', isCollapsed ? '1' : '0'); } catch (e) {}
    updateSidebarTooltips();
  }
  try {
    if (sessionStorage.getItem('scim_sidebar_collapsed') === '1' && window.innerWidth >= 768) {
      sidebar.classList.add('collapsed');
      sidebarToggleIcon.textContent = 'menu_open';
    }
  } catch (e) {}

  // On desktop, toggle collapsed state instead of mobile behavior
  sidebarToggle.addEventListener('click', () => {
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

  // ==========================================
  // SIDEBAR NAVIGATION — flat top-level modules only.
  // Child views are reached via each hub's internal tab bar, never the sidebar.
  // ==========================================
  const navContainer = document.getElementById('sidebar-subsystem-modules-nav');
  if (navContainer) {
    const page = window.location.pathname.split('/').pop();
    // Sidebar shows top-level parent modules only — child views live inside
    // each hub's internal tab bar. Flat links render as authored in the HTML.

    // Same-page tab navigation: sidebar hash links on the active hub page
    // switch internal tabs instantly instead of reloading.
    navContainer.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      if (!a) return;
      const [base, hash] = a.getAttribute('href').split('#');
      if (base === page && hash) {
        e.preventDefault();
        if (typeof window.switchModuleTab === 'function') {
          window.switchModuleTab(hash);
        } else {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    // Retained for permissions.js compatibility — flat nav has no groups.
    window.refreshNavGroups = () => {};


    // Add tooltips to sidebar links in collapsed mode
    function updateSidebarTooltips() {
      const isCollapsed = sidebar.classList.contains('collapsed');
      const links = sidebar.querySelectorAll('.sidebar-main-link, .sidebar-subsystem-link');
      
      links.forEach(link => {
        if (isCollapsed) {
          // Get the label text for tooltip
          const labelSpan = link.querySelector('span:not(.material-symbols-outlined)');
          const label = labelSpan ? labelSpan.textContent.trim() : link.textContent.trim();
          if (label) {
            link.setAttribute('title', label);
          }
        } else {
          link.removeAttribute('title');
        }
      });
    }

    // Initialize tooltips on load
    updateSidebarTooltips();
    
    // Expose function for external calls
    window.updateSidebarTooltips = updateSidebarTooltips;
  }

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
      if (window.scimClearToken) scimClearToken();
      if (window.scimClearTicket) scimClearTicket();
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
    
    let lastItems = [];

    async function loadNotifications(renderList) {
      if (renderList) notifList.innerHTML = '<p class="text-sm text-slate-400 text-center py-6">Loading...</p>';
      const items = [];

      try {
        const res = await fetch('/api/v1/notifications');
        if (res.ok) {
          const data = await res.json();
          (Array.isArray(data.items) ? data.items : []).forEach((n) => items.push({
            icon: n.icon || 'notifications', color: 'text-indigo-600 bg-indigo-100',
            title: n.title, sub: n.sub || '', href: n.href || '#',
          }));
        }
      } catch (err) {
        console.error('Notifications error:', err);
      }
      lastItems = items;

      notifCountLabel.textContent = items.length ? `${items.length} new` : '';
      if (items.length) {
        notifBadge.textContent = items.length;
        notifBadge.classList.remove('hidden');
      } else {
        notifBadge.classList.add('hidden');
      }

      if (renderList || notifMenuOpen) {
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
    }

    // Poll the badge immediately on page load, then every 60 seconds, so the
    // unread count is correct without the user ever opening the menu.
    loadNotifications(false);
    setInterval(() => loadNotifications(false), 60000);

    notifToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      closeProfileMenu();
      notifMenuOpen = !notifMenuOpen;
      if (notifMenuOpen) {
        notifMenu.classList.remove('hidden');
        setTimeout(() => notifMenu.classList.remove('opacity-0', 'scale-95'), 10);
        if (lastItems.length) {
          loadNotifications(true);
        } else {
          notifList.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">No new notifications</p>';
          loadNotifications(false); // refresh quietly in case data arrived late
        }
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

  // ==========================================
  // DYNAMIC PROFILE (name, role, avatar)
  // ==========================================
  (async function fillProfileIdentity() {
    try {
      const res = await fetch('/api/v1/auth/me');
      if (!res.ok) return;
      const data = await res.json();
      const u = data.user;
      if (!u) return;

      const roleLabel = (typeof getRoleDisplayName === 'function') ? getRoleDisplayName(u.role) : u.role;

      // Header toggle button: name + role spans
      if (profileToggle) {
        const nameSpan = profileToggle.querySelector('span.font-label');
        const roleSpan = profileToggle.querySelector('span.text-xs');
        if (nameSpan) nameSpan.textContent = u.name || 'User';
        if (roleSpan) roleSpan.textContent = roleLabel || '';
        const img = profileToggle.querySelector('img.user-profile-img');
        if (img && u.avatar) img.src = u.avatar;
      }

      // Mobile header inside dropdown
      if (profileMenu) {
        const dName = profileMenu.querySelector('p.text-sm.font-semibold');
        const dEmail = profileMenu.querySelector('p.text-xs.truncate');
        if (dName) dName.textContent = u.name || 'User';
        if (dEmail) dEmail.textContent = u.email || '';
      }

      // Common page-level placeholders (profile.html etc.)
      document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = u.name || ''; });
      document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = u.email || ''; });
      document.querySelectorAll('[data-user-role]').forEach(el => { el.textContent = roleLabel || ''; });
      document.querySelectorAll('img[data-user-avatar]').forEach(el => { if (u.avatar) el.src = u.avatar; });
    } catch (e) { /* non-fatal */ }
  })();

  // ==========================================
  // GLOBAL QUICK QR SCAN (floating trigger on every page)
  // ==========================================
  document.body.insertAdjacentHTML('beforeend', `
    <button id="quickScanFab" type="button" title="Quick QR Scan" aria-label="Quick QR Scan"
      class="fixed bottom-6 right-6 z-[150] w-14 h-14 rounded-full bg-primary text-white shadow-xl shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
      <span class="material-symbols-outlined text-2xl">qr_code_scanner</span>
    </button>
    <div id="quickScanModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[160] hidden items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <span class="material-symbols-outlined text-primary">qr_code_scanner</span> Quick QR Scan
          </h2>
          <button id="quickScanClose" class="text-slate-400 hover:text-slate-600"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="p-5 space-y-4">
          <div class="flex gap-2">
            <select id="quickScanAction" class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="Inventory Intake">Inventory Intake</option>
              <option value="Check-Out">Check-Out (deploy)</option>
              <option value="Check-In">Check-In (return)</option>
              <option value="Assign to Staff">Assign to Staff</option>
              <option value="Move to Zone">Move to Zone</option>
              <option value="PO Receipt">PO Receipt</option>
            </select>
          </div>
          <div id="quickScanExtra" class="hidden space-y-2">
            <input id="quickScanExtraInput" type="text" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="">
          </div>
          <div class="relative rounded-xl overflow-hidden bg-slate-900 aspect-video">
            <video id="quickScanVideo" class="w-full h-full object-cover" playsinline muted></video>
            <div class="absolute inset-0 border-2 border-primary/60 rounded-xl pointer-events-none"></div>
          </div>
          <div class="flex gap-2">
            <input id="quickScanManual" type="text" placeholder="Or type QR code manually…" class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <button id="quickScanManualGo" class="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold">Go</button>
          </div>
          <p id="quickScanStatus" class="text-sm text-slate-500 text-center min-h-[20px]"></p>
        </div>
      </div>
    </div>
  `);

  (function initQuickScan() {
    const fab = document.getElementById('quickScanFab');
    const modal = document.getElementById('quickScanModal');
    const video = document.getElementById('quickScanVideo');
    const status = document.getElementById('quickScanStatus');
    const actionSel = document.getElementById('quickScanAction');
    const extraWrap = document.getElementById('quickScanExtra');
    const extraInput = document.getElementById('quickScanExtraInput');
    const manualInput = document.getElementById('quickScanManual');
    let stream = null;
    let scanning = false;
    let lastCode = '';

    function setStatus(msg, ok) {
      status.textContent = msg || '';
      status.className = 'text-sm text-center min-h-[20px] ' + (ok === true ? 'text-emerald-600' : ok === false ? 'text-red-600' : 'text-slate-500');
    }

    async function submitScan(code) {
      if (!code || code === lastCode) return;
      lastCode = code;
      setStatus('Processing ' + code + '…');
      const payload = { qr_code: code, action: actionSel.value };
      if (actionSel.value === 'Assign to Staff') payload.assignee = extraInput.value.trim();
      if (actionSel.value === 'Move to Zone') payload.zone = extraInput.value.trim();
      if (actionSel.value === 'PO Receipt' && extraInput.value.trim()) payload.po_number = extraInput.value.trim();
      try {
        const res = await fetch('/api/v1/assets/scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Scan failed');
        let msg = `${data.action}: ${data.asset ? data.asset.name : code}`;
        if (data.auto_created) msg += ' (auto-registered)';
        if (data.auto_requisition) msg += ` — low stock! Requisition ${data.auto_requisition} created`;
        setStatus(msg, true);
      } catch (err) {
        setStatus(err.message, false);
      } finally {
        setTimeout(() => { lastCode = ''; }, 2500);
      }
    }

    async function startCamera() {
      setStatus('Starting camera…');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        await video.play();
        scanning = true;
        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const tick = async () => {
            if (!scanning) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length) submitScan(codes[0].rawValue);
            } catch (e) { /* frame not ready */ }
            requestAnimationFrame(tick);
          };
          tick();
          setStatus('Point the camera at a QR code.');
        } else if (window.jsQR) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const tick = () => {
            if (!scanning) return;
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const found = window.jsQR(img.data, img.width, img.height);
              if (found && found.data) submitScan(found.data);
            }
            requestAnimationFrame(tick);
          };
          tick();
          setStatus('Point the camera at a QR code.');
        } else {
          setStatus('Camera live, but no QR engine loaded — type the code manually.');
        }
      } catch (err) {
        setStatus('Camera unavailable: ' + err.message + ' — use manual entry.', false);
      }
    }

    function stopCamera() {
      scanning = false;
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      video.srcObject = null;
    }

    function openModal() {
      modal.classList.remove('hidden'); modal.classList.add('flex');
      startCamera();
    }
    function closeModal() {
      modal.classList.add('hidden'); modal.classList.remove('flex');
      stopCamera(); setStatus(''); manualInput.value = '';
    }

    actionSel.addEventListener('change', () => {
      const v = actionSel.value;
      if (v === 'Assign to Staff') { extraWrap.classList.remove('hidden'); extraInput.placeholder = 'Employee name…'; }
      else if (v === 'Move to Zone') { extraWrap.classList.remove('hidden'); extraInput.placeholder = 'Zone / aisle (e.g. A-02)…'; }
      else if (v === 'PO Receipt') { extraWrap.classList.remove('hidden'); extraInput.placeholder = 'PO number (optional)…'; }
      else { extraWrap.classList.add('hidden'); }
    });

    fab.addEventListener('click', openModal);
    document.getElementById('quickScanClose').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('quickScanManualGo').addEventListener('click', () => submitScan(manualInput.value.trim()));
    manualInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitScan(manualInput.value.trim()); });
  })();

  // Profile dropdown links are handled as regular HTML links (<a href="...">)
  // No JavaScript needed for navigation links in the dropdown
});

// ==========================================
// SPA MASTER-HUB TAB SYSTEM
// window.initHubTabs(defaultTab) — call once per hub page.
// Sections are <section class="hub-section" data-tab="name"> and buttons are
// .hub-tab-btn[data-tab-target="name"]. Emits 'hub:tab' for lazy loaders and
// exposes window.switchModuleTab(hash) for the sidebar.
// ==========================================
window.initHubTabs = function (defaultTab) {
  const btns = document.querySelectorAll('.hub-tab-btn[data-tab-target]');
  const sections = document.querySelectorAll('.hub-section[data-tab]');
  window.switchModuleTab = (name) => {
    if (!name || ![...sections].some((s) => s.dataset.tab === name)) return;
    sections.forEach((s) => s.classList.toggle('active', s.dataset.tab === name));
    btns.forEach((b) => b.classList.toggle('active', b.dataset.tabTarget === name));
    if (('#' + name) !== window.location.hash) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0 });
    document.dispatchEvent(new CustomEvent('hub:tab', { detail: { tab: name } }));
  };
  btns.forEach((b) => { b.onclick = () => window.switchModuleTab(b.dataset.tabTarget); });
  const initial = (window.location.hash || '').replace(/^#/, '');
  window.switchModuleTab(initial || defaultTab);
};

// ==========================================
// GLOBAL CONFIRMATION MODAL
// await scimConfirm({ title, message, confirmLabel, danger }) -> bool
// ==========================================
window.scimConfirm = function (opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const id = 'scimConfirmModal';
    document.getElementById(id)?.remove();
    const danger = opts.danger !== false;
    const safeText = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const iconColor = danger ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600';
    const btnColor = danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700';
    document.body.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center relative" role="dialog" aria-modal="true">
          <div class="w-16 h-16 rounded-full ${iconColor} flex items-center justify-center mx-auto mb-5">
            <span class="material-symbols-outlined text-3xl">${opts.icon || (danger ? 'warning' : 'help')}</span>
          </div>
          <h2 class="text-xl font-bold text-slate-900 mb-2">${safeText(opts.title || 'Are you sure?')}</h2>
          <p class="text-sm text-slate-500 leading-relaxed mb-7">${safeText(opts.message || '')}</p>
          <div class="flex gap-3">
            <button data-c="no" class="flex-1 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">Cancel</button>
            <button data-c="yes" class="flex-1 px-5 py-2.5 rounded-xl ${btnColor} text-white font-semibold text-sm transition-colors">${safeText(opts.confirmLabel || 'Confirm')}</button>
          </div>
        </div>
      </div>`);
    const modal = document.getElementById(id);
    const done = (v) => { modal.remove(); resolve(v); };
    modal.querySelector('[data-c="yes"]').onclick = () => done(true);
    modal.querySelector('[data-c="no"]').onclick = () => done(false);
    modal.onclick = (e) => { if (e.target === modal) done(false); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done(false); }
    });
  });
};