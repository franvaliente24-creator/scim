// ==========================================
// PURCHASE ORDER MANAGEMENT PAGE LOGIC
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
  }).format(amount);

// ==========================================
// PURCHASE ORDER DATA LOADING
// ==========================================
async function loadPOData() {
  try {
    const response = await api('pos');
    const data = response.pos || response;
    const purchaseOrders = Array.isArray(data) ? data : [];

    // Calculate stats
    const activePOs = purchaseOrders.filter(po => po.status !== 'Received' && po.status !== 'Cancelled').length;
    const pendingApproval = purchaseOrders.filter(po => po.status === 'Pending Approval').length;
    const monthlyTotal = purchaseOrders
      .filter(po => {
        const poDate = new Date(po.created_at);
        const now = new Date();
        return poDate.getMonth() === now.getMonth() && poDate.getFullYear() === now.getFullYear();
      })
      .reduce((sum, po) => sum + (po.total || 0), 0);
    const receivedCount = purchaseOrders.filter(po => {
      const poDate = new Date(po.created_at);
      const now = new Date();
      return po.status === 'Received' && 
             poDate.getMonth() === now.getMonth() && 
             poDate.getFullYear() === now.getFullYear();
    }).length;

    // Update stats
    $('#activePOs').textContent = activePOs;
    $('#pendingApproval').textContent = pendingApproval;
    $('#monthlyTotal').textContent = money(monthlyTotal);
    $('#receivedCount').textContent = receivedCount;

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
  } catch (error) {
    console.error('Error loading PO data:', error);
  }
}

function renderPOTable(purchaseOrders) {
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
              <button class="action-btn" onclick="viewPO('${po.id}')">View</button>
              ${getPOActionButtons(po)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#poTable').innerHTML = tableHTML;
}

function getPOActionButtons(po) {
  const buttons = [];
  
  switch (po.status) {
    case 'Draft':
      buttons.push(`<button class="action-btn" onclick="submitForApproval('${po.id}')">Submit</button>`);
      break;
    case 'Pending Approval':
      buttons.push(`<button class="action-btn" onclick="approvePO('${po.id}')">Approve</button>`);
      buttons.push(`<button class="action-btn" onclick="rejectPO('${po.id}', '${po.po_number}')" style="color: #dc2626;">Reject</button>`);
      break;
    case 'Sent to Vendor':
      buttons.push(`<button class="action-btn" onclick="markShipped('${po.id}', '${po.po_number}')">Mark Shipped</button>`);
      break;
    case 'Shipped':
      buttons.push(`<button class="action-btn" onclick="receivePO('${po.id}', '${po.po_number}')">Receive</button>`);
      break;
    case 'Received':
      buttons.push(`<button class="action-btn" onclick="generateQRPDF('${po.id}')">QR PDF</button>`);
      break;
    default:
      buttons.push(`<button class="action-btn" onclick="updatePOStatus('${po.id}', '${po.status}')">Update</button>`);
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

  $('#poPipeline').innerHTML = pipelineHTML;
}

async function loadPOActivityLog() {
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

    $('#poActivityLog').innerHTML = activityLogHTML || '<p class="muted">No activity recorded yet</p>';
  } catch (error) {
    console.error('Error loading PO activity log:', error);
  }
}

function loadVendorSummary(purchaseOrders) {
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

  $('#vendorSummary').innerHTML = vendorHTML;
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Add PO Modal
$('#addPOBtn').onclick = () => $('#addPOModal').showModal();
$('#closePO').onclick = () => $('#addPOModal').close();

$('#addPOForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const response = await fetch('/api/v1/pos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData)),
  });

  if (response.ok) {
    $('#addPOModal').close();
    e.target.reset();
    loadPOData();
  } else {
    alert('Failed to create purchase order');
  }
};

// Update Status Modal
$('#closeStatus').onclick = () => $('#updateStatusModal').close();

$('#updateStatusForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const response = await fetch(`/api/v1/pos/${data.po_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: data.status, notes: data.notes }),
  });

  if (response.ok) {
    $('#updateStatusModal').close();
    loadPOData();
  } else {
    alert('Failed to update PO status');
  }
};

// Reject PO Modal
$('#closeReject').onclick = () => $('#rejectPOModal').close();

$('#rejectPOForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  const response = await fetch(`/api/v1/pos/${data.po_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Cancelled', notes: `Rejected: ${data.reason}` }),
  });

  if (response.ok) {
    $('#rejectPOModal').close();
    e.target.reset();
    loadPOData();
  } else {
    alert('Failed to reject PO');
  }
};

// Mark Shipped Modal
$('#closeShipped').onclick = () => $('#shippedModal').close();

$('#shippedForm').onsubmit = async (e) => {
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
    $('#shippedModal').close();
    e.target.reset();
    loadPOData();
  } else {
    alert('Failed to mark as shipped');
  }
};

// Receive PO Modal
$('#closeReceive').onclick = () => $('#receiveModal').close();

$('#receiveForm').onsubmit = async (e) => {
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
    $('#receiveModal').close();
    e.target.reset();
    loadPOData();
    
    // Automatically generate QR codes
    generateQRPDF(data.po_id);
  } else {
    alert('Failed to receive PO');
  }
};

// Search functionality
$('#searchPOs').oninput = (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#poTable tbody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
};

// Scanner Modal Controls
$('#mobileBtn').onclick = () => {
  $('#scanner').showModal();
  initializeCamera();
};

$('#closeScan').onclick = () => {
  stopCamera();
  $('#scanner').close();
};

let currentAction = 'Inventory Intake';
let cameraStream = null;

async function initializeCamera() {
  const video = $('#cameraPreview');
  const fallback = $('#cameraFallback');
  const status = $('#scannerStatus');

  if (!video || !fallback || !status) return;

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      cameraStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      fallback.style.display = 'none';
      status.textContent = '● Camera active';
      status.style.color = '#059669';
      
      startQRDetection();
    } else {
      throw new Error('Camera API not available');
    }
  } catch (error) {
    console.error('Camera access error:', error);
    video.style.display = 'none';
    fallback.style.display = 'grid';
    status.textContent = '● Camera unavailable';
    status.style.color = '#dc2626';
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = $('#cameraPreview');
  const fallback = $('#cameraFallback');
  const status = $('#scannerStatus');
  
  if (video) video.style.display = 'none';
  if (fallback) fallback.style.display = 'grid';
  if (status) {
    status.textContent = '● Camera stopped';
    status.style.color = '#64748b';
  }
}

$('#enableCamera').onclick = () => {
  initializeCamera();
};

document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.mode;
  };
});

function startQRDetection() {
  // Placeholder for QR detection
}

$('#scanNow').onclick = async () => {
  const response = await fetch('/api/v1/assets/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_code: $('#qr').value,
      action: currentAction,
    }),
  });

  const data = await response.json();

  $('#scanResult').textContent = response.ok
    ? `${data.asset.name} recorded for ${currentAction}.`
    : data.error;

  if (response.ok) {
    loadPOData();
  }
};

// PO action functions
window.viewPO = async (poId) => {
  try {
    const response = await api(`pos/${poId}`);
    const po = response.po;
    alert(`PO Details:\nPO #: ${po.po_number}\nVendor: ${po.vendor_name || po.vendor}\nStatus: ${po.status}\nTotal: ${money(po.total)}\nCreated: ${new Date(po.created_at).toLocaleDateString()}\nExpected Delivery: ${new Date(po.expected_delivery).toLocaleDateString()}\nItems: ${po.items}`);
  } catch (error) {
    console.error('Error viewing PO:', error);
  }
};

window.updatePOStatus = (poId, currentStatus) => {
  $('#poIdInput').value = poId;
  $('#currentStatus').value = currentStatus;
  $('#updateStatusModal').showModal();
};

window.submitForApproval = async (poId) => {
  if (confirm('Submit this PO for approval?')) {
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
  }
};

window.approvePO = async (poId) => {
  if (confirm('Approve this purchase order?')) {
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

// Load PO data on page load
loadPOData();
