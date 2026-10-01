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

// ==========================================
// PROCUREMENT DATA LOADING
// ==========================================
let allRequisitions = [];

async function loadProcurementData(showAll = false) {
  const table = $('#requisitionsTable');
  if (table && !showAll) table.innerHTML = '<p class="text-sm text-slate-400 py-4">Loading requisitions...</p>';
  try {
    const response = await api('procurement/requisitions');
    const requisitions = Array.isArray(response.requisitions) ? response.requisitions : [];
    allRequisitions = requisitions;
    const term = ($('#requisitionSearch')?.value || '').toLowerCase();
    const filtered = term
      ? requisitions.filter((r) => `${r.req_number} ${r.title} ${r.department} ${r.status}`.toLowerCase().includes(term))
      : requisitions;
    const displayRequisitions = showAll ? filtered : filtered.slice(0, 10);

    const active = requisitions.filter((r) => !['Completed', 'Cancelled', 'Closed', 'Rejected'].includes(r.status)).length;
    const pending = requisitions.filter((r) => ['Submitted', 'Pending', 'Pending Quote', 'Under Review'].includes(r.status)).length;
    const inApproval = requisitions.filter((r) => ['Submitted', 'Inventory Review', 'Inventory Approved'].includes(r.status)).length;
    const pipeline = requisitions.reduce((sum, r) => sum + (parseFloat(r.actual_cost) || parseFloat(r.estimated_cost) || 0), 0);

    setText('totalRequisitions', requisitions.length);
    setText('pendingRequisitions', pending || active);
    setText('inApproval', inApproval);
    setText('pipelineValue', money(pipeline));

    renderRequisitionTable(displayRequisitions);
    renderSourcingPipeline(requisitions);
    renderCompletedReqs(requisitions);
  } catch (error) {
    console.error('Error loading procurement data:', error);
    if (table) table.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load requisitions.</p>';
  }
}

// Multi-tier requisition workflow (TRD §4): Submitted → Inventory Review
// (manager forwards) → Inventory Approved (Admin) → Completed (procurement
// final approval). Rejection is Admin-exclusive; the API enforces every gate.
const REQ_STAGES = ['Draft', 'Submitted', 'Inventory Review', 'Inventory Approved', 'Completed'];

function reqStageActions(r) {
  const role = typeof currentUserRole === 'undefined' ? 'Admin' : currentUserRole;
  const isAdmin = role === 'Admin';
  const isManager = role === 'Manager' || isAdmin;
  const icon = (cls, glyph, title, action) =>
    `<button class="action-btn ${cls} !px-2" title="${title}" aria-label="${title}" data-req-status="${action}" data-req-id="${r.id}"><span class="material-symbols-outlined text-base">${glyph}</span></button>`;
  const btns = [`<button class="action-btn action-btn-view !px-2" title="View details" aria-label="View details" data-req-view="${r.id}"><span class="material-symbols-outlined text-base">visibility</span></button>`];
  if (['Draft', 'Submitted', 'Pending'].includes(r.status) && isManager) {
    btns.push(icon('action-btn-primary', 'forward_to_inbox', 'Forward to inventory review', 'Inventory Review'));
  }
  if (r.status === 'Inventory Review' && isAdmin) {
    btns.push(icon('action-btn-approve', 'check_circle', 'Approve (inventory)', 'Inventory Approved'));
    btns.push(icon('action-btn-danger', 'cancel', 'Reject requisition', 'Rejected'));
  }
  if (r.status === 'Inventory Approved' && isManager) {
    btns.push(icon('action-btn-approve', 'task_alt', 'Final approval — mark completed', 'Completed'));
  }
  if (!['Rejected', 'Cancelled', 'Closed', 'Completed'].includes(r.status) && isAdmin && r.status !== 'Inventory Review') {
    btns.push(icon('action-btn-danger', 'cancel', 'Reject requisition', 'Rejected'));
  }
  return btns.join('');
}

function reqStatusBadge(s) {
  const cls = ['Completed', 'Approved', 'Inventory Approved'].includes(s) ? 'bg-emerald-100 text-emerald-700'
    : ['Rejected', 'Cancelled'].includes(s) ? 'bg-red-100 text-red-700'
    : s === 'Inventory Review' ? 'bg-indigo-100 text-indigo-700'
    : s === 'Ordered' || s === 'Closed' ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700';
  return `<span class="px-2 py-1 rounded text-xs font-semibold ${cls}">${esc(s || 'Submitted')}</span>`;
}

function renderRequisitionTable(requisitions) {
  const el = $('#requisitionsTable');
  if (!el) return;
  if (!requisitions.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No requisitions yet. Click "New Requisition" to create one.</p>';
    return;
  }
  el.innerHTML = `
    <table class="data-table w-full text-sm min-w-[820px]">
      <thead>
        <tr>
          <th>Req #</th><th>Title</th><th>Department</th><th>Priority</th>
          <th>Est. Cost</th><th>Status</th><th>Needed By</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${requisitions.map((req) => `
          <tr>
            <td><span class="tag">${esc(req.req_number)}</span></td>
            <td><b>${esc(req.title)}</b></td>
            <td>${esc(req.department)}</td>
            <td><span class="tag">${esc(req.priority)}</span></td>
            <td>${money(req.estimated_cost)}</td>
            <td>${reqStatusBadge(req.status)}</td>
            <td>${req.needed_by ? new Date(req.needed_by).toLocaleDateString() : '—'}</td>
            <td class="whitespace-nowrap">${reqStageActions(req)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

// Clickable pipeline: each stage box opens a detail dialog listing its
// requisitions. "Completed" doubles as the historical record of approved work.
function renderSourcingPipeline(requisitions) {
  const el = $('#sourcingPipeline');
  if (!el) return;
  const counts = Object.fromEntries(REQ_STAGES.map((s) => [s, 0]));
  requisitions.forEach((r) => {
    const s = counts.hasOwnProperty(r.status) ? r.status
      : (r.status === 'Approved' ? 'Inventory Approved' : 'Submitted');
    counts[s]++;
  });
  const max = Math.max(1, ...Object.values(counts));
  el.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-5 gap-4">
      ${Object.entries(counts).map(([stage, count]) => `
        <button type="button" data-stage="${stage}" class="stage-card bg-slate-50 rounded-xl p-4 border border-slate-100 text-left hover:border-primary/50 hover:shadow transition-all cursor-pointer">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-600">${stage}</span>
            <span class="text-sm font-bold text-primary">${count}</span>
          </div>
          <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full" style="width:${Math.round((count / max) * 100)}%"></div>
          </div>
        </button>`).join('')}
    </div>`;
}

// Completed requisitions — the permanent historical record.
function renderCompletedReqs(requisitions) {
  const el = $('#completedReqTable');
  if (!el) return;
  const done = requisitions.filter((r) => ['Completed', 'Approved', 'Closed', 'Ordered'].includes(r.status));
  el.innerHTML = done.length ? `<table class="data-table w-full text-sm min-w-[640px]">
    <thead><tr><th>Req #</th><th>Title</th><th>Department</th><th>Final Cost</th><th>Status</th><th>Completed</th></tr></thead>
    <tbody>${done.map((r) => `<tr>
      <td><span class="tag">${esc(r.req_number)}</span></td>
      <td><b>${esc(r.title)}</b></td>
      <td>${esc(r.department || '—')}</td>
      <td class="font-mono">${money(r.actual_cost || r.estimated_cost)}</td>
      <td>${reqStatusBadge(r.status)}</td>
      <td class="text-slate-500 text-xs">${r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}</td>
    </tr>`).join('')}</tbody></table>`
    : '<p class="text-sm text-slate-400 py-6 text-center">No completed requisitions yet — approved work lands here.</p>';
}

// Stage drill-down dialog
window.viewReqStage = (stage) => {
  const rows = allRequisitions.filter((r) => (r.status === stage) || (stage === 'Inventory Approved' && r.status === 'Approved') || (stage === 'Submitted' && !REQ_STAGES.includes(r.status)));
  const body = $('#reqStageBody');
  if (!body) return;
  $('#reqStageTitle') && ($('#reqStageTitle').textContent = `Requisitions — ${stage}`);
  body.innerHTML = rows.length ? `<table class="w-full text-sm"><thead><tr class="border-b border-slate-200 text-left">
    <th class="py-2 pr-4">Req #</th><th class="py-2 pr-4">Title</th><th class="py-2 pr-4">Dept</th><th class="py-2">Est. Cost</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="border-b border-slate-100"><td class="py-2 pr-4 font-mono text-xs">${esc(r.req_number)}</td>
    <td class="py-2 pr-4 font-medium">${esc(r.title)}</td><td class="py-2 pr-4 text-slate-600">${esc(r.department || '—')}</td>
    <td class="py-2 font-mono">${money(r.estimated_cost)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="text-sm text-slate-400 py-6 text-center">No requisitions at this stage.</p>';
  $('#reqStageModal')?.showModal();
};

// Supplier quotes now render inside Supplier Management (suppliers.js).

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================
const addRequisitionBtn = $('#addRequisition');
const reqModal = $('#addRequisitionModal');
if (addRequisitionBtn && reqModal) {
  addRequisitionBtn.onclick = () => reqModal.showModal ? reqModal.showModal() : reqModal.setAttribute('open', 'open');
}
const closeRequisitionModal = $('#closeRequisitionModal');
if (closeRequisitionModal && reqModal) {
  closeRequisitionModal.onclick = () => reqModal.close ? reqModal.close() : reqModal.removeAttribute('open');
}

const addRequisitionForm = $('#addRequisitionForm');
if (addRequisitionForm) {
  addRequisitionForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const response = await fetch('/api/v1/procurement/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      reqModal?.close?.();
      e.target.reset();
      loadProcurementData();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to create requisition');
    }
  };
}

$('#requisitionSearch')?.addEventListener('input', () => {
  const term = ($('#requisitionSearch')?.value || '').toLowerCase();
  const filtered = term
    ? allRequisitions.filter((r) => `${r.req_number} ${r.title} ${r.department} ${r.status}`.toLowerCase().includes(term))
    : allRequisitions.slice(0, 10);
  renderRequisitionTable(filtered);
});

// Requisition workflow transitions + stage drill-down + detail view
document.addEventListener('click', async (event) => {
  const stageBtn = event.target.closest('[data-stage]');
  if (stageBtn) { viewReqStage(stageBtn.dataset.stage); return; }

  const viewBtn = event.target.closest('[data-req-view]');
  if (viewBtn) {
    const r = allRequisitions.find((x) => String(x.id) === String(viewBtn.dataset.reqView));
    if (!r) return;
    const body = $('#reqStageBody');
    $('#reqStageTitle') && ($('#reqStageTitle').textContent = `Requisition ${r.req_number}`);
    if (body) body.innerHTML = `<dl class="grid grid-cols-2 gap-3 text-sm">
      <div><dt class="text-xs text-slate-500">Title</dt><dd class="font-medium">${esc(r.title)}</dd></div>
      <div><dt class="text-xs text-slate-500">Status</dt><dd>${reqStatusBadge(r.status)}</dd></div>
      <div><dt class="text-xs text-slate-500">Department</dt><dd>${esc(r.department || '—')}</dd></div>
      <div><dt class="text-xs text-slate-500">Priority</dt><dd>${esc(r.priority || 'Normal')}</dd></div>
      <div><dt class="text-xs text-slate-500">Estimated Cost</dt><dd class="font-mono">${money(r.estimated_cost)}</dd></div>
      <div><dt class="text-xs text-slate-500">Needed By</dt><dd>${r.needed_by ? new Date(r.needed_by).toLocaleDateString() : '—'}</dd></div>
      <div class="col-span-2"><dt class="text-xs text-slate-500">Justification</dt><dd>${esc(r.description || '—')}</dd></div></dl>`;
    $('#reqStageModal')?.showModal();
    return;
  }

  const actBtn = event.target.closest('[data-req-status]');
  if (actBtn) {
    const status = actBtn.dataset.reqStatus;
    const ok = await confirmStep({
      title: `${status === 'Rejected' ? 'Reject' : 'Advance'} requisition?`,
      message: `This sets the requisition to "${status}". The transition is written to the immutable audit log.`,
      confirmLabel: status === 'Rejected' ? 'Reject' : 'Confirm', icon: status === 'Rejected' ? 'cancel' : 'check_circle', danger: status === 'Rejected',
    });
    if (!ok) return;
    const res = await fetch(`/api/v1/procurement/requisitions/${encodeURIComponent(actBtn.dataset.reqId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Transition refused.'); return; }
    loadProcurementData();
  }
});
document.getElementById('closeReqStage')?.addEventListener('click', () => $('#reqStageModal')?.close());

document.addEventListener('DOMContentLoaded', function () {
  if (typeof initializePermissions === 'function') initializePermissions();
  loadProcurementData();
});


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
    renderPOHistory(purchaseOrders);

    // Load PO activity log
    loadPOActivityLog();

    // Inbound delivery simulation + finance settlement panels
    renderDeliverySim(purchaseOrders);
    loadSettlements();
  } catch (error) {
    console.error('Error loading PO data:', error);
  }
}

// Static PO history — every order, viewable details via the action icon.
function renderPOHistory(purchaseOrders) {
  const el = document.getElementById('poHistoryTable');
  if (!el) return;
  el.innerHTML = purchaseOrders.length ? `<table class="data-table w-full text-sm">
    <thead><tr><th>PO #</th><th>Vendor</th><th>Total</th><th>Status</th><th>Expected</th><th>Created</th><th>Actions</th></tr></thead>
    <tbody>${purchaseOrders.map((po) => `<tr>
      <td><span class="tag">${esc(po.po_number)}</span></td>
      <td><b>${esc(po.vendor_name || po.vendor)}</b></td>
      <td class="font-mono">${money(po.total)}</td>
      <td><span class="tag ${getPOStatusClass(po.status)}">${esc(po.status)}</span></td>
      <td class="text-slate-500 text-xs">${po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '—'}</td>
      <td class="text-slate-500 text-xs">${po.created_at ? new Date(po.created_at).toLocaleDateString() : '—'}</td>
      <td><button class="action-btn action-btn-view !px-2" title="View order" aria-label="View order" onclick="viewPO('${po.id}')"><span class="material-symbols-outlined text-base">visibility</span></button></td>
    </tr>`).join('')}</tbody></table>`
    : '<p class="text-sm text-slate-400 py-6 text-center">No purchase orders on record.</p>';
}

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
      buttons.push(icon('action-btn-primary', 'picture_as_pdf', 'Generate QR PDF', `generateQRPDF('${po.id}')`));
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
if (createPOBtn) {
  createPOBtn.onclick = () => {
    const modal = $('#createPOModal');
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
    
    // Automatically generate QR codes
    generateQRPDF(data.po_id);
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

window.generateQRPDF = async (poId) => {
  try {
    const response = await fetch(`/api/v1/pos/${poId}/qr-pdf`, {
      method: 'POST',
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR-${poId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      alert('Failed to generate QR PDF');
    }
  } catch (error) {
    console.error('Error generating QR PDF:', error);
    alert('Error generating QR PDF');
  }
};


// ==========================================
// INBOUND DELIVERY SIMULATION (Digital Twin)
// + PROCUREMENT COST SETTLEMENT (outbound → AP)
// ==========================================
function renderDeliverySim(purchaseOrders) {
  const el = $('#deliverySimList');
  if (!el) return;
  const simulatable = purchaseOrders.filter((po) => ['Sent to Vendor', 'Ordered', 'Shipped'].includes(po.status));
  const arrived = purchaseOrders.filter((po) => po.status === 'Arrived');
  if (!simulatable.length && !arrived.length) {
    el.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">No orders are in transit. Send a PO to its vendor first.</p>';
    return;
  }
  el.innerHTML = `
    ${simulatable.map((po) => `
      <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 mb-3">
        <div>
          <p class="text-sm font-bold text-slate-900">${po.po_number}</p>
          <p class="text-xs text-slate-500">${po.vendor_name || po.vendor} · ${po.status}</p>
        </div>
        <button class="action-btn action-btn-ship" onclick="simulateArrival(${po.id}, '${po.po_number}')">
          <span class="material-symbols-outlined text-sm align-middle">rocket_launch</span> Simulate Arrival
        </button>
      </div>`).join('')}
    ${arrived.length ? `<p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-5 mb-2">Arrived — assets staged at Receiving Dock</p>` : ''}
    ${arrived.map((po) => `
      <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 mb-2">
        <p class="text-sm font-semibold text-emerald-800">${po.po_number}</p>
        <span class="text-xs text-emerald-600 font-medium">Arrived${po.arrived_at ? ' · ' + new Date(po.arrived_at).toLocaleString() : ''}</span>
      </div>`).join('')}`;
}

window.simulateArrival = async (poId, poNumber) => {
  const ok = await confirmStep({
    title: 'Simulate Supplier Arrival?',
    message: `This marks ${poNumber} as Arrived and generates serialized asset placeholders at the Receiving Dock.`,
    confirmLabel: 'Simulate Arrival', icon: 'rocket_launch', danger: false,
  });
  if (!ok) return;
  const res = await fetch(`/api/v1/pos/${poId}/simulate-arrival`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Simulation failed.');
    return;
  }
  alert(`${data.count} serialized asset(s) staged for ${data.po_number}. Print their QR labels or scan to stock them.`);
  loadPOData();
};

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
const procLoaded = {};

async function loadReceivingQueue() {
  const res = await api('pos');
  const pos = res.pos || res || [];
  const arrived = pos.filter(p => p.status === 'Arrived');
  $('#receivingList').innerHTML = arrived.length ? arrived.map(p => `
    <div class="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-3">
      <span class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0"><span class="material-symbols-outlined">inventory</span></span>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-sm text-on-surface">${p.po_number}</div>
        <div class="text-xs text-on-surface-variant mt-0.5">${p.vendor || 'Unknown vendor'} · ${money(p.total || 0)}</div>
      </div>
      <button onclick="switchModuleTab('orders')" class="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">Open Purchase Orders</button>
    </div>`).join('') : '<div class="text-sm text-on-surface-variant text-center py-8">No arrivals awaiting receipt.</div>';
}

// PO date-range filter recomputes the Total Value stat live.
['poDateFrom', 'poDateTo'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.onchange = () => {
    const v = allPOs.filter(poInRange).reduce((s, po) => s + (parseFloat(po.total) || 0), 0);
    setStat('totalPOValue', money(v));
  };
});

const procTabLoaders = { receiving: loadReceivingQueue };
document.addEventListener('hub:tab', (e) => {
  const name = e.detail.tab;
  // Sourcing + Orders re-sync on every activation — the pipeline and totals
  // must reflect requisition/PO transitions made elsewhere in real time.
  if (name === 'sourcing') loadProcurementData();
  if (name === 'orders' || name === 'history') loadPOData();
  if (procTabLoaders[name] && !procLoaded[name]) { procLoaded[name] = true; procTabLoaders[name](); }
});

if (window.initHubTabs) initHubTabs('sourcing');
