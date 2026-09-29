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

// Initialize permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializePermissions();
  await requireSession().then((signedIn) => signedIn && load());
});

async function requireSession() {
  const response = await fetch('/api/v1/auth/me');
  const data = await response.json();
  if (!data.user) {
    window.location.replace('login.html');
    return false;
  }
  
  return true;
}

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);

// ==========================================
// DASHBOARD & DATA LOADING
// ==========================================
async function load() {
  try {
    const [dash, pos, vendors, docs] = await Promise.all([
      api('dashboard'),
      api('pos'),
      api('suppliers'),
      api('documents'),
    ]);

    const stats = dash.stats || {};
    const purchaseOrders = Array.isArray(pos.pos) ? pos.pos : [];
    const vendorList = Array.isArray(vendors.suppliers) ? vendors.suppliers : [];
    const documentList = Array.isArray(docs.documents) ? docs.documents : [];
    const zones = Array.isArray(dash.zones) ? dash.zones : [];
    const scans = Array.isArray(dash.scans) ? dash.scans : [];

    // Render Stats - Show 0 if no data
    const statsEl = $('#stats');
    if (statsEl) {
      const totalAssets = stats.total || 0;
      const deployed = stats.deployed || 0;
      const totalValue = stats.value || 0;
      
      statsEl.innerHTML = [
        ['Total inventory value', money(totalValue), `Across ${totalAssets} tracked assets`],
        ['Asset deployment mix', `${deployed} deployed`, totalAssets > 0 ? `${Math.round((deployed / totalAssets) * 100)}% of inventory` : 'No assets'],
        ['Active purchase orders', purchaseOrders.filter((x) => x.status !== 'Received').length, 'In the approval pipeline'],
        ['Compliance alerts', documentList.filter((x) => x.status !== 'Verified').length, 'Items need attention'],
      ]
        .map(
          ([title, value, subtitle]) => `
            <div class="bg-white shadow-sm border border-slate-200 p-6 rounded-xl">
              <p class="text-slate-600 text-sm mb-2">${title}</p>
              <strong class="text-2xl font-bold text-slate-900">${value}</strong>
              <small class="text-slate-500 text-xs">${subtitle}</small>
            </div>
          `
        )
        .join('');
    }

    // Render Zones - Show message if no data
    const zonesEl = $('#zones');
    if (zonesEl) {
      if (zones.length === 0) {
        zonesEl.innerHTML = '<p class="text-slate-500 text-center py-8">No warehouse zones configured</p>';
      } else {
        zonesEl.innerHTML = zones
          .map((z) => {
            const alertClass = z.pct > 85 ? 'border-red-500 bg-red-50' : z.pct >= 60 ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50';
            const textClass = z.pct > 85 ? 'text-red-600' : z.pct >= 60 ? 'text-yellow-600' : 'text-green-600';
            const barClass = z.pct > 85 ? 'bg-red-500' : z.pct >= 60 ? 'bg-yellow-500' : 'bg-green-500';
            
            return `
              <div class="border-l-4 ${alertClass} p-4 rounded-lg mb-3">
                <div class="flex justify-between items-center mb-2">
                  <b class="text-lg">Zone ${z.zone}</b>
                  <span class="text-sm ${textClass} font-medium">${z.occupied}/${z.capacity} bins</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="${barClass} h-2 rounded-full transition-all duration-300" style="width: ${z.pct}%"></div>
                </div>
                <p class="text-xs text-gray-500 mt-1">${z.pct}% occupied</p>
              </div>
            `;
          })
          .join('');
      }
    }

    // Render Deployment - Show 0 if no data
    const deploymentEl = $('#deployment');
    if (deploymentEl) {
      const total = stats.total || 0;
      const deployed = stats.deployed || 0;
      
      if (total === 0) {
        deploymentEl.innerHTML = '<p class="text-slate-500 text-center py-8">No assets to display</p>';
      } else {
        deploymentEl.innerHTML = `
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-600">Deployed</span>
              <span class="font-semibold text-slate-900">${deployed} (${Math.round((deployed / total) * 100)}%)</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-3">
              <div class="bg-indigo-600 h-3 rounded-full transition-all duration-300" style="width: ${Math.round((deployed / total) * 100)}%"></div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-600">In Warehouse</span>
              <span class="font-semibold text-slate-900">${total - deployed} (${Math.round(((total - deployed) / total) * 100)}%)</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-3">
              <div class="bg-teal-600 h-3 rounded-full transition-all duration-300" style="width: ${Math.round(((total - deployed) / total) * 100)}%"></div>
            </div>
          </div>
        `;
      }
    }

    // Render Purchase Orders - Show message if no data
    const recentPOsEl = $('#recentPOs');
    if (recentPOsEl) {
      if (purchaseOrders.length === 0) {
        recentPOsEl.innerHTML = '<p class="text-slate-500 text-center py-8">No purchase orders</p>';
      } else {
        recentPOsEl.innerHTML = purchaseOrders.slice(0, 5).map((po) => {
          const statusClass = po.status === 'Received' ? 'bg-green-100 text-green-800' : 
                             po.status === 'Sent to Vendor' ? 'bg-blue-100 text-blue-800' :
                             po.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                             'bg-gray-100 text-gray-800';
          
          return `
            <div class="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
              <div>
                <b class="text-sm font-medium text-slate-900">${po.po_number}</b><br>
                <small class="text-xs text-slate-500">${po.vendor_name || po.vendor}</small>
              </div>
              <span class="px-2 py-1 rounded-full text-xs font-medium ${statusClass}">${po.status}</span>
            </div>
          `;
        }).join('');
      }
    }

    // Render Recent Activity - Show message if no data
    const recentActivityEl = $('#recentActivity');
    if (recentActivityEl) {
      if (scans.length === 0) {
        recentActivityEl.innerHTML = '<p class="text-slate-500 text-center py-8">No recent activity</p>';
      } else {
        recentActivityEl.innerHTML = `
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200">
                <th class="text-left py-2 px-3 font-medium text-slate-600">Action</th>
                <th class="text-left py-2 px-3 font-medium text-slate-600">Asset</th>
                <th class="text-left py-2 px-3 font-medium text-slate-600">Time</th>
              </tr>
            </thead>
            <tbody>
              ${scans.map((scan) => `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="py-2 px-3"><b class="text-slate-900">${scan.action}</b></td>
                  <td class="py-2 px-3 text-slate-600">${scan.name} (${scan.qr_code})</td>
                  <td class="py-2 px-3 text-slate-500 text-xs">${new Date(scan.created_at).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    const statsEl = $('#stats');
    if (statsEl) {
      statsEl.innerHTML = '<p class="text-red-500 text-center py-8">Error loading data. Please try again.</p>';
    }
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Sidebar Toggle (using layout.js)
// Note: Sidebar toggle is handled by layout.js, not here

// Profile Dropdown (using layout.js)  
// Note: Profile dropdown is handled by layout.js, not here

// New Asset Button
const newAssetBtn = $('#new-transaction');
if (newAssetBtn) {
  newAssetBtn.onclick = () => {
    window.location.href = 'inventory.html';
  };
}

