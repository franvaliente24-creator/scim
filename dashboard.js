// ==========================================
// DASHBOARD PAGE LOGIC
// ==========================================

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`Element not found: ${selector}`);
    return null;
  }
  return element;
};

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

async function requireSession() {
  const response = await fetch('/api/v1/auth/me');
  const data = await response.json();
  if (!data.user) {
    window.location.replace('login.html');
    return false;
  }
  // Update profile circle with user initials
  const profileCircle = document.querySelector('.w-9.h-9.rounded-full');
  if (profileCircle && data.user.full_name) {
    const initials = data.user.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
    profileCircle.textContent = initials;
  }
  return true;
}

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);

function getPOStatusClass(status) {
  const statusMap = {
    'Draft': 'tag-default',
    'Pending Approval': 'tag-warning',
    'Sent to Vendor': 'tag-info',
    'Shipped': 'tag-info',
    'Received': 'tag-success',
    'Cancelled': 'tag-danger'
  };
  return statusMap[status] || 'tag-default';
}

// ==========================================
// DASHBOARD & DATA LOADING
// ==========================================
async function load() {
  const [dash, pos, vendors, docs] = await Promise.all([
    api('dashboard'),
    api('pos'),
    api('suppliers'),
    api('documents'),
  ]);

  const stats = dash.stats;
  const purchaseOrders = Array.isArray(pos.pos) ? pos.pos : [];
  const vendorList = Array.isArray(vendors.suppliers) ? vendors.suppliers : [];
  const documentList = Array.isArray(docs.documents) ? docs.documents : [];

  // Render Stats
  const statsEl = $('#stats');
  if (statsEl) {
    statsEl.innerHTML = [
      ['Total inventory value', money(stats.value), `Across ${stats.total} tracked assets`],
      ['Asset deployment mix', `${stats.deployed} deployed`, `${Math.round((stats.deployed / stats.total) * 100)}% of inventory`],
      ['Active purchase orders', purchaseOrders.filter((x) => x.status !== 'Received').length, 'In the approval pipeline'],
      ['Compliance alerts', documentList.filter((x) => x.status !== 'Verified').length, 'Items need attention'],
    ]
      .map(
        ([title, value, subtitle]) => `
          <div class="dashboard-card bg-white shadow-sm border border-slate-200 p-6">
            <p class="text-on-surface-variant text-sm mb-2">${title}</p>
            <strong class="text-2xl font-headline font-bold text-on-surface">${value}</strong>
            <small class="text-on-surface-variant text-xs">${subtitle}</small>
          </div>
        `
      )
      .join('');
  }

  // Render Zones
  const zonesEl = $('#zones');
  if (zonesEl && dash.zones) {
    zonesEl.innerHTML = dash.zones
      .map((z) => {
        const alertClass = z.pct > 85 ? 'danger' : z.pct >= 60 ? 'warn' : '';
        return `
          <div class="zone ${alertClass}">
            <b>Zone ${z.zone}</b>
            <span>${z.occupied}/${z.capacity} bins</span>
            <div class="bar ${alertClass}">
              <i style="width: ${z.pct}%"></i>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Render Deployment
  const deploymentEl = $('#deployment');
  if (deploymentEl) {
    deploymentEl.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center">
          <span class="text-sm text-on-surface-variant">Deployed</span>
          <span class="font-semibold text-on-surface">${stats.deployed} (${Math.round((stats.deployed / stats.total) * 100)}%)</span>
        </div>
        <div class="w-full bg-surface-container rounded-full h-2">
          <div class="bg-primary h-2 rounded-full" style="width: ${Math.round((stats.deployed / stats.total) * 100)}%"></div>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-on-surface-variant">In Warehouse</span>
          <span class="font-semibold text-on-surface">${stats.total - stats.deployed} (${Math.round(((stats.total - stats.deployed) / stats.total) * 100)}%)</span>
        </div>
        <div class="w-full bg-surface-container rounded-full h-2">
          <div class="bg-secondary h-2 rounded-full" style="width: ${Math.round(((stats.total - stats.deployed) / stats.total) * 100)}%"></div>
        </div>
      </div>
    `;
  }

  // Render Purchase Orders
  const recentPOsEl = $('#recentPOs');
  if (recentPOsEl) {
    recentPOsEl.innerHTML = purchaseOrders.slice(0, 5).map((po) => `
      <div class="row">
        <div>
          <b>${po.po_number}</b><br>
          <small>${po.vendor_name || po.vendor}</small>
        </div>
        <span class="tag tag-${getPOStatusClass(po.status)}">${po.status}</span>
      </div>
    `).join('');
  }

  // Render Recent Activity
  const recentActivityEl = $('#recentActivity');
  if (recentActivityEl && dash.scans) {
    recentActivityEl.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Asset</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          ${dash.scans.map((scan) => `
            <tr>
              <td><b>${scan.action}</b></td>
              <td>${scan.name} (${scan.qr_code})</td>
              <td>${new Date(scan.created_at).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Scanner Modal Controls
const mobileBtn = $('#mobileBtn');
if (mobileBtn) {
  mobileBtn.onclick = () => {
    const scanner = $('#scanner');
    if (scanner) scanner.showModal();
  };
}

const closeScan = $('#closeScan');
if (closeScan) {
  closeScan.onclick = () => {
    const scanner = $('#scanner');
    if (scanner) scanner.close();
  };
}

let currentAction = 'Inventory Intake';

const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach((btn) => {
  btn.onclick = () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.textContent;
  };
});

const scanNow = $('#scanNow');
if (scanNow) {
  scanNow.onclick = async () => {
    const qrInput = $('#qr');
    const scanResult = $('#scanResult');
    
    if (!qrInput) return;
    
    const response = await fetch('/api/v1/assets/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_code: qrInput.value,
        action: currentAction,
      }),
    });

    const data = await response.json();

    if (scanResult) {
      scanResult.textContent = response.ok
        ? `${data.asset.name} recorded for ${currentAction}.`
        : data.error;
    }

    if (response.ok) load();
  };
}

// Load dashboard data only after a valid server-side session is confirmed.
requireSession().then((signedIn) => signedIn && load());
