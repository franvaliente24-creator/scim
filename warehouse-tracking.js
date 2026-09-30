// ==========================================
// WAREHOUSE LIVE TRACKING PAGE LOGIC
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
  loadTrackingData();
});

let allAssets = [];
let allTransactions = [];

// ==========================================
// TRACKING DATA LOADING
// ==========================================
async function loadTrackingData() {
  try {
    const response = await api('assets');
    const assets = response.assets || response;
    allAssets = Array.isArray(assets) ? assets : [];
    
    const transactionsResponse = await api('assets/transactions');
    const transactions = transactionsResponse.transactions || transactionsResponse;
    allTransactions = Array.isArray(transactions) ? transactions : [];
    
    updateStats();
    renderAssetTable();
    renderRecentTransactions();
  } catch (error) {
    console.error('Error loading tracking data:', error);
  }
}

function updateStats() {
  const totalAssetsEl = $('#totalAssets');
  const inTransitEl = $('#inTransit');
  const deployedEl = $('#deployed');
  const todayMovementsEl = $('#todayMovements');
  
  if (totalAssetsEl) totalAssetsEl.textContent = allAssets.length;
  
  const inTransit = allAssets.filter(a => a.status === 'In Transit').length;
  if (inTransitEl) inTransitEl.textContent = inTransit;
  
  const deployed = allAssets.filter(a => a.status === 'Deployed').length;
  if (deployedEl) deployedEl.textContent = deployed;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMovements = allTransactions.filter(t => new Date(t.created_at) >= today).length;
  if (todayMovementsEl) todayMovementsEl.textContent = todayMovements;
}

function renderAssetTable() {
  const tableEl = $('#assetTrackingTable');
  if (!tableEl) return;

  const term = ($('#assetSearch')?.value || '').toLowerCase();
  const statusFilter = $('#statusFilter')?.value || '';
  
  let filtered = allAssets;
  
  if (term) {
    filtered = filtered.filter(a => 
      `${a.name} ${a.qr_code} ${a.location || ''}`.toLowerCase().includes(term)
    );
  }
  
  if (statusFilter) {
    filtered = filtered.filter(a => a.status === statusFilter);
  }

  if (!filtered.length) {
    tableEl.innerHTML = '<p class="text-on-surface-variant text-sm text-center py-8">No assets found</p>';
    return;
  }

  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>QR Code</th>
          <th>Asset Name</th>
          <th>Category</th>
          <th>Location</th>
          <th>Status</th>
          <th>Last Updated</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(asset => `
          <tr>
            <td><span class="font-mono text-xs">${asset.qr_code}</span></td>
            <td>${asset.name}</td>
            <td>${asset.category}</td>
            <td>${asset.location || 'N/A'}</td>
            <td><span class="tag ${getStatusClass(asset.status)}">${asset.status}</span></td>
            <td>${new Date(asset.created_at).toLocaleDateString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  tableEl.innerHTML = tableHTML;
}

function renderRecentTransactions() {
  const transactionsEl = $('#recentTransactions');
  if (!transactionsEl) return;

  const recent = allTransactions.slice(0, 10);
  
  if (!recent.length) {
    transactionsEl.innerHTML = '<p class="text-on-surface-variant text-sm">No recent movements</p>';
    return;
  }

  const transactionsHTML = recent.map(tx => `
    <div class="row">
      <div>
        <b>${tx.action}</b><br>
        <small>${tx.qr_code} · Zone ${tx.zone || 'N/A'}</small>
      </div>
      <small>${new Date(tx.created_at).toLocaleString()}</small>
    </div>
  `).join('');

  transactionsEl.innerHTML = transactionsHTML;
}

function getStatusClass(status) {
  const statusMap = {
    'In Warehouse': 'tag-success',
    'Deployed': 'tag-info',
    'In Transit': 'tag-warning',
    'In Maintenance': 'tag-danger',
  };
  return statusMap[status] || 'tag-default';
}

// Event listeners
$('#assetSearch')?.addEventListener('input', renderAssetTable);
$('#statusFilter')?.addEventListener('change', renderAssetTable);

const refreshBtn = $('#refreshTracking');
if (refreshBtn) {
  refreshBtn.onclick = () => {
    loadTrackingData();
  };
}
