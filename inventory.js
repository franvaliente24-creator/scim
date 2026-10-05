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
      const opts = [];
      zones.forEach((z) => {
        opts.push(`<option value="${z.zone}">${z.category || ''}</option>`);
        (z.rows || []).forEach((r) => {
          opts.push(`<option value="${z.zone}-${r.row}">Zone ${z.zone} · Row ${r.row}</option>`);
        });
      });
      zl.innerHTML = opts.join('');
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
  const cls = ['Approved', 'Completed', 'Inventory Approved', 'Issued'].includes(s) ? 'bg-emerald-100 text-emerald-700'
    : s === 'Rejected' || s === 'Cancelled' ? 'bg-red-100 text-red-700'
    : s === 'Ordered' || s === 'Closed' || s === 'In Procurement' ? 'bg-blue-100 text-blue-700'
    : s === 'Inventory Review' ? 'bg-indigo-100 text-indigo-700'
    : s === 'Partially Issued' ? 'bg-purple-100 text-purple-700'
    : 'bg-amber-100 text-amber-700';
  return `<span class="px-2 py-1 rounded text-xs font-semibold ${cls}">${escapeHTML(s || 'Submitted')}</span>`;
}

// §5: internal supply requests — departments request items already held in
// company inventory. The request is itemized; approval routes to inventory
// review, then issuance (stock available) or procurement (stock short).
// Decided/fulfilled requests flow to the Requisition Log tab.
let invReqPage = 1;
const INV_REQ_PAGE = 10;
const SR_OPEN = ['Submitted', 'Approved', 'Inventory Review', 'In Procurement', 'Partially Issued'];
const SR_DONE = ['Issued', 'Closed', 'Rejected', 'Cancelled'];
async function loadInvRequisitions() {
  const res = await api('supply-requests').catch(() => ({}));
  const reqs = (res.requests || []).filter(r => SR_OPEN.includes(r.status));
  const search = $('#invReqSearch');
  const rangeSel = $('#invReqRange');
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const canReview = isAdmin || currentUserRole === 'Manager';
  const canIssue = canReview || currentUserRole === 'WarehouseStaff';
  const icon = (cls, glyph, title, action, id) =>
    `<button type="button" title="${title}" aria-label="${title}" class="action-btn ${cls} !px-2" data-sr-action="${action}" data-sr-id="${id}"><span class="material-symbols-outlined text-base">${glyph}</span></button>`;
  const actions = (r) => {
    const b = [];
    if (r.status === 'Submitted' && canReview) {
      if (isAdmin) b.push(icon('text-emerald-600', 'check_circle', 'Approve request', 'approve', r.id));
      if (isAdmin) b.push(icon('text-red-600', 'cancel', 'Reject request', 'reject', r.id));
    }
    if (r.status === 'Approved' && canReview) b.push(icon('text-indigo-600', 'inventory', 'Review stock levels', 'review', r.id));
    if (r.status === 'Inventory Review' && canReview) {
      b.push(icon('text-emerald-600', 'output', 'Stock sufficient — issue items', 'issue', r.id));
      b.push(icon('text-amber-600', 'shopping_cart', 'Stock insufficient — send to procurement', 'procure', r.id));
    }
    if ((r.status === 'Approved' || r.status === 'Partially Issued') && canIssue && r.status !== 'Inventory Review') b.push(icon('text-emerald-600', 'output', 'Issue stock', 'issue', r.id));
    if (r.status === 'In Procurement') b.push('<span class="text-xs text-amber-600 font-semibold">Awaiting delivery</span>');
    return b.join(' ') || '<span class="text-xs text-on-surface-variant">—</span>';
  };
  const render = () => {
    const q = (search?.value || '').toLowerCase().trim();
    const days = parseInt(rangeSel?.value || '0', 10);
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    const filtered = reqs.filter(r =>
      (!q || [r.request_number, r.title, r.status, r.department, r.requesting_employee].some(v => (v || '').toLowerCase().includes(q)))
      && (!cutoff || (r.created_at && new Date(r.created_at).getTime() >= cutoff)));
    const pages = Math.max(1, Math.ceil(filtered.length / INV_REQ_PAGE));
    if (invReqPage > pages) invReqPage = pages;
    const slice = filtered.slice((invReqPage - 1) * INV_REQ_PAGE, invReqPage * INV_REQ_PAGE);
    const tbl = $('#invRequisitionsTable');
    if (!tbl) return;
    tbl.innerHTML = slice.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
      <th class="text-left p-4">Request #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Items</th><th class="text-left p-4">Department</th><th class="text-left p-4">Requester</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Status</th><th class="text-left p-4">Actions</th></tr></thead>
      <tbody>${slice.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.request_number)}</td>
      <td class="p-4 font-medium">${escapeHTML(r.title)}<div class="text-xs text-on-surface-variant">${escapeHTML(r.purpose || '')}</div></td>
      <td class="p-4 text-xs text-on-surface-variant">${(r.items || []).map(i => `${escapeHTML(i.item_name)} ×${i.quantity}`).join(', ') || '—'}</td>
      <td class="p-4 text-on-surface-variant">${escapeHTML(r.department || '—')}</td>
      <td class="p-4 text-on-surface-variant">${escapeHTML(r.requesting_employee || r.created_by_name || '—')}</td>
      <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td><td class="p-4">${reqStatusBadge(r.status)}</td>
      <td class="p-4 whitespace-nowrap">${actions(r)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="p-10 text-center text-on-surface-variant text-sm">No open supply requests — submit one with "New Requisition".</div>';
    const pager = $('#invReqPager');
    if (pager) pager.innerHTML = filtered.length ? `<span class="text-xs text-slate-500">${filtered.length} requests · page ${invReqPage} of ${pages}</span>
      <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${invReqPage <= 1 ? 'disabled' : ''} onclick="invReqPage--; document.dispatchEvent(new CustomEvent('inv:req-render'))">Prev</button>
      <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${invReqPage >= pages ? 'disabled' : ''} onclick="invReqPage++; document.dispatchEvent(new CustomEvent('inv:req-render'))">Next</button></div>` : '';
  };
  if (search && !search.dataset.bound) { search.dataset.bound = '1'; search.addEventListener('input', () => { invReqPage = 1; render(); }); }
  if (rangeSel && !rangeSel.dataset.bound) { rangeSel.dataset.bound = '1'; rangeSel.addEventListener('change', () => { invReqPage = 1; render(); }); }
  if (!document._invReqRenderBound) { document._invReqRenderBound = true; document.addEventListener('inv:req-render', render); }
  render();
}

// Requisition Log: fulfilled/decided supply requests merged with legacy
// requisition records so no history is lost during the convergence period.
let reqLogPage = 1;
const REQ_LOG_PAGE = 15;
async function loadReqLog() {
  const [srRes, legRes] = await Promise.all([api('supply-requests').catch(() => ({})), api('procurement/requisitions').catch(() => ({}))]);
  const rows = [
    ...(srRes.requests || []).filter(r => SR_DONE.includes(r.status)).map(r => ({
      num: r.request_number, label: r.title, who: r.requesting_employee || r.created_by_name,
      items: (r.items || []).map(i => `${i.item_name} ×${i.quantity}`).join(', '),
      status: r.status, at: r.updated_at || r.created_at })),
    ...(legRes.requisitions || []).filter(r => ['Approved', 'Rejected', 'Closed', 'Cancelled', 'Ordered', 'Completed'].includes(r.status)).map(r => ({
      num: r.req_number, label: r.purpose || r.title, who: r.created_by_name,
      items: 'legacy record', status: r.status, at: r.created_at })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  const rangeSel = $('#reqLogRange');
  const days = parseInt(rangeSel?.value || '0', 10);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const filtered = rows.filter(r => !cutoff || (r.at && new Date(r.at).getTime() >= cutoff));
  const pages = Math.max(1, Math.ceil(filtered.length / REQ_LOG_PAGE));
  if (reqLogPage > pages) reqLogPage = pages;
  const slice = filtered.slice((reqLogPage - 1) * REQ_LOG_PAGE, reqLogPage * REQ_LOG_PAGE);
  const el = $('#reqLogTable');
  if (!el) return;
  el.innerHTML = slice.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Request #</th><th class="text-left p-4">Request</th><th class="text-left p-4">Items</th><th class="text-left p-4">Requested By</th><th class="text-left p-4">Status</th><th class="text-left p-4">Decided</th></tr></thead>
    <tbody>${slice.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.num)}</td>
    <td class="p-4 font-medium">${escapeHTML(r.label || '—')}</td>
    <td class="p-4 text-xs text-on-surface-variant">${escapeHTML(r.items || '—')}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(r.who || '—')}</td>
    <td class="p-4">${reqStatusBadge(r.status)}</td>
    <td class="p-4 text-on-surface-variant text-xs">${r.at ? new Date(r.at).toLocaleString() : '—'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No decided requests yet — issued and rejected requests land here.</div>';
  const pager = $('#reqLogPager');
  if (pager) pager.innerHTML = filtered.length ? `<span class="text-xs text-slate-500">${filtered.length} records · page ${reqLogPage} of ${pages}</span>
    <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${reqLogPage <= 1 ? 'disabled' : ''} onclick="reqLogPage--; loadReqLog()">Prev</button>
    <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${reqLogPage >= pages ? 'disabled' : ''} onclick="reqLogPage++; loadReqLog()">Next</button></div>` : '';
}

// New supply-request modal — itemized rows + purpose checkboxes.
const reqModal = $('#reqModal');
$('#newRequisition')?.addEventListener('click', () => {
  $('#reqForm')?.reset();
  $('#reqPurposeCustom')?.classList.add('hidden');
  const itemsBody = $('#reqItemsBody');
  if (itemsBody) itemsBody.querySelectorAll('.req-item-row:not(:first-child)').forEach(r => r.remove());
  showDialog(reqModal);
});
document.addEventListener('change', (e) => {
  if (e.target.name === 'reqPurpose' && e.target.value === 'Other') {
    $('#reqPurposeCustom')?.classList.remove('hidden');
  }
});
$('#reqAddItem')?.addEventListener('click', () => {
  const body = $('#reqItemsBody');
  if (!body) return;
  const row = body.querySelector('.req-item-row').cloneNode(true);
  row.querySelector('input[name="req_item_name"]').value = '';
  row.querySelector('input[name="req_item_qty"]').value = 1;
  body.appendChild(row);
});
document.addEventListener('click', (e) => {
  const del = e.target.closest('.req-item-del');
  if (!del) return;
  const rows = document.querySelectorAll('#reqItemsBody .req-item-row');
  if (rows.length > 1) del.closest('.req-item-row').remove();
});
$('#reqForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const purposes = [...form.querySelectorAll('input[name="reqPurpose"]:checked')].map((c) => c.value);
  const custom = (form.querySelector('#reqPurposeCustom')?.value || '').trim();
  let purpose = purposes.filter((p) => p !== 'Other').join(', ');
  if (purposes.includes('Other')) purpose = (purpose ? purpose + ', ' : '') + 'Other' + (custom ? `: ${custom}` : '');
  const items = [...form.querySelectorAll('.req-item-row')].map((row) => ({
    item_name: row.querySelector('input[name="req_item_name"]').value.trim(),
    quantity: parseInt(row.querySelector('input[name="req_item_qty"]').value, 10) || 1,
  })).filter((i) => i.item_name !== '');
  if (!items.length) { alert('Add at least one item to the request.'); return; }
  const f = Object.fromEntries(new FormData(form).entries());
  const res = await fetch('/api/v1/supply-requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: f.title, department: f.department, purpose: purpose || null,
      requesting_employee: f.requesting_employee || null,
      priority: f.priority, needed_by: f.needed_by || null, items,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Unable to submit request.'); return; }
  closeDialog(reqModal);
  form.reset();
  invLoaded.requisitions = false;
  loadInvRequisitions();
});

// Approvals tab: supply requests awaiting an Admin decision.
async function loadInvApprovals() {
  const res = await api('supply-requests').catch(() => ({}));
  const pending = (res.requests || []).filter(r => r.status === 'Submitted');
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const el = $('#invApprovalsTable');
  if (!el) return;
  el.innerHTML = pending.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Req #</th><th class="text-left p-4">Title</th><th class="text-left p-4">Items</th><th class="text-left p-4">Department</th><th class="text-left p-4">Requester</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Requested</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${pending.map(r => `<tr class="border-b border-slate-50"><td class="p-4 font-mono text-xs">${escapeHTML(r.request_number)}</td><td class="p-4 font-medium">${escapeHTML(r.title)}</td>
    <td class="p-4 text-xs text-on-surface-variant">${(r.items || []).map(i => `${escapeHTML(i.item_name)} ×${i.quantity}`).join(', ') || '—'}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(r.department || '—')}</td>
    <td class="p-4 text-on-surface-variant">${escapeHTML(r.requesting_employee || '—')}</td>
    <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td>
    <td class="p-4 text-on-surface-variant">${r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
    <td class="p-4 whitespace-nowrap">${isAdmin
      ? `<button type="button" title="Approve" aria-label="Approve request" class="action-btn !px-2 text-emerald-600" data-sr-action="approve" data-sr-id="${r.id}"><span class="material-symbols-outlined text-base">check_circle</span></button>
         <button type="button" title="Reject" aria-label="Reject request" class="action-btn !px-2 text-red-600" data-sr-action="reject" data-sr-id="${r.id}"><span class="material-symbols-outlined text-base">cancel</span></button>`
      : '<span class="text-xs text-on-surface-variant">Admin review required</span>'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No pending approvals — all requests have been decided.</div>';
}

// Stock-issue modal: pick real warehouse serials for each request line.
async function openIssueModal(requestId) {
  const d = await api(`supply-requests/${requestId}`).catch(() => null);
  if (!d || !d.id) { alert('Could not load the request.'); return; }
  const lines = (d.items || []).filter(i => (i.quantity - i.quantity_issued) > 0);
  if (!lines.length) { alert('All items on this request have already been issued.'); return; }
  $('#issueRequestId').value = d.id;
  $('#issueRequestInfo').innerHTML = `<b>${escapeHTML(d.request_number)}</b> — ${escapeHTML(d.title)}<br><span class="text-xs text-on-surface-variant">For ${escapeHTML(d.requesting_employee || 'staff')} · ${escapeHTML(d.department || '—')}</span>`;
  $('#issueItemsBody').innerHTML = lines.map((i) => `
    <div class="border border-outline-variant/60 rounded-xl p-3" data-req-item="${i.id}" data-item-name="${escapeHTML(i.item_name)}">
      <div class="text-sm font-semibold">${escapeHTML(i.item_name)} <span class="text-xs text-on-surface-variant font-normal">— ${i.quantity - i.quantity_issued} still needed</span></div>
      <input class="issue-serials w-full mt-2 px-3.5 py-2 border border-outline-variant rounded-lg text-sm" placeholder="QR serials, comma-separated (e.g. CHAIR-001, CHAIR-002)">
    </div>`).join('');
  showDialog($('#issueModal'));
}

$('#issueForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const reqId = $('#issueRequestId').value;
  const items = [...document.querySelectorAll('#issueItemsBody [data-req-item]')].map((row) => ({
    request_item_id: parseInt(row.dataset.reqItem, 10),
    serials: (row.querySelector('.issue-serials').value || '').split(',').map((s) => s.trim()).filter(Boolean),
  })).filter((i) => i.serials.length);
  if (!items.length) { alert('Enter at least one serial to issue.'); return; }
  const res = await fetch(`/api/v1/supply-requests/${reqId}/issue`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, notes: $('#issueNotes')?.value || '' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Issuance failed.'); return; }
  closeDialog($('#issueModal'));
  invLoaded.requisitions = false; invLoaded.approvals = false; invLoaded.reqlog = false; invLoaded.assets = false;
  loadInvRequisitions();
  if (data.line_errors && data.line_errors.length) alert(`Issued ${data.issued.length} unit(s) as ${data.issuance_number}.\nSkipped:\n${data.line_errors.join('\n')}`);
});

// Supply-request action dispatcher — all status moves go through the
// server-side state machine.
document.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-sr-action][data-sr-id]');
  if (!btn) return;
  const action = btn.dataset.srAction;
  const id = btn.dataset.srId;
  if (action === 'issue') { openIssueModal(id); return; }
  if (action === 'review') {
    const sc = await api(`supply-requests/${id}/stock-check`).catch(() => null);
    if (!sc || !sc.lines) { alert(sc && sc.error ? sc.error : 'Could not check stock.'); return; }
    alert(sc.lines.map((l) => `${l.item_name}: need ${l.needed}, in stock ${l.in_stock} ${l.sufficient ? '✓' : '✗'}`).join('\n')
      + (sc.sufficient ? '\n\nAll lines are in stock — this request can be issued.' : '\n\nSome lines are short — send this request to procurement.'));
    return;
  }
  const map = {
    approve: { status: 'Approved', label: 'Approve' },
    reject: { status: 'Rejected', label: 'Reject' },
    review_go: { status: 'Inventory Review', label: 'Send to inventory review' },
    procure: { status: 'In Procurement', label: 'Send to procurement' },
  };
  const step = map[action];
  if (!step) return;
  const ok = await (window.scimConfirm ? scimConfirm({
    title: `${step.label} request?`,
    message: action === 'procure' ? 'The request moves to Procurement — raise a PO against it there.' : `This marks the request as ${step.status}.`,
    confirmLabel: step.label, icon: 'check_circle', danger: action === 'reject',
  }) : Promise.resolve(true));
  if (!ok) return;
  const res = await fetch(`/api/v1/supply-requests/${id}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: step.status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || `Unable to ${step.label.toLowerCase()} request.`); return; }
  invLoaded.approvals = false; invLoaded.requisitions = false; invLoaded.reqlog = false;
  loadInvApprovals(); loadInvRequisitions();
});

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
