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
      if ($('#totalAssets')) $('#totalAssets').textContent = all.length;
      if ($('#deployedAssets')) $('#deployedAssets').textContent = all.filter(a => a.status === 'Deployed').length;
      if ($('#warehouseAssets')) $('#warehouseAssets').textContent = all.filter(a => a.status === 'In Warehouse').length;
    }

    renderAssetTable(assets);
  } catch (error) {
    console.error('Error loading inventory data:', error);
  }
}

// Batch selection state for bulk delete (Admin only).
const selectedAssets = new Set();
const isAdminUser = () => typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';

function renderBatchBar(assets) {
  const bar = $('#assetBatchBar');
  if (!bar) return;
  const n = [...selectedAssets].filter((qr) => assets.some((a) => a.qr_code === qr)).length;
  if (!n || !isAdminUser()) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<div class="flex items-center gap-3 px-4 py-2.5 bg-red-50 border-b border-red-100 text-sm">
      <span class="font-semibold text-red-700">${n} selected</span>
      <button type="button" id="batchDeleteBtn" class="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700">Delete Selected</button>
      <button type="button" id="batchClearBtn" class="text-xs text-slate-500 hover:underline">Clear</button>
    </div>`;
  $('#batchDeleteBtn')?.addEventListener('click', () => batchDeleteAssets(assets));
  $('#batchClearBtn')?.addEventListener('click', () => { selectedAssets.clear(); renderAssetTable(assets); });
}

async function batchDeleteAssets(assets) {
  const qrs = [...selectedAssets].filter((qr) => assets.some((a) => a.qr_code === qr));
  if (!qrs.length) return;
  const ok = await (window.scimConfirm ? scimConfirm({
    title: `Delete ${qrs.length} assets?`,
    message: 'Selected records move to the Trash Bin for the retention period before permanent deletion. Audit entries are written for each.',
    confirmLabel: 'Delete', icon: 'delete_forever',
  }) : Promise.resolve(confirm(`Delete ${qrs.length} assets?`)));
  if (!ok) return;
  let failed = 0;
  for (const qr of qrs) {
    const res = await fetch(`/api/v1/assets/${encodeURIComponent(qr)}`, { method: 'DELETE' });
    if (!res.ok) failed++;
  }
  selectedAssets.clear();
  if (failed) alert(`${failed} record(s) could not be deleted.`);
  loadInventoryData();
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
    renderBatchBar(assets);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(assets.length / ASSET_PAGE_SIZE));
  assetPage = Math.min(Math.max(assetPage, 0), totalPages - 1);
  const rows = assets.slice(assetPage * ASSET_PAGE_SIZE, (assetPage + 1) * ASSET_PAGE_SIZE);

  const groups = {};
  rows.forEach((a) => { const c = a.category || 'Uncategorized'; (groups[c] = groups[c] || []).push(a); });

  const iconBtn = (action, icon, title, cls, extra = '') =>
    `<button type="button" title="${title}" aria-label="${title}" class="action-btn ${cls} !px-2" data-asset-action="${action}" ${extra}><span class="material-symbols-outlined text-base">${icon}</span></button>`;

  const adminCols = isAdminUser();
  el.innerHTML = `<table class="data-table">
    <thead><tr>
      ${adminCols ? '<th class="w-8"><input type="checkbox" id="assetSelectAll" title="Select all on this page" aria-label="Select all"></th>' : ''}
      <th>ID</th><th>Asset Name</th><th>Qty</th><th>Status</th><th>Value</th>
      <th>Purchased</th><th>Lifespan</th><th>Location</th><th>Actions</th>
    </tr></thead>
    <tbody>${Object.entries(groups).map(([cat, items]) => {
      const subtotal = items.reduce((s, a) => s + Number(a.value || 0) * (Number(a.quantity) || 1), 0);
      const lowFlag = items.filter(a => a.low_stock_threshold != null && Number(a.quantity) < Number(a.low_stock_threshold)).length;
      return `<tr class="bg-slate-50/80"><td colspan="${adminCols ? 10 : 9}" class="!py-2.5">
          <span class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span class="material-symbols-outlined text-sm">folder</span>${escapeHTML(cat)}
            <span class="font-normal normal-case">· ${items.length} asset${items.length === 1 ? '' : 's'} · ${money(subtotal)}</span>
            ${lowFlag ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold"><span class="material-symbols-outlined text-xs">warning</span>${lowFlag} below threshold</span>` : ''}
          </span></td></tr>` +
        items.map((a) => {
          const qty = Number(a.quantity ?? 1);
          const low = a.low_stock_threshold != null && qty < Number(a.low_stock_threshold);
          return `<tr>
            ${adminCols ? `<td><input type="checkbox" class="asset-row-check" data-qr="${escapeHTML(a.qr_code)}" ${selectedAssets.has(a.qr_code) ? 'checked' : ''} aria-label="Select ${escapeHTML(a.qr_code)}"></td>` : ''}
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
              ${adminCols
                ? iconBtn('archive', 'archive', 'Archive', 'action-btn-view', `data-qr-code="${escapeHTML(a.qr_code)}" data-asset-id="${a.id}"`) +
                  iconBtn('delete', 'delete', 'Delete', 'action-btn-danger', `data-qr-code="${escapeHTML(a.qr_code)}" data-asset-name="${escapeHTML(a.name)}"`)
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

  // Batch-select wiring
  el.querySelectorAll('.asset-row-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      cb.checked ? selectedAssets.add(cb.dataset.qr) : selectedAssets.delete(cb.dataset.qr);
      renderBatchBar(assets);
    });
  });
  $('#assetSelectAll')?.addEventListener('change', (e) => {
    rows.forEach((a) => e.target.checked ? selectedAssets.add(a.qr_code) : selectedAssets.delete(a.qr_code));
    renderAssetTable(assets);
  });
  renderBatchBar(assets);
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
  if (assetAction === 'archive') window.archiveRecord('asset', button.dataset.assetId, () => loadInventoryData());
  if (assetAction === 'delete') window.deleteAsset(qrCode, button.dataset.assetName || qrCode);
});

// Asset deletion — Admin only server-side, compliance-logged.
// Soft-deletes to the Trash Bin for the retention window.
window.deleteAsset = async (qrCode, name) => {
  if (!isAdminUser()) return;
  const ok = await (window.scimConfirm ? scimConfirm({
    title: 'Delete Asset?',
    message: `"${name}" moves to the Trash Bin for the retention period. A compliance record is written to the audit log. Restore it there, or purge permanently.`,
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
    <th class="text-left p-4">QR Tag</th><th class="text-left p-4">ID</th><th class="text-left p-4">Asset</th><th class="text-left p-4">Category</th><th class="text-left p-4">Generated</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${pending.map(a => `<tr class="border-b border-slate-50">
    <td class="p-4"><canvas class="pending-qr" data-serial="${escapeHTML(a.qr_code)}" width="64" height="64"></canvas></td>
    <td class="p-4 font-mono text-xs">${escapeHTML(a.qr_code)}</td>
    <td class="p-4 font-medium">${escapeHTML(a.name)}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(a.category || '—')}</td>
    <td class="p-4 text-on-surface-variant">${a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
    <td class="p-4"><button type="button" title="Discard pending serial" aria-label="Discard pending serial" class="action-btn action-btn-danger !px-2" data-pending-delete="${escapeHTML(a.qr_code)}"><span class="material-symbols-outlined text-base">delete</span></button></td></tr>`).join('')}</tbody></table>`
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

// Submission lives in Procurement & Sourcing — this tab is history/visibility.
async function loadInvRequisitions() {
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

// Discard a pending (unscanned) generated serial — never reached active stock.
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-pending-delete]');
  if (!btn) return;
  const ok = await (window.scimConfirm ? scimConfirm({
    title: 'Discard pending serial?',
    message: 'This unscanned tag is removed permanently — it never entered active inventory.',
    confirmLabel: 'Discard', icon: 'delete',
  }) : Promise.resolve(confirm('Discard this pending serial?')));
  if (!ok) return;
  const res = await fetch(`/api/v1/inventory/pending/${encodeURIComponent(btn.dataset.pendingDelete)}`, { method: 'DELETE' });
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Unable to discard.'); return; }
  loadAdjustments();
});

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

// Centralized Archive — GET /api/v1/archives lists every entity; filtered client-side.
// Restore via POST /api/v1/records/{entity}/{id}/restore (Admin-only).
async function loadArchiveTable() {
  const entity = $('#archiveResource')?.value || 'asset';
  const q = ($('#archiveSearch')?.value || '').toLowerCase();
  const data = await api('archives').catch(() => ({}));
  const rows = (data.items || []).filter((r) => r.entity === entity && (!q || `${r.label} ${r.ref}`.toLowerCase().includes(q)));
  const el = $('#archiveTable');
  if (!el) return;
  el.innerHTML = rows.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Ref</th><th class="text-left p-4">Record</th><th class="text-left p-4">Archived</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="border-b border-slate-50">
      <td class="p-4 font-mono text-xs">${escapeHTML(r.ref || r.id)}</td>
      <td class="p-4 font-medium">${escapeHTML(r.label)}</td>
      <td class="p-4 text-on-surface-variant text-xs">${r.archived_at ? new Date(r.archived_at).toLocaleString() : '—'}</td>
      <td class="p-4"><button type="button" title="Restore" aria-label="Restore record" class="action-btn action-btn-view !px-2" data-restore-res="${r.entity}" data-restore-id="${r.id}"><span class="material-symbols-outlined text-base">unarchive</span></button></td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">Archive is empty.</div>';
}

// Trash Bin — GET /api/v1/trash returns each row's remaining retention days;
// rows past the window are auto-purged server-side on read.
async function loadTrashTable() {
  const entity = $('#trashResource')?.value || 'asset';
  const data = await api('trash').catch(() => ({}));
  const rows = (data.items || []).filter((r) => r.entity === entity);
  const el = $('#trashTable');
  if (!el) return;
  el.innerHTML = rows.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Ref</th><th class="text-left p-4">Record</th><th class="text-left p-4">Deleted</th><th class="text-left p-4">Retention</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${rows.map((r) => {
      const left = Number(r.days_left);
      const canPurge = left === 0;
      return `<tr class="border-b border-slate-50">
      <td class="p-4 font-mono text-xs">${escapeHTML(r.ref || r.id)}</td>
      <td class="p-4 font-medium">${escapeHTML(r.label)}</td>
      <td class="p-4 text-on-surface-variant text-xs">${r.deleted_at ? new Date(r.deleted_at).toLocaleString() : '—'}</td>
      <td class="p-4 text-xs">${left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : '<span class="text-red-600 font-semibold">Retention expired</span>'}</td>
      <td class="p-4 whitespace-nowrap">
        <button type="button" title="Restore" aria-label="Restore record" class="action-btn action-btn-view !px-2" data-restore-res="${r.entity}" data-restore-id="${r.id}"><span class="material-symbols-outlined text-base">restore_from_trash</span></button>
        <button type="button" title="${canPurge ? 'Delete permanently' : 'Locked while retention runs'}" aria-label="Delete permanently" class="action-btn action-btn-danger !px-2 ${canPurge ? '' : 'opacity-40 cursor-not-allowed'}" data-purge-res="${r.entity}" data-purge-id="${r.id}" ${canPurge ? '' : 'disabled'}><span class="material-symbols-outlined text-base">delete_forever</span></button>
      </td></tr>`;
    }).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">Trash bin is empty.</div>';
}

document.addEventListener('click', async (event) => {
  const rBtn = event.target.closest('[data-restore-res]');
  if (rBtn) {
    const res = await fetch(`/api/v1/records/${rBtn.dataset.restoreRes}/${rBtn.dataset.restoreId}/restore`, { method: 'POST' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Restore failed.'); }
    invLoaded.archive = invLoaded.trash = false;
    loadArchiveTable(); loadTrashTable(); loadInventoryData();
    return;
  }
  const pBtn = event.target.closest('[data-purge-res]');
  if (pBtn && !pBtn.disabled) {
    const ok = await (window.scimConfirm ? scimConfirm({
      title: 'Permanently delete?',
      message: 'This record is erased forever — no restore possible. The audit trail entry is preserved.',
      confirmLabel: 'Purge', icon: 'delete_forever',
    }) : Promise.resolve(confirm('Permanently delete this record? This cannot be undone.')));
    if (!ok) return;
    const res = await fetch(`/api/v1/records/${pBtn.dataset.purgeRes}/${pBtn.dataset.purgeId}?permanent=1`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Purge refused — retention window may still be active.'); }
    loadTrashTable();
  }
});

['archiveResource', 'archiveSearch'].forEach((id) => {
  const el = $('#' + id);
  if (el) { el.dataset.bound || (el.dataset.bound = '1', el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', loadArchiveTable)); }
});
$('#trashResource')?.addEventListener('change', loadTrashTable);

const invTabLoaders = {
  ledger: loadInventoryData,
  adjustments: loadAdjustments,
  requisitions: loadInvRequisitions,
  approvals: loadInvApprovals,
  valuation: loadValuation,
  history: loadInvHistory,
  archive: loadArchiveTable,
  trash: loadTrashTable,
};

window.refreshInvTab = (name) => { invLoaded[name] = false; if (invTabLoaders[name]) return invTabLoaders[name](); };

document.addEventListener('hub:tab', (e) => {
  const name = e.detail.tab;
  if (name === 'ledger') return; // ledger hydrates on DOMContentLoaded
  if (!invLoaded[name] && invTabLoaders[name]) { invLoaded[name] = true; invTabLoaders[name](); }
});

if (window.initHubTabs) initHubTabs('ledger');
