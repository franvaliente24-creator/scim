// ==========================================
// PURCHASE ORDER MANAGEMENT PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

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
    const purchaseOrders = response.pos || response;

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
            <td><b>${po.vendor}</b></td>
            <td>${money(po.total)}</td>
            <td><span class="tag ${getPOStatusClass(po.status)}">${po.status}</span></td>
            <td>${new Date(po.created_at).toLocaleDateString()}</td>
            <td>${new Date(po.expected_delivery).toLocaleDateString()}</td>
            <td>
              <button class="action-btn" onclick="viewPO('${po.id}')">View</button>
              <button class="action-btn" onclick="updatePOStatus('${po.id}', '${po.status}')">Update</button>
              ${po.status === 'Received' ? '<button class="action-btn" onclick="generateQRPDF(\'' + po.id + '\')">QR PDF</button>' : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#poTable').innerHTML = tableHTML;
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

async function loadRecentActivity() {
  try {
    const response = await api('pos/activity');
    const activities = response.activities || response;

    const activityHTML = activities.map(activity => `
      <div class="row">
        <div>
          <b>${activity.action}</b><br>
          <small>${activity.po_number} · ${activity.details}</small>
        </div>
        <small>${new Date(activity.created_at).toLocaleString()}</small>
      </div>
    `).join('');

    $('#recentActivity').innerHTML = activityHTML;
  } catch (error) {
    console.error('Error loading recent activity:', error);
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

// Navigation & Sidebar
$('#toggle').onclick = () => {
  if (window.innerWidth < 850) {
    $('#sidebar').classList.toggle('open');
  } else {
    $('#sidebar').classList.toggle('collapsed');
  }
};

$('#profile').onclick = () => {
  $('#profileMenu').hidden = !$('#profileMenu').hidden;
};

$('#usersLink').onclick = () => {
  window.location.href = 'users.html';
};

$('#logout').onclick = () => {
  window.location.href = 'login.html';
};

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
$('#mobileBtn').onclick = () => $('#scanner').showModal();
$('#closeScan').onclick = () => $('#scanner').close();

let currentAction = 'Inventory Intake';

document.querySelectorAll('.modes button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.modes button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.textContent;
  };
});

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
    alert(`PO Details:\nPO #: ${po.po_number}\nVendor: ${po.vendor}\nStatus: ${po.status}\nTotal: ${money(po.total)}\nCreated: ${new Date(po.created_at).toLocaleDateString()}\nExpected Delivery: ${new Date(po.expected_delivery).toLocaleDateString()}\nItems: ${po.items}`);
  } catch (error) {
    console.error('Error viewing PO:', error);
  }
};

window.updatePOStatus = (poId, currentStatus) => {
  $('#poIdInput').value = poId;
  $('#currentStatus').value = currentStatus;
  $('#updateStatusModal').showModal();
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
