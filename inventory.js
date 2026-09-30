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



// ==========================================
// INVENTORY HUB TABS
// ==========================================
const invLoaded = {};

function invStatusColor(s) {
  return s === 'Deployed' ? 'bg-blue-100 text-blue-700 border-blue-200'
    : s === 'In Warehouse' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : s === 'Maintenance' ? 'bg-red-100 text-red-700 border-red-200'
    : s === 'Decommissioned' ? 'bg-slate-200 text-slate-600 border-slate-300'
    : 'bg-amber-100 text-amber-700 border-amber-200';
}

async function invAssets() { const r = await api('inventory/assets'); return r.assets || []; }

async function loadInvDashboard() {
  const assets = await invAssets();
  const inbound = assets.filter(a => a.warehouse_location === 'Inbound/Receiving').length;
  const deployed = assets.filter(a => a.status === 'Deployed').length;
  const value = assets.filter(a => a.status !== 'Decommissioned').reduce((s, a) => s + parseFloat(a.purchase_price || 0), 0);
  $('#invDashTotal').textContent = assets.length;
  $('#invDashDeployed').textContent = deployed;
  $('#invDashInbound').textContent = inbound;
  $('#invDashValue').textContent = `₱${value.toLocaleString()}`;
  const statuses = {};
  assets.forEach(a => { statuses[a.status] = (statuses[a.status] || 0) + 1; });
  const distEl = $('#invDashDist');
  if (!assets.length) { distEl.innerHTML = '<div class="text-sm text-on-surface-variant">No assets recorded.</div>'; return; }
  distEl.innerHTML = Object.entries(statuses).sort((a, b) => b[1] - a[1]).map(([s, n]) => `
    <div class="flex items-center gap-4">
      <span class="text-xs font-bold text-on-surface-variant w-40 shrink-0">${s}</span>
      <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:${Math.round(n / assets.length * 100)}%"></div></div>
      <span class="text-sm font-bold w-10 text-right">${n}</span>
    </div>`).join('');
}

async function loadInvSearch() {
  const assets = await invAssets();
  const results = $('#invSearchResults'), input = $('#invSearchInput');
  const render = () => {
    const q = (input.value || '').toLowerCase().trim();
    const filtered = q ? assets.filter(a => [a.qr_code, a.name, a.category, a.location, a.assigned_to, a.status]
      .some(v => (v || '').toLowerCase().includes(q))) : assets;
    results.innerHTML = `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
      <th class="text-left p-4">QR Code</th><th class="text-left p-4">Name</th><th class="text-left p-4">Category</th><th class="text-left p-4">Status</th><th class="text-left p-4">Location</th><th class="text-left p-4">Assigned</th></tr></thead>
      <tbody>${filtered.map(a => `<tr class="border-b border-slate-50 hover:bg-slate-50">
      <td class="p-4 font-mono text-xs">${a.qr_code}</td><td class="p-4 font-medium">${a.name}</td><td class="p-4">${a.category || '—'}</td>
      <td class="p-4"><span class="px-2 py-1 rounded text-xs font-semibold border ${invStatusColor(a.status)}">${a.status}</span></td>
      <td class="p-4 text-on-surface-variant">${a.location || '—'}</td><td class="p-4 text-on-surface-variant">${a.assigned_to || '—'}</td></tr>`).join('') || `<tr><td colspan="6" class="p-8 text-center text-on-surface-variant">No matching assets.</td></tr>`}</tbody></table>`;
  };
  if (input && !input.dataset.bound) { input.dataset.bound = '1'; input.addEventListener('input', render); }
  render();
}

async function loadQrLookup() {
  const form = $('#qrLookupForm'), box = $('#qrLookupResult');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = form.qr.value.trim();
    if (!code) return;
    box.innerHTML = '<div class="text-sm text-on-surface-variant">Looking up serial...</div>';
    const assets = await invAssets();
    const a = assets.find(x => x.qr_code.toLowerCase() === code.toLowerCase());
    if (!a) { box.innerHTML = `<div class="p-5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">No asset matches serial <span class="font-mono">${code}</span>.</div>`; return; }
    box.innerHTML = `<div class="p-5 rounded-xl bg-slate-50 border border-slate-200">
      <div class="flex items-center justify-between mb-3"><h3 class="font-bold text-on-surface">${a.name}</h3><span class="px-2 py-1 rounded text-xs font-semibold border ${invStatusColor(a.status)}">${a.status}</span></div>
      <dl class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><dt class="text-xs text-on-surface-variant">QR Serial</dt><dd class="font-mono font-medium">${a.qr_code}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">Category</dt><dd class="font-medium">${a.category || '—'}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">Warehouse Location</dt><dd class="font-medium">${a.warehouse_location || '—'}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">Physical Location</dt><dd class="font-medium">${a.location || '—'}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">Assigned To</dt><dd class="font-medium">${a.assigned_to || '—'}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">Purchase Price</dt><dd class="font-medium">₱${parseFloat(a.purchase_price || 0).toLocaleString()}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">PO Reference</dt><dd class="font-mono">${a.po_number || '—'}</dd></div>
        <div><dt class="text-xs text-on-surface-variant">Warranty Until</dt><dd class="font-medium">${a.warranty_until ? new Date(a.warranty_until).toLocaleDateString() : '—'}</dd></div>
      </dl></div>`;
  });
}

async function loadAdjustments() {
  const assets = await invAssets();
  const pending = assets.filter(a => a.status === 'Awaiting Print' || a.warehouse_location === 'Inbound/Receiving');
  $('#adjustmentsList').innerHTML = pending.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">QR Serial</th><th class="text-left p-4">Asset</th><th class="text-left p-4">Stage</th><th class="text-left p-4">Status</th><th class="text-left p-4">Received</th></tr></thead>
    <tbody>${pending.map(a => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${a.qr_code}</td><td class="p-4 font-medium">${a.name}</td>
    <td class="p-4 text-on-surface-variant">${a.warehouse_location || '—'}</td><td class="p-4"><span class="px-2 py-1 rounded text-xs font-semibold border ${invStatusColor(a.status)}">${a.status}</span></td>
    <td class="p-4 text-on-surface-variant">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No pending adjustments — the inbound pipeline is clear.</div>';
}

async function loadInvRequisitions() {
  const res = await api('procurement/requisitions');
  const reqs = res.requisitions || [];
  const search = $('#invReqSearch');
  const render = () => {
    const q = (search.value || '').toLowerCase().trim();
    const filtered = q ? reqs.filter(r => [r.req_number, r.title, r.status].some(v => (v || '').toLowerCase().includes(q))) : reqs;
    $('#invRequisitionsTable').innerHTML = filtered.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
      <th class="text-left p-4">Req #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Qty</th><th class="text-left p-4">Status</th><th class="text-left p-4">Created</th></tr></thead>
      <tbody>${filtered.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${r.req_number}</td><td class="p-4 font-medium">${r.title}</td>
      <td class="p-4">${r.quantity}</td><td class="p-4"><span class="px-2 py-1 rounded text-xs font-semibold ${r.status === 'Draft' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${r.status}</span></td>
      <td class="p-4 text-on-surface-variant">${new Date(r.created_at).toLocaleDateString()}</td></tr>`).join('')}</tbody></table>`
      : '<div class="p-10 text-center text-on-surface-variant text-sm">No requisitions found.</div>';
  };
  if (search && !search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', render); }
  render();
}

async function loadInvApprovals() {
  const res = await api('procurement/requisitions');
  const pending = (res.requisitions || []).filter(r => r.status === 'Draft');
  $('#invApprovalsTable').innerHTML = pending.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Req #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Qty</th><th class="text-left p-4">Requested</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${pending.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${r.req_number}</td><td class="p-4 font-medium">${r.title}</td><td class="p-4">${r.quantity}</td>
    <td class="p-4 text-on-surface-variant">${new Date(r.created_at).toLocaleDateString()}</td>
    <td class="p-4"><span class="text-xs text-on-surface-variant">Review under Procurement &amp; Sourcing</span></td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No pending approvals.</div>';
}

async function loadReorder() {
  const assets = await invAssets();
  const res = await api('stock-thresholds');
  const counts = {};
  assets.filter(a => a.status === 'In Warehouse' || a.status === 'Deployed').forEach(a => { const c = a.category || 'General'; counts[c] = (counts[c] || 0) + 1; });
  $('#reorderList').innerHTML = (res.thresholds || []).map(t => {
    const c = counts[t.category] || 0;
    const low = c < parseInt(t.min_threshold, 10);
    return `<div class="p-5 rounded-2xl border ${low ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'} flex items-center justify-between">
      <div><div class="font-bold text-sm ${low ? 'text-red-900' : 'text-on-surface'}">${t.category}</div>
      <div class="text-xs ${low ? 'text-red-600' : 'text-on-surface-variant'} mt-1">${c} on hand · min ${t.min_threshold}</div></div>
      ${low ? '<span class="material-symbols-outlined text-red-500">warning</span>' : '<span class="material-symbols-outlined text-emerald-500">check_circle</span>'}</div>`;
  }).join('') || '<div class="col-span-full text-sm text-on-surface-variant text-center py-8">No thresholds configured.</div>';
}

async function loadValuation() {
  const assets = await invAssets();
  const cats = {};
  assets.forEach(a => {
    const c = a.category || 'General';
    cats[c] = cats[c] || { count: 0, value: 0, deployed: 0 };
    cats[c].count++;
    cats[c].value += parseFloat(a.purchase_price || 0);
    if (a.status === 'Deployed') cats[c].deployed++;
  });
  $('#valuationList').innerHTML = Object.keys(cats).length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Category</th><th class="text-left p-4">Units</th><th class="text-left p-4">Deployed</th><th class="text-left p-4">Book Value</th></tr></thead>
    <tbody>${Object.entries(cats).sort((a, b) => b[1].value - a[1].value).map(([c, d]) => `<tr class="border-b border-slate-50"><td class="p-4 font-medium">${c}</td><td class="p-4">${d.count}</td><td class="p-4">${d.deployed}</td><td class="p-4 font-mono">₱${d.value.toLocaleString()}</td></tr>`).join('')}</tbody>
    <tfoot><tr class="bg-slate-50 font-bold"><td class="p-4">Total</td><td class="p-4">${assets.length}</td><td class="p-4">${Object.values(cats).reduce((s, d) => s + d.deployed, 0)}</td><td class="p-4 font-mono">₱${Object.values(cats).reduce((s, d) => s + d.value, 0).toLocaleString()}</td></tr></tfoot></table>`
    : '<div class="text-sm text-on-surface-variant text-center py-8">No valuation data.</div>';
}

async function loadInvSync() {
  const res = await api('integration/health');
  $('#invSyncList').innerHTML = (res.integrations || []).map(i => `
    <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
      <span class="material-symbols-outlined ${i.status === 'online' ? 'text-emerald-500' : 'text-slate-400'}">${i.status === 'online' ? 'sync' : 'sync_disabled'}</span>
      <div class="flex-1 min-w-0"><div class="font-bold text-sm text-on-surface">${i.display_name || i.system_name}</div>
      <div class="text-xs text-on-surface-variant">Last activity: ${i.last_sync ? new Date(i.last_sync).toLocaleString() : 'Never'}</div></div>
      <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${i.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">${i.status}</span>
    </div>`).join('') || '<div class="text-sm text-on-surface-variant text-center py-8">No integration streams registered.</div>';
}

async function loadInvHistory() {
  const res = await api('inventory/transactions');
  $('#invHistoryList').innerHTML = (res.transactions || []).length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Timestamp</th><th class="text-left p-4">Asset</th><th class="text-left p-4">Type</th><th class="text-left p-4">Location</th><th class="text-left p-4">Notes</th></tr></thead>
    <tbody>${res.transactions.map(t => `<tr class="border-b border-slate-50"><td class="p-4 text-on-surface-variant text-xs">${new Date(t.created_at).toLocaleString()}</td>
    <td class="p-4 font-mono text-xs">${t.asset_qr || '—'}</td><td class="p-4"><span class="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">${t.type}</span></td>
    <td class="p-4 text-on-surface-variant">${t.location || '—'}</td><td class="p-4 text-on-surface-variant">${t.notes || '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="text-sm text-on-surface-variant text-center py-8">No transaction history.</div>';
}

const invTabLoaders = {
  ledger: loadInventoryData,
  dashboard: loadInvDashboard,
  search: loadInvSearch,
  qrlookup: loadQrLookup,
  adjustments: loadAdjustments,
  requisitions: loadInvRequisitions,
  approvals: loadInvApprovals,
  reorder: loadReorder,
  valuation: loadValuation,
  sync: loadInvSync,
  history: loadInvHistory,
};

window.refreshInvTab = (name) => { invLoaded[name] = false; if (invTabLoaders[name]) return invTabLoaders[name](); };

document.addEventListener('hub:tab', (e) => {
  const name = e.detail.tab;
  if (name === 'ledger') return; // ledger hydrates on DOMContentLoaded
  if (!invLoaded[name] && invTabLoaders[name]) { invLoaded[name] = true; invTabLoaders[name](); }
});

if (window.initHubTabs) initHubTabs('ledger');
