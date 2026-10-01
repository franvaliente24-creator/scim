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
const ASSET_PAGE_SIZE = 10;
let assetPage = 0;

// Server-side search + multi-column filters (TRD §8): the query is pushed
// to the API so large ledgers stay cheap; results paginate client-side.
async function loadInventoryData(updateStats = true) {
  try {
    const params = new URLSearchParams();
    const term = ($('#assetSearch')?.value || '').trim();
    const cat = $('#categoryFilter')?.value || '';
    const st = $('#statusFilter')?.value || '';
    if (term) params.set('search', term);
    if (cat) params.set('category', cat);
    if (st) params.set('status', st);
    const qs = params.toString();
    const response = await api('inventory/assets' + (qs ? `?${qs}` : ''));
    const assets = Array.isArray(response.assets) ? response.assets : [];
    allAssets = assets;
    assetPage = 0;

    if (updateStats) {
      // Stats always reflect the unfiltered active ledger.
      const all = term || cat || st ? (await api('inventory/assets')).assets || [] : assets;
      const totalValue = all.reduce((s, a) => s + Number(a.value || 0) * (Number(a.quantity) || 1), 0);
      if ($('#totalAssets')) $('#totalAssets').textContent = all.length;
      if ($('#totalValue')) $('#totalValue').textContent = money(totalValue);
      if ($('#deployedAssets')) $('#deployedAssets').textContent = all.filter(a => a.status === 'Deployed').length;
      if ($('#warehouseAssets')) $('#warehouseAssets').textContent = all.filter(a => a.status === 'In Warehouse').length;
    }

    renderAssetTable(assets);
    loadRecentTransactions();
  } catch (error) {
    console.error('Error loading inventory data:', error);
  }
}

// Taxonomy-grouped ledger: category header rows carry the product hierarchy
// (Category ▸ items) with per-group counts and subtotal value.
function renderAssetTable(assets) {
  const el = $('#assetTable');
  const pager = $('#assetPager');
  if (!el) return;
  if (!assets.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No assets match. Register one with "Add Asset", or scan a pending serial into stock.</p>';
    if (pager) pager.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(assets.length / ASSET_PAGE_SIZE));
  assetPage = Math.min(Math.max(assetPage, 0), totalPages - 1);
  const rows = assets.slice(assetPage * ASSET_PAGE_SIZE, (assetPage + 1) * ASSET_PAGE_SIZE);

  const groups = {};
  rows.forEach((a) => { const c = a.category || 'Uncategorized'; (groups[c] = groups[c] || []).push(a); });

  const iconBtn = (action, icon, title, cls, extra = '') =>
    `<button type="button" title="${title}" aria-label="${title}" class="action-btn ${cls} !px-2" data-asset-action="${action}" ${extra}><span class="material-symbols-outlined text-base">${icon}</span></button>`;

  el.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>Serial / QR</th><th>Asset Name</th><th>Qty</th><th>Status</th><th>Value</th>
      <th>Purchased</th><th>Lifespan</th><th>Location</th><th>Actions</th>
    </tr></thead>
    <tbody>${Object.entries(groups).map(([cat, items]) => {
      const subtotal = items.reduce((s, a) => s + Number(a.value || 0) * (Number(a.quantity) || 1), 0);
      const lowFlag = items.filter(a => a.low_stock_threshold != null && Number(a.quantity) < Number(a.low_stock_threshold)).length;
      return `<tr class="bg-slate-50/80"><td colspan="9" class="!py-2.5">
          <span class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span class="material-symbols-outlined text-sm">folder</span>${escapeHTML(cat)}
            <span class="font-normal normal-case">· ${items.length} asset${items.length === 1 ? '' : 's'} · ${money(subtotal)}</span>
            ${lowFlag ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold"><span class="material-symbols-outlined text-xs">warning</span>${lowFlag} below threshold</span>` : ''}
          </span></td></tr>` +
        items.map((a) => {
          const qty = Number(a.quantity ?? 1);
          const low = a.low_stock_threshold != null && qty < Number(a.low_stock_threshold);
          return `<tr>
            <td><span class="tag">${escapeHTML(a.qr_code)}</span></td>
            <td><b>${escapeHTML(a.name)}</b></td>
            <td class="${low ? 'text-red-600 font-bold' : ''}">${qty}${a.low_stock_threshold != null ? ` <small class="text-on-surface-variant font-normal">/ min ${a.low_stock_threshold}</small>` : ''}</td>
            <td><span class="tag ${getStatusClass(a.status)}">${escapeHTML(a.status)}</span></td>
            <td>${money(a.value)}</td>
            <td>${a.date_purchased ? new Date(a.date_purchased).toLocaleDateString() : '—'}</td>
            <td>${a.lifespan_months != null ? `${a.lifespan_months} mo` : '—'}</td>
            <td>${escapeHTML(a.location || 'N/A')}</td>
            <td class="whitespace-nowrap">
              ${iconBtn('view', 'visibility', 'View', 'action-btn-view', `data-qr-code="${escapeHTML(a.qr_code)}"`)}
              ${iconBtn('edit', 'edit', 'Edit', 'action-btn-edit', `data-qr-code="${escapeHTML(a.qr_code)}"`)}
              ${(typeof currentUserRole === 'undefined' || currentUserRole === 'Admin')
                ? iconBtn('delete', 'delete', 'Delete', 'action-btn-danger', `data-qr-code="${escapeHTML(a.qr_code)}" data-asset-name="${escapeHTML(a.name)}"`)
                : ''}
            </td></tr>`;
        }).join('');
    }).join('')}</tbody></table>`;

  if (pager) {
    pager.innerHTML = totalPages > 1
      ? `<span>${assets.length} asset${assets.length === 1 ? '' : 's'} · page ${assetPage + 1} of ${totalPages}</span>
         <span class="flex gap-2">
           <button type="button" id="assetPrev" class="px-3 py-1 rounded-lg border border-outline-variant text-xs font-semibold disabled:opacity-40" ${assetPage === 0 ? 'disabled' : ''}>‹ Prev</button>
           <button type="button" id="assetNext" class="px-3 py-1 rounded-lg border border-outline-variant text-xs font-semibold disabled:opacity-40" ${assetPage >= totalPages - 1 ? 'disabled' : ''}>Next ›</button>
         </span>`
      : `<span>${assets.length} asset${assets.length === 1 ? '' : 's'}</span>`;
    $('#assetPrev')?.addEventListener('click', () => { assetPage--; renderAssetTable(assets); });
    $('#assetNext')?.addEventListener('click', () => { assetPage++; renderAssetTable(assets); });
  }
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
  assetForm.elements.quantity.value = asset?.quantity ?? 1;
  assetForm.elements.low_stock_threshold.value = asset?.low_stock_threshold ?? '';
  assetForm.elements.date_purchased.value = asset?.date_purchased || '';
  assetForm.elements.lifespan_months.value = asset?.lifespan_months ?? '';
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
      <div><dt>Location</dt><dd>${escapeHTML(asset.location || 'N/A')}</dd></div>
      <div><dt>Quantity</dt><dd>${escapeHTML(asset.quantity ?? 1)}</dd></div>
      <div><dt>Low-Stock Threshold</dt><dd>${asset.low_stock_threshold ?? '—'}</dd></div>
      <div><dt>Date Purchased</dt><dd>${asset.date_purchased ? new Date(asset.date_purchased).toLocaleDateString() : '—'}</dd></div>
      <div><dt>Lifespan</dt><dd>${asset.lifespan_months != null ? asset.lifespan_months + ' months' : '—'}</dd></div>`;
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

// Asset search + multi-column filters (server-side, debounced)
const assetSearchInput = $('#assetSearch');
const assetCategoryFilter = $('#categoryFilter');
const assetStatusFilter = $('#statusFilter');
let assetSearchTimer = null;
const applyAssetFilters = () => {
  clearTimeout(assetSearchTimer);
  assetSearchTimer = setTimeout(() => loadInventoryData(false), 300);
};
if (assetSearchInput) assetSearchInput.oninput = applyAssetFilters;
if (assetCategoryFilter) assetCategoryFilter.onchange = applyAssetFilters;
if (assetStatusFilter) assetStatusFilter.onchange = applyAssetFilters;



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

// Pending Stock Adjustments (TRD §3/§4): generated serials sit here —
// excluded from the active ledger by the API — until physically scanned.
// Each row renders its QR tag for re-printing.
async function loadAdjustments() {
  const res = await api('inventory/assets?pending=1');
  const pending = res.assets || [];
  const el = $('#adjustmentsList');
  if (!el) return;
  el.innerHTML = pending.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">QR Tag</th><th class="text-left p-4">Serial</th><th class="text-left p-4">Asset</th><th class="text-left p-4">Category</th><th class="text-left p-4">Generated</th></tr></thead>
    <tbody>${pending.map(a => `<tr class="border-b border-slate-50">
    <td class="p-4"><canvas class="pending-qr" data-serial="${escapeHTML(a.qr_code)}" width="64" height="64"></canvas></td>
    <td class="p-4 font-mono text-xs">${escapeHTML(a.qr_code)}</td>
    <td class="p-4 font-medium">${escapeHTML(a.name)}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(a.category || '—')}</td>
    <td class="p-4 text-on-surface-variant">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No pending adjustments — generate serials in Smart Warehousing → Generate QR, then scan each tag at intake to commit it here.</div>';
  el.querySelectorAll('.pending-qr').forEach((cv) => {
    if (typeof QRious !== 'undefined') new QRious({ element: cv, value: cv.dataset.serial, size: 64 });
  });
}

function reqStatusBadge(s) {
  const cls = s === 'Approved' ? 'bg-emerald-100 text-emerald-700'
    : s === 'Rejected' || s === 'Cancelled' ? 'bg-red-100 text-red-700'
    : s === 'Ordered' || s === 'Closed' ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700';
  return `<span class="px-2 py-1 rounded text-xs font-semibold ${cls}">${escapeHTML(s || 'Submitted')}</span>`;
}

async function loadInvRequisitions() {
  const form = $('#invReqForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#invReqFormMsg');
      const res = await fetch('/api/v1/procurement/requisitions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { if (msg) { msg.textContent = data.error || 'Submission failed.'; msg.className = 'text-xs text-red-600 mr-auto'; } return; }
      form.reset();
      if (msg) { msg.textContent = `Requisition ${data.req_number} submitted for approval.`; msg.className = 'text-xs text-emerald-600 mr-auto'; }
      loadInvRequisitions();
    });
  }
  const res = await api('procurement/requisitions');
  const reqs = res.requisitions || [];
  const search = $('#invReqSearch');
  const render = () => {
    const q = (search?.value || '').toLowerCase().trim();
    const filtered = q ? reqs.filter(r => [r.req_number, r.title, r.status, r.department].some(v => (v || '').toLowerCase().includes(q))) : reqs;
    const tbl = $('#invRequisitionsTable');
    if (!tbl) return;
    tbl.innerHTML = filtered.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
      <th class="text-left p-4">Req #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Department</th><th class="text-left p-4">Est. Cost</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Status</th><th class="text-left p-4">Requested</th></tr></thead>
      <tbody>${filtered.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.req_number)}</td><td class="p-4 font-medium">${escapeHTML(r.title)}</td>
      <td class="p-4 text-on-surface-variant">${escapeHTML(r.department || '—')}</td><td class="p-4 font-mono">${r.estimated_cost != null ? money(r.estimated_cost) : '—'}</td>
      <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td><td class="p-4">${reqStatusBadge(r.status)}</td>
      <td class="p-4 text-on-surface-variant">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="p-10 text-center text-on-surface-variant text-sm">No requisitions found.</div>';
  };
  if (search && !search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', render); }
  render();
}

// Approve / Reject controls — rendered only for Admins; the API enforces
// the exclusive authority server-side (403 for non-Admin status changes).
async function loadInvApprovals() {
  const res = await api('procurement/requisitions');
  const pending = (res.requisitions || []).filter(r => !['Approved', 'Rejected', 'Closed', 'Cancelled', 'Ordered'].includes(r.status));
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const el = $('#invApprovalsTable');
  if (!el) return;
  el.innerHTML = pending.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Req #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Department</th><th class="text-left p-4">Est. Cost</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Requested</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${pending.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.req_number)}</td><td class="p-4 font-medium">${escapeHTML(r.title)}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(r.department || '—')}</td><td class="p-4 font-mono">${r.estimated_cost != null ? money(r.estimated_cost) : '—'}</td>
    <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td>
    <td class="p-4 text-on-surface-variant">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
    <td class="p-4 whitespace-nowrap">${isAdmin
      ? `<button type="button" title="Approve" aria-label="Approve requisition" class="action-btn !px-2 text-emerald-600" data-req-action="approve" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">check_circle</span></button>
         <button type="button" title="Reject" aria-label="Reject requisition" class="action-btn !px-2 text-red-600" data-req-action="reject" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">cancel</span></button>`
      : '<span class="text-xs text-on-surface-variant">Admin review required</span>'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No pending approvals — all requisitions have been decided.</div>';
}

document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-req-action][data-req-id]');
  if (!btn) return;
  const status = btn.dataset.reqAction === 'approve' ? 'Approved' : 'Rejected';
  const res = await fetch(`/api/v1/procurement/requisitions/${encodeURIComponent(btn.dataset.reqId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || `Unable to ${status.toLowerCase()} requisition.`); return; }
  invLoaded.approvals = false; invLoaded.requisitions = false;
  loadInvApprovals();
});

async function loadValuation() {
  const assets = await invAssets();
  const cats = {};
  assets.forEach(a => {
    const c = a.category || 'General';
    cats[c] = cats[c] || { count: 0, value: 0, deployed: 0 };
    cats[c].count++;
    cats[c].value += parseFloat(a.value || 0) * (Number(a.quantity) || 1);
    if (a.status === 'Deployed') cats[c].deployed++;
  });
  $('#valuationList').innerHTML = Object.keys(cats).length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Category</th><th class="text-left p-4">Units</th><th class="text-left p-4">Deployed</th><th class="text-left p-4">Book Value</th></tr></thead>
    <tbody>${Object.entries(cats).sort((a, b) => b[1].value - a[1].value).map(([c, d]) => `<tr class="border-b border-slate-50"><td class="p-4 font-medium">${c}</td><td class="p-4">${d.count}</td><td class="p-4">${d.deployed}</td><td class="p-4 font-mono">₱${d.value.toLocaleString()}</td></tr>`).join('')}</tbody>
    <tfoot><tr class="bg-slate-50 font-bold"><td class="p-4">Total</td><td class="p-4">${assets.length}</td><td class="p-4">${Object.values(cats).reduce((s, d) => s + d.deployed, 0)}</td><td class="p-4 font-mono">₱${Object.values(cats).reduce((s, d) => s + d.value, 0).toLocaleString()}</td></tr></tfoot></table>`
    : '<div class="text-sm text-on-surface-variant text-center py-8">No valuation data.</div>';
}

async function loadInvHistory() {
  const res = await api('inventory/transactions');
  $('#invHistoryList').innerHTML = (res.transactions || []).length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Timestamp</th><th class="text-left p-4">Asset</th><th class="text-left p-4">Transaction</th><th class="text-left p-4">Zone / Location</th></tr></thead>
    <tbody>${res.transactions.map(t => `<tr class="border-b border-slate-50"><td class="p-4 text-on-surface-variant text-xs">${new Date(t.created_at).toLocaleString()}</td>
    <td class="p-4"><span class="font-mono text-xs">${escapeHTML(t.qr_code || '—')}</span><div class="text-xs text-on-surface-variant">${escapeHTML(t.asset_name || '')}</div></td>
    <td class="p-4"><span class="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">${escapeHTML(t.action || '—')}</span></td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(t.zone || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="text-sm text-on-surface-variant text-center py-8">No transaction history.</div>';
}

const invTabLoaders = {
  ledger: loadInventoryData,
  adjustments: loadAdjustments,
  requisitions: loadInvRequisitions,
  approvals: loadInvApprovals,
  valuation: loadValuation,
  history: loadInvHistory,
};

window.refreshInvTab = (name) => { invLoaded[name] = false; if (invTabLoaders[name]) return invTabLoaders[name](); };

document.addEventListener('hub:tab', (e) => {
  const name = e.detail.tab;
  if (name === 'ledger') return; // ledger hydrates on DOMContentLoaded
  if (!invLoaded[name] && invTabLoaders[name]) { invLoaded[name] = true; invTabLoaders[name](); }
});

if (window.initHubTabs) initHubTabs('ledger');
