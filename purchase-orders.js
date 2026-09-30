// ==========================================
// PURCHASE ORDER MANAGEMENT PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);
const setStat = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);

// ==========================================
// PURCHASE ORDER DATA LOADING
// ==========================================
async function loadPOData() {
  try {
    const response = await api('pos');
    const data = response.pos || response;
    const purchaseOrders = Array.isArray(data) ? data : [];

    const totalPOs = purchaseOrders.length;
    const activePipeline = purchaseOrders.filter(po => po.status !== 'Received' && po.status !== 'Cancelled').length;
    const pendingApproval = purchaseOrders.filter(po => po.status === 'Pending Approval').length;
    const totalPOValue = purchaseOrders.reduce((sum, po) => sum + (parseFloat(po.total) || 0), 0);

    // Update stats
    setStat('totalPOs', totalPOs);
    setStat('activePipeline', activePipeline);
    setStat('pendingApproval', pendingApproval);
    setStat('totalPOValue', money(totalPOValue));

    // Render PO table
    renderPOTable(purchaseOrders);

    // Render PO pipeline
    renderPOPipeline(purchaseOrders);

    // Load recent activity
    loadRecentActivity();

    // Load vendor summary
    loadVendorSummary(purchaseOrders);

    // Load PO activity log
    loadPOActivityLog();

    // Inbound delivery simulation + finance settlement panels
    renderDeliverySim(purchaseOrders);
    loadSettlements();
  } catch (error) {
    console.error('Error loading PO data:', error);
  }
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
          <th>Created</th>
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
            <td>${new Date(po.created_at).toLocaleDateString()}</td>
            <td>${po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : 'N/A'}</td>
            <td>
              <button class="action-btn action-btn-view" onclick="viewPO('${po.id}')">View</button>
              ${getPOActionButtons(po)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  el.innerHTML = tableHTML;
}

function getPOActionButtons(po) {
  const buttons = [];
  
  switch (po.status) {
    case 'Draft':
      buttons.push(`<button class="action-btn action-btn-primary" onclick="submitForApproval('${po.id}')">Submit</button>`);
      break;
    case 'Pending Approval':
      buttons.push(`<button class="action-btn action-btn-approve" onclick="approvePO('${po.id}')">Approve</button>`);
      buttons.push(`<button class="action-btn action-btn-danger" onclick="rejectPO('${po.id}', '${po.po_number}')">Reject</button>`);
      break;
    case 'Sent to Vendor':
      buttons.push(`<button class="action-btn action-btn-ship" onclick="markShipped('${po.id}', '${po.po_number}')">Mark Shipped</button>`);
      break;
    case 'Shipped':
      buttons.push(`<button class="action-btn action-btn-approve" onclick="receivePO('${po.id}', '${po.po_number}')">Receive</button>`);
      break;
    case 'Received':
      buttons.push(`<button class="action-btn action-btn-primary" onclick="generateQRPDF('${po.id}')">QR PDF</button>`);
      break;
    default:
      buttons.push(`<button class="action-btn action-btn-edit" onclick="updatePOStatus('${po.id}', '${po.status}')">Update</button>`);
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
      return 'status-shipped';
    case 'Received':
      return 'status-received';
    case 'Cancelled':
      return 'status-cancelled';
    default:
      return 'status-default';
  }
}

function renderPOPipeline(purchaseOrders) {
  const el = $('#poPipeline');
  if (!el) return;
  const pipelineStages = {
    'Draft': 0,
    'Pending Approval': 0,
    'Sent to Vendor': 0,
    'Shipped': 0,
    'Received': 0,
    'Cancelled': 0
  };

  purchaseOrders.forEach(po => {
    if (pipelineStages.hasOwnProperty(po.status)) {
      pipelineStages[po.status]++;
    }
  });

  const pipelineHTML = Object.entries(pipelineStages).map(([stage, count]) => `
    <div class="po-stage">
      <div class="stage-header">
        <b>${stage}</b>
        <span class="stage-count">${count}</span>
      </div>
      <div class="stage-bar">
        <div class="stage-fill ${getPOStatusClass(stage)}" style="width: ${Math.min(count * 25, 100)}%"></div>
      </div>
    </div>
  `).join('');

  el.innerHTML = pipelineHTML;
}

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

function loadVendorSummary(purchaseOrders) {
  const el = $('#vendorSummary');
  if (!el) return;
  const vendorData = {};
  purchaseOrders.forEach(po => {
    if (!vendorData[po.vendor]) {
      vendorData[po.vendor] = { count: 0, total: 0 };
    }
    vendorData[po.vendor].count++;
    vendorData[po.vendor].total += po.total || 0;
  });

  const vendorHTML = Object.entries(vendorData).map(([vendor, data]) => `
    <div class="row">
      <div>
        <b>${vendor}</b><br>
        <small>${data.count} orders</small>
      </div>
      <b>${money(data.total)}</b>
    </div>
  `).join('');

  el.innerHTML = vendorHTML;
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

// Mark Shipped Modal
const shippedModal = $('#shippedModal');
const closeShippedBtn = $('#closeShipped');
if (closeShippedBtn) closeShippedBtn.onclick = () => shippedModal?.close?.();

const shippedForm = $('#shippedForm');
if (shippedForm) shippedForm.onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const notes = `Marked as shipped. Carrier: ${data.carrier || 'N/A'}, Tracking: ${data.tracking_number || 'N/A'}. ${data.notes || ''}`;

  const response = await fetch(`/api/v1/pos/${data.po_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Shipped', notes: notes }),
  });

  if (response.ok) {
    shippedModal?.close?.();
    e.target.reset();
    loadPOData();
  } else {
    alert('Failed to mark as shipped');
  }
};

// Receive PO Modal
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

window.markShipped = (poId, poNumber) => {
  $('#shippedPoIdInput').value = poId;
  $('#shippedPoNumber').value = poNumber;
  $('#shippedModal').showModal();
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
