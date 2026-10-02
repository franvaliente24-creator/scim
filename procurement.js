// ==========================================
// PROCUREMENT & SOURCING MANAGEMENT PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Requisitions relocated to Inventory Management (§5); supplier quotes live
// in Supplier Management. This hub now owns Purchase Orders, PO History,
// and Settlements.

document.getElementById('closeReqStage')?.addEventListener('click', () => $('#reqStageModal')?.close());


// ==========================================
// PURCHASE ORDER MANAGEMENT (merged into procurement hub)
// ==========================================
const setStat = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };


// ==========================================
// PURCHASE ORDER DATA LOADING
// ==========================================
let allPOs = [];
// Date-range filter on the Total Value stat + table (per TRD §5).
function poInRange(po) {
  const from = document.getElementById('poDateFrom')?.value;
  const to = document.getElementById('poDateTo')?.value;
  if (!from && !to) return true;
  const d = new Date(po.created_at);
  if (from && d < new Date(from + 'T00:00:00')) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
}

async function loadPOData() {
  try {
    const response = await api('pos');
    const data = response.pos || response;
    const purchaseOrders = Array.isArray(data) ? data : [];
    allPOs = purchaseOrders;

    const inRange = purchaseOrders.filter(poInRange);
    const totalPOs = purchaseOrders.length;
    const activePipeline = purchaseOrders.filter(po => po.status !== 'Received' && po.status !== 'Cancelled').length;
    const pendingApproval = purchaseOrders.filter(po => po.status === 'Pending Approval').length;
    const totalPOValue = inRange.reduce((sum, po) => sum + (parseFloat(po.total) || 0), 0);

    // Update stats
    setStat('totalPOs', totalPOs);
    setStat('activePipeline', activePipeline);
    setStat('pendingApproval', pendingApproval);
    setStat('totalPOValue', money(totalPOValue));

    // Render PO table
    renderPOTable(purchaseOrders);

    // Render PO history table (static lifecycle record)
    renderPOHistory();

    // Load PO activity log
    loadPOActivityLog();

    // Finance settlement panel
    loadSettlements();
  } catch (error) {
    console.error('Error loading PO data:', error);
  }
}

// Static PO history — date-range filter (day/week/month/year), pagination,
// view + per-row Activity Log drill-down on the right of each row.
let poHistPage = 1;
const PO_HIST_PAGE = 10;

function poHistFiltered() {
  const days = parseInt(document.getElementById('poHistRange')?.value || '0', 10);
  if (!days) return allPOs;
  const cutoff = Date.now() - days * 86400000;
  return allPOs.filter((po) => po.created_at && new Date(po.created_at).getTime() >= cutoff);
}

function renderPOHistory() {
  const el = document.getElementById('poHistoryTable');
  if (!el) return;
  const rows = poHistFiltered();
  const pages = Math.max(1, Math.ceil(rows.length / PO_HIST_PAGE));
  if (poHistPage > pages) poHistPage = pages;
  const slice = rows.slice((poHistPage - 1) * PO_HIST_PAGE, poHistPage * PO_HIST_PAGE);
  el.innerHTML = slice.length ? `<table class="data-table w-full text-sm">
    <thead><tr><th>PO #</th><th>Vendor</th><th>Total</th><th>Status</th><th>Expected</th><th>Created</th><th class="text-right">Actions</th></tr></thead>
    <tbody>${slice.map((po) => `<tr>
      <td><span class="tag">${esc(po.po_number)}</span></td>
      <td><b>${esc(po.vendor_name || po.vendor)}</b></td>
      <td class="font-mono">${money(po.total)}</td>
      <td><span class="tag ${getPOStatusClass(po.status)}">${esc(po.status)}</span></td>
      <td class="text-slate-500 text-xs">${po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '—'}</td>
      <td class="text-slate-500 text-xs">${po.created_at ? new Date(po.created_at).toLocaleDateString() : '—'}</td>
      <td class="whitespace-nowrap text-right">
        <button class="action-btn action-btn-view !px-2" title="View order" aria-label="View order" onclick="viewPO('${po.id}')"><span class="material-symbols-outlined text-base">visibility</span></button>
        <button class="action-btn action-btn-view !px-2" title="Activity log" aria-label="Activity log" onclick="viewPOLog('${esc(po.po_number)}')"><span class="material-symbols-outlined text-base">history</span></button>
      </td>
    </tr>`).join('')}</tbody></table>`
    : '<p class="text-sm text-slate-400 py-6 text-center">No purchase orders in this date range.</p>';
  el.insertAdjacentHTML('beforeend', `<div class="flex items-center justify-between px-4 py-3 border-t border-slate-100">
    <span class="text-xs text-slate-500">${rows.length} orders · page ${poHistPage} of ${pages}</span>
    <div class="flex gap-2">
      <button class="btn-outline text-xs" onclick="poHistPageGo(${poHistPage - 1})" ${poHistPage <= 1 ? 'disabled' : ''}>Prev</button>
      <button class="btn-outline text-xs" onclick="poHistPageGo(${poHistPage + 1})" ${poHistPage >= pages ? 'disabled' : ''}>Next</button>
    </div></div>`);
}

window.poHistPageGo = (p) => { poHistPage = Math.max(1, p); renderPOHistory(); };
document.getElementById('poHistRange')?.addEventListener('change', () => { poHistPage = 1; renderPOHistory(); });

// Per-PO activity drill-down — filters the shared feed to one order.
window.viewPOLog = async (poNumber) => {
  const body = document.getElementById('reqStageBody');
  if (!body) return;
  document.getElementById('reqStageTitle').textContent = `Activity — ${poNumber}`;
  body.innerHTML = '<p class="text-sm text-slate-400 py-4">Loading activity…</p>';
  document.getElementById('reqStageModal')?.showModal();
  try {
    const res = await api('pos/activity');
    const all = res.activities || res || [];
    const rows = all.filter((a) => a.po_number === poNumber);
    body.innerHTML = rows.length ? rows.map((a) => `
      <div class="row"><div><b>${esc(a.action)}</b><br><small>${esc(a.details || '')}</small></div>
      <small>${a.created_at ? new Date(a.created_at).toLocaleString() : ''}</small></div>`).join('')
      : '<p class="text-sm text-slate-400 py-6 text-center">No activity recorded for this order.</p>';
  } catch { body.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load activity.</p>'; }
};

function renderPOTable(purchaseOrders) {
  const el = $('#poTable');
  if (!el) return;
  if (!purchaseOrders.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No purchase orders yet.</p>';
    return;
  }
  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>PO Number</th>
          <th>Vendor</th>
          <th>Total</th>
          <th>Status</th>
          <th>Expected Delivery</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${purchaseOrders.map(po => `
          <tr>
            <td><span class="tag">${po.po_number}</span></td>
            <td><b>${po.vendor_name || po.vendor}</b></td>
            <td>${money(po.total)}</td>
            <td><span class="tag ${getPOStatusClass(po.status)}">${po.status}</span></td>
            <td>${po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : 'N/A'}</td>
            <td class="whitespace-nowrap">
              <button class="action-btn action-btn-view !px-2" title="View order" aria-label="View order" onclick="viewPO('${po.id}')"><span class="material-symbols-outlined text-base">visibility</span></button>
              <button class="action-btn action-btn-view !px-2" title="Order tracking timeline" aria-label="Order tracking timeline" data-po-timeline="${po.id}"><span class="material-symbols-outlined text-base">route</span></button>
              ${getPOActionButtons(po)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.innerHTML = tableHTML;
}

// Icon-only workflow actions (TRD §8). Approve/reject render for Admins
// only — the API enforces the same exclusive authority server-side.
function getPOActionButtons(po) {
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const icon = (cls, glyph, title, fn) =>
    `<button class="action-btn ${cls} !px-2" title="${title}" aria-label="${title}" onclick="${fn}"><span class="material-symbols-outlined text-base">${glyph}</span></button>`;
  const buttons = [];
  switch (po.status) {
    case 'Draft':
      buttons.push(icon('action-btn-primary', 'send', 'Submit for approval', `submitForApproval('${po.id}')`));
      break;
    case 'Pending Approval':
      if (isAdmin) {
        buttons.push(icon('action-btn-approve', 'check_circle', 'Approve order', `approvePO('${po.id}')`));
        buttons.push(icon('action-btn-danger', 'cancel', 'Reject order', `rejectPO('${po.id}', '${po.po_number}')`));
      }
      break;
    case 'Sent to Vendor':
    case 'Shipped':
    case 'Arrived':
      // "Order Received" — the shipped-step was removed per spec; goods move
      // straight to the receipt workflow which logs items + generates QR serials.
      buttons.push(icon('action-btn-approve', 'inventory_2', 'Order received — record receipt', `receivePO('${po.id}', '${po.po_number}')`));
      break;
    case 'Received':
      buttons.push(icon('action-btn-primary', 'qr_code_2', 'Show receiving QR', `showPOQR('${po.id}', '${po.po_number}')`));
      break;
    default:
      buttons.push(icon('action-btn-edit', 'edit', 'Update status', `updatePOStatus('${po.id}', '${po.status}')`));
  }
  return buttons.join('');
}

function getPOStatusClass(status) {
  switch (status) {
    case 'Draft':
      return 'status-draft';
    case 'Pending Approval':
      return 'status-pending';
    case 'Sent to Vendor':
      return 'status-sent';
    case 'Shipped':
    case 'Arrived':
      return 'status-shipped';
    case 'Received':
      return 'status-received';
    case 'Cancelled':
      return 'status-cancelled';
    default:
      return 'status-default';
  }
}

// Inline order-tracking timeline (expandable row under each PO) — the
// standalone tracking card was removed; tracking lives in the action column.
const PO_STAGES = ['Draft', 'Pending Approval', 'Sent to Vendor', 'Received'];
function poStageIndex(status) {
  if (status === 'Approved') return 2;
  if (status === 'Arrived') return 3; // arrived counts as in-receipt
  const i = PO_STAGES.indexOf(status);
  return i === -1 ? 0 : i;
}
function poTimelineHTML(po) {
  const idx = poStageIndex(po.status);
  const dead = po.status === 'Rejected' || po.status === 'Cancelled';
  const steps = PO_STAGES.map((s, i) => {
    const state = dead ? 'idle' : i < idx ? 'done' : i === idx ? 'current' : 'idle';
    const dot = state === 'done' ? 'bg-emerald-500 text-white' : state === 'current' ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-slate-200 text-slate-400';
    const lbl = state === 'idle' ? 'text-slate-400' : 'text-on-surface font-semibold';
    return `<div class="flex flex-col items-center gap-1 min-w-0 flex-1">
      <span class="w-6 h-6 rounded-full ${dot} flex items-center justify-center text-[10px] font-bold">${state === 'done' ? '✓' : i + 1}</span>
      <span class="text-[10px] ${lbl} text-center leading-tight">${s}</span></div>`;
  }).join('<div class="flex-1 h-px bg-slate-200 mt-3 shrink-0" style="min-width:8px"></div>');
  return `<div class="px-4 py-3">${dead ? `<p class="text-xs text-red-600 font-semibold mb-2">${po.status}</p>` : ''}<div class="flex items-start">${steps}</div></div>`;
}

document.addEventListener('click', (event) => {
  const tBtn = event.target.closest('[data-po-timeline]');
  if (!tBtn) return;
  const tr = tBtn.closest('tr');
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('po-timeline-row')) { next.remove(); return; }
  const po = allPOs.find((p) => String(p.id) === String(tBtn.dataset.poTimeline));
  if (!po) return;
  const row = document.createElement('tr');
  row.className = 'po-timeline-row bg-slate-50/70';
  row.innerHTML = `<td colspan="6">${poTimelineHTML(po)}</td>`;
  tr.after(row);
});

async function loadPOActivityLog() {
  const el = $('#poActivityLog');
  if (!el) return;
  try {
    const response = await api('pos/activity');
    const data = response.activities || response;
    const activities = Array.isArray(data) ? data : [];

    const activityLogHTML = activities.map(activity => `
      <div class="row">
        <div>
          <b>${activity.action}</b><br>
          <small>${activity.po_number} · ${activity.details}</small>
        </div>
        <small>${new Date(activity.created_at).toLocaleString()}</small>
      </div>
    `).join('');

    el.innerHTML = activityLogHTML || '<p class="muted">No activity recorded yet</p>';
  } catch (error) {
    console.error('Error loading PO activity log:', error);
  }
}



// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Create PO Button - open in-page modal
const createPOBtn = $('#createPO');
let vendorListCache = null;
async function populatePOVendors() {
  const sel = document.getElementById('poVendorSelect');
  if (!sel) return;
  if (!vendorListCache) {
    try { const res = await api('vendors'); vendorListCache = res.vendors || res.items || res || []; }
    catch { vendorListCache = []; }
  }
  const opts = Array.isArray(vendorListCache) ? vendorListCache : [];
  sel.innerHTML = '<option value="">Select a vendor…</option>' +
    opts.map((v) => `<option value="${esc(v.id)}">${esc(v.name || v.vendor_name || 'Vendor #' + v.id)}${v.status === 'Inactive' ? ' (inactive)' : ''}</option>`).join('');
}
if (createPOBtn) {
  createPOBtn.onclick = () => {
    const modal = $('#createPOModal');
    populatePOVendors();
    if (modal) {
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', 'open');
    }
  };
}

const closeCreatePO = $('#closeCreatePO');
if (closeCreatePO) {
  closeCreatePO.onclick = () => {
    const modal = $('#createPOModal');
    if (modal) {
      if (typeof modal.close === 'function') modal.close();
      else modal.removeAttribute('open');
    }
  };
}

const createPOForm = $('#createPOForm');
if (createPOForm) {
  createPOForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const response = await fetch('/api/v1/pos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData)),
    });

    if (response.ok) {
      $('#createPOModal').close();
      e.target.reset();
      loadPOData();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to create purchase order');
    }
  };
}

// Add PO Button - open in-page modal
const addPOBtn = $('#addPOBtn');
if (addPOBtn) {
  addPOBtn.onclick = () => {
    const modal = $('#createPOModal');
    if (modal) {
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', 'open');
    }
  };
}

// Update Status Modal
const statusModal = $('#updateStatusModal');
const closeStatusBtn = $('#closeStatus');
if (closeStatusBtn) closeStatusBtn.onclick = () => statusModal?.close?.();

const updateStatusForm = $('#updateStatusForm');
if (updateStatusForm) updateStatusForm.onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const response = await fetch(`/api/v1/pos/${data.po_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: data.status, notes: data.notes }),
  });

  if (response.ok) {
    statusModal?.close?.();
    loadPOData();
  } else {
    alert('Failed to update PO status');
  }
};

// Reject PO Modal
const rejectModal = $('#rejectPOModal');
const closeRejectBtn = $('#closeReject');
if (closeRejectBtn) closeRejectBtn.onclick = () => rejectModal?.close?.();

const rejectPOForm = $('#rejectPOForm');
if (rejectPOForm) rejectPOForm.onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const response = await fetch(`/api/v1/pos/${data.po_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Cancelled', notes: `Rejected: ${data.reason}` }),
  });

  if (response.ok) {
    rejectModal?.close?.();
    e.target.reset();
    loadPOData();
  } else {
    alert('Failed to reject PO');
  }
};

// Receive PO Modal ("Order Received" — the shipped step was removed per spec)
const receiveModal = $('#receiveModal');
const closeReceiveBtn = $('#closeReceive');
if (closeReceiveBtn) closeReceiveBtn.onclick = () => receiveModal?.close?.();

const receiveForm = $('#receiveForm');
if (receiveForm) receiveForm.onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const notes = `Items received: ${data.items_received}. Condition: ${data.condition}. ${data.notes || ''}`;

  const response = await fetch(`/api/v1/pos/${data.po_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Received', notes: notes }),
  });

  if (response.ok) {
    receiveModal?.close?.();
    e.target.reset();
    loadPOData();

    // Show the receiving QR on-screen — no download step.
    showPOQR(data.po_id, $('#receivePoNumber')?.value || '');
  } else {
    alert('Failed to receive PO');
  }
};

// Search + status filter (client-side)
const poSearch = $('#poSearch');
const poStatusFilter = $('#statusFilter');
function applyPOFilters() {
  const term = (poSearch?.value || '').toLowerCase();
  const status = poStatusFilter?.value || '';
  document.querySelectorAll('#poTable tbody tr').forEach((row) => {
    const text = row.textContent.toLowerCase();
    const rowStatus = row.querySelector('.tag:last-child')?.textContent?.trim() || '';
    const matchesTerm = !term || text.includes(term);
    const matchesStatus = !status || text.includes(status.toLowerCase());
    row.style.display = (matchesTerm && matchesStatus) ? '' : 'none';
  });
}
if (poSearch) poSearch.oninput = applyPOFilters;
if (poStatusFilter) poStatusFilter.onchange = applyPOFilters;

// PO action functions
window.viewPO = async (poId) => {
  try {
    const response = await api(`pos/${poId}`);
    const po = response.po;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('viewPONumber', po.po_number || '');
    set('viewPOVendor', po.vendor_name || po.vendor || '—');
    set('viewPOTotal', money(po.total));
    set('viewPOCreated', po.created_at ? new Date(po.created_at).toLocaleDateString() : '—');
    set('viewPODelivery', po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '—');
    set('viewPOItems', po.items || 'No line items recorded.');
    const st = document.getElementById('viewPOStatus');
    if (st) st.innerHTML = `<span class="tag ${getPOStatusClass(po.status)}">${po.status || ''}</span>`;
    document.getElementById('viewPOModal')?.showModal();
  } catch (error) {
    console.error('Error viewing PO:', error);
  }
};

document.getElementById('closeViewPOModal')?.addEventListener('click', () => {
  document.getElementById('viewPOModal')?.close();
});

window.updatePOStatus = (poId, currentStatus) => {
  $('#poIdInput').value = poId;
  $('#currentStatus').value = currentStatus;
  $('#updateStatusModal').showModal();
};

const confirmStep = (opts) => window.scimConfirm ? scimConfirm(opts) : Promise.resolve(true);

window.submitForApproval = async (poId) => {
  const ok = await confirmStep({
    title: 'Submit for Approval?',
    message: 'This purchase order will move to Pending Approval and can no longer be edited until reviewed.',
    confirmLabel: 'Submit', icon: 'send', danger: false,
  });
  if (!ok) return;
  const response = await fetch(`/api/v1/pos/${poId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Pending Approval', notes: 'Submitted for approval' }),
  });

  if (response.ok) {
    loadPOData();
  } else {
    alert('Failed to submit for approval');
  }
};

window.approvePO = async (poId) => {
  const ok = await confirmStep({
    title: 'Approve Purchase Order?',
    message: 'Approving sends this PO to the vendor and commits the spend. Continue?',
    confirmLabel: 'Approve', icon: 'check_circle', danger: false,
  });
  if (!ok) return;
  const response = await fetch(`/api/v1/pos/${poId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Sent to Vendor', notes: 'Approved and sent to vendor' }),
  });

  if (response.ok) {
    loadPOData();
  } else {
    alert('Failed to approve PO');
  }
};

window.rejectPO = (poId, poNumber) => {
  $('#rejectPoIdInput').value = poId;
  $('#rejectPoNumber').value = poNumber;
  $('#rejectPOModal').showModal();
};

window.receivePO = (poId, poNumber) => {
  $('#receivePoIdInput').value = poId;
  $('#receivePoNumber').value = poNumber;
  $('#receiveModal').showModal();
};

// Receiving QR shown on-screen — no file download. The code encodes the PO
// number so warehouse staff can scan it in PO Receipt mode to verify the
// shipment (or type the number manually).
window.showPOQR = (poId, poNumber) => {
  const modal = $('#poQrModal');
  const canvas = $('#poQrCanvas');
  const label = $('#poQrNumber');
  if (!modal || !canvas) return;
  if (label) label.textContent = poNumber;
  if (typeof QRious !== 'undefined') {
    new QRious({ element: canvas, value: poNumber, size: 200 });
  }
  modal.showModal();
};
$('#closePoQr')?.addEventListener('click', () => $('#poQrModal')?.close());


// ==========================================
// PROCUREMENT COST SETTLEMENT (outbound → AP)
// ==========================================

async function loadSettlements() {
  const el = $('#settlementList');
  if (!el) return;
  const res = await fetch('/api/v1/finance-settlements');
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    el.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">No settlements yet — verified orders are forwarded here automatically.</p>';
    return;
  }
  el.innerHTML = `
    <table class="w-full text-sm min-w-[560px]">
      <thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">PO</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Vendor</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Amount</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Verified</th>
        <th class="py-2 font-medium text-slate-600">Status</th>
      </tr></thead>
      <tbody>${items.map((s) => `
        <tr class="border-b border-slate-100">
          <td class="py-2.5 pr-4 font-semibold text-slate-900">${s.po_number}</td>
          <td class="py-2.5 pr-4 text-slate-600">${s.vendor_name || ''}</td>
          <td class="py-2.5 pr-4 text-slate-900 font-medium">${money(parseFloat(s.amount) || 0)}</td>
          <td class="py-2.5 pr-4 text-slate-500 text-xs">${s.verification_timestamp ? new Date(s.verification_timestamp).toLocaleString() : ''}</td>
          <td class="py-2.5"><span class="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">${s.status}</span></td>
        </tr>`).join('')}</tbody>
    </table>`;
}

// Load PO data on page load
document.addEventListener("DOMContentLoaded", function() {
    // Initialize permissions
    if (typeof initializePermissions === "function") {
        initializePermissions();
    }

    // Load PO data
    loadPOData();
});


// ==========================================
// PROCUREMENT HUB TABS
// ==========================================

// PO date-range filter recomputes the Total Value stat live.
['poDateFrom', 'poDateTo'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.onchange = () => {
    const v = allPOs.filter(poInRange).reduce((s, po) => s + (parseFloat(po.total) || 0), 0);
    setStat('totalPOValue', money(v));
  };
});

document.addEventListener('hub:tab', (e) => {
  const name = e.detail.tab;
  // Orders/History/Settlements re-sync on every activation.
  if (['orders', 'history', 'settlement'].includes(name)) loadPOData();
});

if (window.initHubTabs) initHubTabs('orders');
