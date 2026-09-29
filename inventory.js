// ==========================================
// INVENTORY MANAGEMENT SYSTEM PAGE LOGIC
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

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

// Show loading state
function showLoading(containerId) {
  const container = $(containerId);
  if (container) {
    container.innerHTML = '<div class="text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div><p class="text-slate-500 mt-2">Loading...</p></div>';
  }
}

// Show error state
function showError(containerId, message) {
  const container = $(containerId);
  if (container) {
    container.innerHTML = `<div class="text-center py-8 text-red-500"><p>${message}</p></div>`;
  }
}

// Initialize permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
  showLoading('#assetTable');

  try {
    await initializePermissions();
    await loadInventoryData();
  } catch (error) {
    console.error('Error initializing page:', error);
    showError('#assetTable', 'Failed to load data. Please refresh the page.');
  }
});

// ==========================================
// INVENTORY DATA LOADING
// ==========================================
let allAssets = [];

async function loadInventoryData() {
  try {
    const response = await api('inventory/assets');
    const data = response.assets || response;
    const assets = Array.isArray(data) ? data : [];
    allAssets = assets;

    // Calculate stats
    const totalAssets = assets.length;
    const totalValue = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
    const deployedAssets = assets.filter(asset => asset.status === 'Deployed').length;
    const warehouseAssets = assets.filter(asset => asset.status === 'In Warehouse').length;

    // Update stats
    const totalAssetsEl = $('#totalAssets');
    if (totalAssetsEl) totalAssetsEl.textContent = totalAssets;
    
    const totalValueEl = $('#totalValue');
    if (totalValueEl) totalValueEl.textContent = money(totalValue);
    
    const deployedAssetsEl = $('#deployedAssets');
    if (deployedAssetsEl) deployedAssetsEl.textContent = deployedAssets;
    
    const warehouseAssetsEl = $('#warehouseAssets');
    if (warehouseAssetsEl) warehouseAssetsEl.textContent = warehouseAssets;

    // Render asset table
    renderAssetTable(assets);

    // Load recent transactions
    loadRecentTransactions();
  } catch (error) {
    console.error('Error loading inventory data:', error);
  }
}

function renderAssetTable(assets) {
  const el = $('#assetTable');
  if (!el) return;
  if (!assets.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No assets found. Click "Add Asset" to register one.</p>';
    return;
  }
  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>QR Code</th>
          <th>Asset Name</th>
          <th>Category</th>
          <th>Status</th>
          <th>Value</th>
          <th>Location</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${assets.map(asset => `
          <tr>
            <td><span class="tag">${escapeHTML(asset.qr_code)}</span></td>
            <td><b>${escapeHTML(asset.name)}</b></td>
            <td>${escapeHTML(asset.category)}</td>
            <td><span class="tag ${getStatusClass(asset.status)}">${escapeHTML(asset.status)}</span></td>
            <td>${money(asset.value)}</td>
            <td>${escapeHTML(asset.location || 'N/A')}</td>
            <td>
              <button class="action-btn action-btn-view" type="button" data-asset-action="view" data-qr-code="${escapeHTML(asset.qr_code)}">View</button>
              <button class="action-btn action-btn-edit" type="button" data-asset-action="edit" data-qr-code="${escapeHTML(asset.qr_code)}">Edit</button>
              ${(typeof currentUserRole === 'undefined' || currentUserRole === 'Admin')
                ? `<button class="action-btn action-btn-danger" type="button" data-asset-action="delete" data-qr-code="${escapeHTML(asset.qr_code)}" data-asset-name="${escapeHTML(asset.name)}">Delete</button>`
                : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.innerHTML = tableHTML;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-asset-action][data-qr-code]');
  if (!button) return;

  const { assetAction, qrCode } = button.dataset;
  if (assetAction === 'view') window.viewAsset(qrCode);
  if (assetAction === 'edit') window.editAsset(qrCode);
  if (assetAction === 'delete') window.deleteAsset(qrCode, button.dataset.assetName || qrCode);
});

// Asset deletion — Admin only server-side, compliance-logged.
// Confirmed through the shared modal before the request fires.
window.deleteAsset = async (qrCode, name) => {
  if (typeof currentUserRole !== 'undefined' && currentUserRole !== 'Admin') return;
  const ok = await (window.scimConfirm ? scimConfirm({
    title: 'Delete Asset?',
    message: `"${name}" will be permanently removed from inventory. A compliance record is written to the audit log before deletion. This cannot be undone.`,
    confirmLabel: 'Delete', icon: 'delete_forever',
  }) : Promise.resolve(confirm(`Delete asset "${name}"?`)));
  if (!ok) return;
  const res = await fetch(`/api/v1/assets/${encodeURIComponent(qrCode)}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (res.ok) loadInventoryData();
  else alert(data.error || 'Failed to delete asset');
};

const assetModal = $('#assetModal');
const assetForm = $('#assetForm');
const assetModalTitle = $('#assetModalTitle');
const assetFormError = $('#assetFormError');
let editingAssetQr = null;

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', 'open');
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function openAssetForm(asset = null) {
  if (!assetForm || !assetModal) return;
  editingAssetQr = asset?.qr_code || null;
  assetModalTitle.textContent = editingAssetQr ? 'Edit Asset' : 'Add Asset';
  assetForm.elements.qr_code.readOnly = false;
  assetForm.elements.qr_code.value = asset?.qr_code || '';
  assetForm.elements.name.value = asset?.name || '';
  assetForm.elements.category.value = asset?.category || '';
  assetForm.elements.status.value = asset?.status || 'In Warehouse';
  assetForm.elements.value.value = asset?.value ?? '';
  assetForm.elements.location.value = asset?.location || '';
  assetFormError.hidden = true;
  assetFormError.textContent = '';
  showDialog(assetModal);
}

$('#closeAssetModal')?.addEventListener('click', () => closeDialog(assetModal));
$('#closeViewAsset')?.addEventListener('click', () => closeDialog($('#viewAssetModal')));

assetForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(assetForm).entries());
  const endpoint = editingAssetQr
    ? `/api/v1/inventory/assets/${encodeURIComponent(editingAssetQr)}`
    : '/api/v1/inventory/assets';

  try {
    const response = await fetch(endpoint, {
      method: editingAssetQr ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      assetFormError.textContent = result.error || 'Unable to save asset.';
      assetFormError.hidden = false;
      return;
    }

    closeDialog(assetModal);
    assetForm.reset();
    await loadInventoryData();
  } catch (error) {
    console.error('Error saving asset:', error);
    assetFormError.textContent = 'Unable to reach the server. Please try again.';
    assetFormError.hidden = false;
  }
});

function getStatusClass(status) {
  switch (status) {
    case 'Deployed':
      return 'status-deployed';
    case 'In Maintenance':
      return 'status-maintenance';
    case 'In Warehouse':
    default:
      return 'status-warehouse';
  }
}

function renderAssetCategories(assets) {
  const categories = {};
  assets.forEach(asset => {
    const category = asset.category || 'Uncategorized';
    if (!categories[category]) {
      categories[category] = { count: 0, value: 0 };
    }
    categories[category].count++;
    categories[category].value += Number(asset.value || 0);
  });

  const categoriesHTML = Object.entries(categories).map(([category, data]) => `
    <div class="row">
      <div>
        <b>${category}</b><br>
        <small>${data.count} assets</small>
      </div>
      <b>${money(data.value)}</b>
    </div>
  `).join('');

  const categoriesEl = $('#assetCategories');
  if (categoriesEl) categoriesEl.innerHTML = categoriesHTML;
}

async function loadRecentTransactions(showAll = false) {
  try {
    const response = await api('inventory/transactions');
    const data = response.transactions || response;
    const transactions = Array.isArray(data) ? data : [];
    
    // Limit to 5 items unless showAll is true
    const displayTransactions = showAll ? transactions : transactions.slice(0, 5);

    const transactionTableEl = $('#transactionTable');
    if (!transactionTableEl) return;

    const transactionsHTML = displayTransactions.map(transaction => `
      <div class="row">
        <div>
          <b>${transaction.action}</b><br>
          <small>${transaction.qr_code} · ${transaction.asset_name}</small>
        </div>
        <small>${new Date(transaction.created_at).toLocaleString()}</small>
      </div>
    `).join('');

    transactionTableEl.innerHTML = transactionsHTML || '<p class="text-on-surface-variant text-sm">No recent transactions</p>';
  } catch (error) {
    console.error('Error loading recent transactions:', error);
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Asset action functions
window.viewAsset = async (qrCode) => {
  try {
    const response = await fetch(`/api/v1/inventory/assets/${encodeURIComponent(qrCode)}`);
    const payload = await response.json();
    const asset = payload.asset || payload;

    if (!response.ok || !asset || asset.error) {
      alert(asset?.error || 'Asset not found');
      return;
    }

    const details = $('#viewAssetDetails');
    details.innerHTML = `
      <div><dt>QR Code</dt><dd>${escapeHTML(asset.qr_code)}</dd></div>
      <div><dt>Name</dt><dd>${escapeHTML(asset.name)}</dd></div>
      <div><dt>Category</dt><dd>${escapeHTML(asset.category)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHTML(asset.status)}</dd></div>
      <div><dt>Value</dt><dd>${escapeHTML(money(asset.value))}</dd></div>
      <div><dt>Location</dt><dd>${escapeHTML(asset.location || 'N/A')}</dd></div>`;
    showDialog($('#viewAssetModal'));
  } catch (error) {
    console.error('Error viewing asset:', error);
    alert('Unable to load asset details.');
  }
};

window.editAsset = (qrCode) => {
  if (!qrCode) {
    alert('Asset QR code is missing.');
    return;
  }

  fetch(`/api/v1/inventory/assets/${encodeURIComponent(qrCode)}`)
    .then(async (response) => {
      const payload = await response.json();
      const asset = payload.asset || payload;
      if (!response.ok || !asset || asset.error) throw new Error(asset?.error || 'Asset not found');
      openAssetForm(asset);
    })
    .catch((error) => {
      console.error('Error loading asset for editing:', error);
      alert(error.message || 'Unable to load asset for editing.');
    });
};

// Add Asset Button - open the in-module form
const addAssetBtn = $('#addAsset');
if (addAssetBtn) {
  addAssetBtn.addEventListener('click', () => openAssetForm());
}

// View All Transactions Button
const viewAllTransactionsBtn = $('#viewAllTransactions');
if (viewAllTransactionsBtn) {
  viewAllTransactionsBtn.onclick = async () => {
    await loadRecentTransactions(true);
    $('#transactionTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

// Asset search + category filter (client-side)
const assetSearchInput = $('#assetSearch');
const assetCategoryFilter = $('#categoryFilter');
function applyAssetFilters() {
  const term = (assetSearchInput?.value || '').toLowerCase();
  const cat = assetCategoryFilter?.value || '';
  const filtered = allAssets.filter((a) => {
    const matchesTerm = !term || `${a.qr_code} ${a.name} ${a.location}`.toLowerCase().includes(term);
    const matchesCat = !cat || a.category === cat;
    return matchesTerm && matchesCat;
  });
  renderAssetTable(filtered);
}
if (assetSearchInput) assetSearchInput.oninput = applyAssetFilters;
if (assetCategoryFilter) assetCategoryFilter.onchange = applyAssetFilters;

