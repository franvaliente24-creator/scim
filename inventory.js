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
    // Populate the location datalist with real zone codes so typed locations
    // match warehouse zones (occupancy counts by exact zone name).
    const zl = $('#assetZoneList');
    if (zl) {
      const zd = await api('warehouse/zones').catch(() => ({}));
      const zones = Array.isArray(zd.zones) ? zd.zones : [];
      zl.innerHTML = zones.map((z) => `<option value="${z.zone}">${z.category || ''}</option>`).join('');
    }
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

// §8: no delete buttons on sidebar pages — records leave via Archive (with a
// mandatory reason) and only the Admin Trash Bin can erase them.
const isAdminUser = () => typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
const canArchive = () => typeof currentUserRole === 'undefined' || ['Admin', 'Manager'].includes(currentUserRole);

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

  const adminCols = canArchive();
  el.innerHTML = `<table class="data-table">
    <thead><tr>
      <th>ID</th><th>Asset Name</th><th>Qty</th><th>Status</th><th>Value</th>
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
              ${adminCols
                ? iconBtn('archive', 'archive', 'Archive', 'action-btn-view', `data-qr-code="${escapeHTML(a.qr_code)}" data-asset-id="${a.id}"`)
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
  if (assetAction === 'archive') window.archiveRecord('asset', button.dataset.assetId, () => loadInventoryData());
});

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
  assetForm.elements.manufacturer.value = asset?.manufacturer || '';
  assetForm.elements.model.value = asset?.model || '';
  assetForm.elements.serial_number.value = asset?.serial_number || '';
  assetForm.elements.warranty_expiry.value = asset?.warranty_expiry || '';
  assetForm.elements.specs.value = asset?.specs || '';
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
    const row = (k, v) => `<div class="flex justify-between gap-4 py-1.5 border-b border-slate-100"><dt class="text-slate-500">${k}</dt><dd class="font-medium text-slate-800 text-right">${v ?? '—'}</dd></div>`;
    // §QR profile — the QR encodes only the Asset ID; the record opens here,
    // split into static (fixed at registration) vs dynamic (changing) data.
    details.innerHTML = `
      <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Identity &amp; Static Attributes</p>
      ${row('Asset ID', `<span class="font-mono">${escapeHTML(asset.qr_code)}</span>`)}
      ${row('Item Name', escapeHTML(asset.name))}
      ${row('Category', escapeHTML(asset.category))}
      ${row('Manufacturer', escapeHTML(asset.manufacturer))}
      ${row('Model', escapeHTML(asset.model))}
      ${row('Serial Number', escapeHTML(asset.serial_number))}
      ${row('Specifications', escapeHTML(asset.specs))}
      ${row('Value', escapeHTML(money(asset.value)))}
      ${row('Purchase Date', asset.date_purchased ? new Date(asset.date_purchased).toLocaleDateString() : null)}
      ${row('Warranty Expiry', asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString() : null)}
      ${row('Lifespan', asset.lifespan_months != null ? asset.lifespan_months + ' months' : null)}
      <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-4 mb-1">Dynamic Attributes</p>
      ${row('Status', escapeHTML(asset.status))}
      ${row('Zone / Location', escapeHTML(asset.location || 'Receiving Dock'))}
      ${row('Assigned To', escapeHTML(asset.external_employee_name))}
      ${row('Quantity', asset.quantity ?? 1)}
      ${row('Low-Stock Threshold', asset.low_stock_threshold ?? null)}`;
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
  const cls = ['Approved', 'Completed', 'Inventory Approved'].includes(s) ? 'bg-emerald-100 text-emerald-700'
    : s === 'Rejected' || s === 'Cancelled' ? 'bg-red-100 text-red-700'
    : s === 'Ordered' || s === 'Closed' ? 'bg-blue-100 text-blue-700'
    : s === 'Inventory Review' ? 'bg-indigo-100 text-indigo-700'
    : 'bg-amber-100 text-amber-700';
  return `<span class="px-2 py-1 rounded text-xs font-semibold ${cls}">${escapeHTML(s || 'Submitted')}</span>`;
}

// §5: requisition submission lives here (relocated from Procurement Sourcing).
// Open/active requisitions list; decided ones flow to the Requisition Log tab.
let invReqPage = 1;
const INV_REQ_PAGE = 10;
async function loadInvRequisitions() {
  const res = await api('procurement/requisitions');
  const reqs = (res.requisitions || []).filter(r => !['Approved', 'Rejected', 'Closed', 'Cancelled', 'Ordered', 'Completed'].includes(r.status));
  const search = $('#invReqSearch');
  const rangeSel = $('#invReqRange');
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const canDecide = isAdmin || (typeof currentUserRole !== 'undefined' && currentUserRole === 'Manager');
  const render = () => {
    const q = (search?.value || '').toLowerCase().trim();
    const days = parseInt(rangeSel?.value || '0', 10);
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    const filtered = reqs.filter(r =>
      (!q || [r.req_number, r.title, r.status, r.department, r.purpose].some(v => (v || '').toLowerCase().includes(q)))
      && (!cutoff || (r.created_at && new Date(r.created_at).getTime() >= cutoff)));
    const pages = Math.max(1, Math.ceil(filtered.length / INV_REQ_PAGE));
    if (invReqPage > pages) invReqPage = pages;
    const slice = filtered.slice((invReqPage - 1) * INV_REQ_PAGE, invReqPage * INV_REQ_PAGE);
    const tbl = $('#invRequisitionsTable');
    if (!tbl) return;
    // Spec §Requisitions: Purpose is the primary column (not Title); actions
    // stay inline — Approve (Admin/Manager), Reject (Admin-only, API-enforced).
    tbl.innerHTML = slice.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
      <th class="text-left p-4">Req ID</th><th class="text-left p-4">Purpose</th><th class="text-left p-4">Department</th><th class="text-left p-4">Est. Cost</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Status</th><th class="text-left p-4">Needed By</th><th class="text-left p-4">Actions</th></tr></thead>
      <tbody>${slice.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.req_number)}</td>
      <td class="p-4 font-medium">${escapeHTML(r.purpose || r.title || '—')}</td>
      <td class="p-4 text-on-surface-variant">${escapeHTML(r.department || '—')}</td><td class="p-4 font-mono">${r.estimated_cost != null ? money(r.estimated_cost) : '—'}</td>
      <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td><td class="p-4">${reqStatusBadge(r.status)}</td>
      <td class="p-4 text-on-surface-variant">${r.needed_by ? new Date(r.needed_by).toLocaleDateString() : '—'}</td>
      <td class="p-4 whitespace-nowrap">${canDecide
        ? `<button type="button" title="Approve" aria-label="Approve requisition" class="action-btn !px-2 text-emerald-600" data-req-action="approve" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">check_circle</span></button>` +
          (isAdmin ? ` <button type="button" title="Reject" aria-label="Reject requisition" class="action-btn !px-2 text-red-600" data-req-action="reject" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">cancel</span></button>` : '')
        : '<span class="text-xs text-on-surface-variant">—</span>'}</td></tr>`).join('')}</tbody></table>`
      : '<div class="p-10 text-center text-on-surface-variant text-sm">No open requisitions — submit one with "New Requisition".</div>';
    const pager = $('#invReqPager');
    if (pager) pager.innerHTML = filtered.length ? `<span class="text-xs text-slate-500">${filtered.length} requisitions · page ${invReqPage} of ${pages}</span>
      <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${invReqPage <= 1 ? 'disabled' : ''} onclick="invReqPage--; document.dispatchEvent(new CustomEvent('inv:req-render'))">Prev</button>
      <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${invReqPage >= pages ? 'disabled' : ''} onclick="invReqPage++; document.dispatchEvent(new CustomEvent('inv:req-render'))">Next</button></div>` : '';
  };
  if (search && !search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', () => { invReqPage = 1; render(); }); }
  if (rangeSel && !rangeSel.dataset.bound) { rangeSel.dataset.bound = '1'; rangeSel.addEventListener('change', () => { invReqPage = 1; render(); }); }
  if (!document._invReqRenderBound) { document._invReqRenderBound = true; document.addEventListener('inv:req-render', render); }
  render();
}

// Requisition Log (last tab): the full decided history — approved, rejected,
// completed, and ordered requests with their lifecycle timestamps.
let reqLogPage = 1;
const REQ_LOG_PAGE = 15;
async function loadReqLog() {
  const res = await api('procurement/requisitions');
  const reqs = (res.requisitions || []).filter(r => ['Approved', 'Rejected', 'Closed', 'Cancelled', 'Ordered', 'Completed'].includes(r.status));
  const rangeSel = $('#reqLogRange');
  const days = parseInt(rangeSel?.value || '0', 10);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const filtered = reqs.filter(r => !cutoff || (r.created_at && new Date(r.created_at).getTime() >= cutoff));
  const pages = Math.max(1, Math.ceil(filtered.length / REQ_LOG_PAGE));
  if (reqLogPage > pages) reqLogPage = pages;
  const slice = filtered.slice((reqLogPage - 1) * REQ_LOG_PAGE, reqLogPage * REQ_LOG_PAGE);
  const el = $('#reqLogTable');
  if (!el) return;
  el.innerHTML = slice.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Req ID</th><th class="text-left p-4">Purpose</th><th class="text-left p-4">Requested By</th><th class="text-left p-4">Est. Cost</th><th class="text-left p-4">Status</th><th class="text-left p-4">Decided</th></tr></thead>
    <tbody>${slice.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.req_number)}</td>
    <td class="p-4 font-medium">${escapeHTML(r.purpose || r.title || '—')}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(r.created_by_name || '—')}</td><td class="p-4 font-mono">${r.estimated_cost != null ? money(r.estimated_cost) : '—'}</td>
    <td class="p-4">${reqStatusBadge(r.status)}</td>
    <td class="p-4 text-on-surface-variant text-xs">${r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No decided requisitions yet — approved and rejected requests land here.</div>';
  const pager = $('#reqLogPager');
  if (pager) pager.innerHTML = filtered.length ? `<span class="text-xs text-slate-500">${filtered.length} records · page ${reqLogPage} of ${pages}</span>
    <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${reqLogPage <= 1 ? 'disabled' : ''} onclick="reqLogPage--; loadReqLog()">Prev</button>
    <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${reqLogPage >= pages ? 'disabled' : ''} onclick="reqLogPage++; loadReqLog()">Next</button></div>` : '';
}

// New Requisition modal — purpose checkboxes plus a custom text box (§5).
const reqModal = $('#reqModal');
$('#newRequisition')?.addEventListener('click', () => {
  $('#reqForm')?.reset();
  $('#reqPurposeCustom')?.classList.add('hidden');
  showDialog(reqModal);
});
document.addEventListener('change', (e) => {
  if (e.target.name === 'reqPurpose' && e.target.value === 'Other') {
    $('#reqPurposeCustom')?.classList.remove('hidden');
  }
});
$('#reqForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const purposes = [...form.querySelectorAll('input[name="reqPurpose"]:checked')].map((c) => c.value);
  const custom = (form.querySelector('#reqPurposeCustom')?.value || '').trim();
  let purpose = purposes.filter((p) => p !== 'Other').join(', ');
  if (purposes.includes('Other')) purpose = (purpose ? purpose + ', ' : '') + 'Other' + (custom ? `: ${custom}` : '');
  const f = Object.fromEntries(new FormData(form).entries());
  const res = await fetch('/api/v1/procurement/requisitions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: f.title, department: f.department, purpose: purpose || null,
      description: f.description, estimated_cost: f.estimated_cost,
      priority: f.priority, needed_by: f.needed_by || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Unable to submit requisition.'); return; }
  closeDialog(reqModal);
  form.reset();
  invLoaded.requisitions = false;
  loadInvRequisitions();
});

// Approve / Reject controls — rendered only for Admins; the API enforces
// the exclusive authority server-side (403 for non-Admin status changes).
async function loadInvApprovals() {
  const res = await api('procurement/requisitions');
  const pending = (res.requisitions || []).filter(r => !['Approved', 'Rejected', 'Closed', 'Cancelled', 'Ordered', 'Completed'].includes(r.status));
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const isManager = currentUserRole === 'Manager';
  const el = $('#invApprovalsTable');
  if (!el) return;
  el.innerHTML = pending.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Req #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Department</th><th class="text-left p-4">Est. Cost</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Status</th><th class="text-left p-4">Requested</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${pending.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.req_number)}</td><td class="p-4 font-medium">${escapeHTML(r.title)}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(r.department || '—')}</td><td class="p-4 font-mono">${r.estimated_cost != null ? money(r.estimated_cost) : '—'}</td>
    <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td>
    <td class="p-4">${reqStatusBadge(r.status)}</td>
    <td class="p-4 text-on-surface-variant">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
    <td class="p-4 whitespace-nowrap">${(isAdmin || isManager)
      ? `<button type="button" title="Approve" aria-label="Approve requisition" class="action-btn !px-2 text-emerald-600" data-req-action="approve" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">check_circle</span></button>` +
        (isAdmin ? ` <button type="button" title="Reject" aria-label="Reject requisition" class="action-btn !px-2 text-red-600" data-req-action="reject" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">cancel</span></button>` : '')
      : '<span class="text-xs text-on-surface-variant">Manager review required</span>'}</td></tr>`).join('')}</tbody></table>`
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
  const ok = await (window.scimConfirm ? scimConfirm({
    title: `${status === 'Rejected' ? 'Reject' : 'Approve'} requisition?`,
    message: `This marks the request as ${status} and records the decision in the activity log.`,
    confirmLabel: status === 'Rejected' ? 'Reject' : 'Approve', icon: status === 'Rejected' ? 'cancel' : 'check_circle', danger: status === 'Rejected',
  }) : Promise.resolve(true));
  if (!ok) return;
  const res = await fetch(`/api/v1/procurement/requisitions/${encodeURIComponent(btn.dataset.reqId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || `Unable to ${status.toLowerCase()} requisition.`); return; }
  invLoaded.approvals = false; invLoaded.requisitions = false; invLoaded.reqlog = false;
  loadInvApprovals(); loadInvRequisitions();
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

let invHistPage = 1;
const INV_HIST_PAGE = 20;
async function loadInvHistory() {
  const res = await api('inventory/transactions');
  let tx = res.transactions || [];
  const days = parseInt($('#invHistRange')?.value || '0', 10);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  if (cutoff) tx = tx.filter(t => t.created_at && new Date(t.created_at).getTime() >= cutoff);
  const pages = Math.max(1, Math.ceil(tx.length / INV_HIST_PAGE));
  if (invHistPage > pages) invHistPage = pages;
  const slice = tx.slice((invHistPage - 1) * INV_HIST_PAGE, invHistPage * INV_HIST_PAGE);
  $('#invHistoryList').innerHTML = slice.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Timestamp</th><th class="text-left p-4">Asset</th><th class="text-left p-4">Transaction</th><th class="text-left p-4">Zone / Location</th></tr></thead>
    <tbody>${slice.map(t => `<tr class="border-b border-slate-50"><td class="p-4 text-on-surface-variant text-xs">${new Date(t.created_at).toLocaleString()}</td>
    <td class="p-4"><span class="font-mono text-xs">${escapeHTML(t.qr_code || '—')}</span><div class="text-xs text-on-surface-variant">${escapeHTML(t.asset_name || '')}</div></td>
    <td class="p-4"><span class="px-2 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700">${escapeHTML(t.action || '—')}</span></td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(t.zone || '—')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="text-sm text-on-surface-variant text-center py-8">No transaction history.</div>';
  const pager = $('#invHistPager');
  if (pager) pager.innerHTML = tx.length ? `<span class="text-xs text-slate-500">${tx.length} events · page ${invHistPage} of ${pages}</span>
    <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${invHistPage <= 1 ? 'disabled' : ''} onclick="invHistPage--; loadInvHistory()">Prev</button>
    <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${invHistPage >= pages ? 'disabled' : ''} onclick="invHistPage++; loadInvHistory()">Next</button></div>` : '';
}

// Archives moved to the standalone archives.html page (sidebar link, Admin).
// The Trash Bin tab was removed — soft-deleted rows still obey the server-side
// retention window and can be restored via the Archives page.

const invTabLoaders = {
  ledger: loadInventoryData,
  adjustments: loadAdjustments,
  requisitions: loadInvRequisitions,
  approvals: loadInvApprovals,
  valuation: loadValuation,
  history: loadInvHistory,
  reqlog: loadReqLog,
};

// Real-time sync (§4): the ledger refreshes itself while the tab is open so
// scan commits land without a manual page refresh.
setInterval(() => {
  if (document.querySelector('.hub-section.active[data-tab="ledger"]')) loadInventoryData(false);
}, 30000);

window.refreshInvTab = (name) => { invLoaded[name] = false; if (invTabLoaders[name]) return invTabLoaders[name](); };

document.addEventListener('hub:tab', (e) => {
  const name = e.detail.tab;
  if (name === 'ledger') return; // ledger hydrates on DOMContentLoaded
  if (!invLoaded[name] && invTabLoaders[name]) { invLoaded[name] = true; invTabLoaders[name](); }
});

if (window.initHubTabs) initHubTabs('ledger');
