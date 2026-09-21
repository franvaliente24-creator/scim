// ==========================================
// PROCUREMENT & SOURCING MANAGEMENT PAGE LOGIC
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
// PROCUREMENT DATA LOADING
// ==========================================
async function loadProcurementData() {
  try {
    const response = await api('procurement/requisitions');
    const requisitions = response.requisitions || response;

    // Calculate stats
    const activeRequisitions = requisitions.filter(req => req.status !== 'Completed' && req.status !== 'Cancelled').length;
    const pendingQuotes = requisitions.filter(req => req.status === 'Pending Quote').length;
    const monthlySpend = requisitions
      .filter(req => {
        const reqDate = new Date(req.created_at);
        const now = new Date();
        return reqDate.getMonth() === now.getMonth() && reqDate.getFullYear() === now.getFullYear();
      })
      .reduce((sum, req) => sum + (req.actual_cost || req.estimated_cost || 0), 0);
    const approvedRequests = requisitions.filter(req => req.status === 'Approved').length;

    // Update stats
    $('#activeRequisitions').textContent = activeRequisitions;
    $('#pendingQuotes').textContent = pendingQuotes;
    $('#monthlySpend').textContent = money(monthlySpend);
    $('#approvedRequests').textContent = approvedRequests;

    // Render requisition table
    renderRequisitionTable(requisitions);

    // Render sourcing pipeline
    renderSourcingPipeline(requisitions);

    // Load recent quotes
    loadRecentQuotes();
  } catch (error) {
    console.error('Error loading procurement data:', error);
  }
}

function renderRequisitionTable(requisitions) {
  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Req #</th>
          <th>Title</th>
          <th>Department</th>
          <th>Priority</th>
          <th>Est. Cost</th>
          <th>Status</th>
          <th>Needed By</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${requisitions.map(req => `
          <tr>
            <td><span class="tag">${req.req_number}</span></td>
            <td><b>${req.title}</b></td>
            <td>${req.department}</td>
            <td><span class="tag ${getPriorityClass(req.priority)}">${req.priority}</span></td>
            <td>${money(req.estimated_cost)}</td>
            <td><span class="tag ${getStatusClass(req.status)}">${req.status}</span></td>
            <td>${new Date(req.needed_by).toLocaleDateString()}</td>
            <td>
              <button class="action-btn" onclick="viewRequisition('${req.req_number}')">View</button>
              <button class="action-btn" onclick="editRequisition('${req.req_number}')">Edit</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#requisitionTable').innerHTML = tableHTML;
}

function getPriorityClass(priority) {
  switch (priority) {
    case 'Urgent':
      return 'priority-urgent';
    case 'High':
      return 'priority-high';
    case 'Medium':
      return 'priority-medium';
    case 'Low':
    default:
      return 'priority-low';
  }
}

function getStatusClass(status) {
  switch (status) {
    case 'Approved':
      return 'status-approved';
    case 'Pending Quote':
      return 'status-pending';
    case 'Completed':
      return 'status-completed';
    case 'Cancelled':
      return 'status-cancelled';
    default:
      return 'status-default';
  }
}

function renderSourcingPipeline(requisitions) {
  const pipelineStages = {
    'Draft': 0,
    'Submitted': 0,
    'Pending Quote': 0,
    'Under Review': 0,
    'Approved': 0,
    'Completed': 0
  };

  requisitions.forEach(req => {
    if (pipelineStages.hasOwnProperty(req.status)) {
      pipelineStages[req.status]++;
    }
  });

  const pipelineHTML = Object.entries(pipelineStages).map(([stage, count]) => `
    <div class="pipeline-stage">
      <div class="stage-header">
        <b>${stage}</b>
        <span class="stage-count">${count}</span>
      </div>
      <div class="stage-bar">
        <div class="stage-fill" style="width: ${Math.min(count * 20, 100)}%"></div>
      </div>
    </div>
  `).join('');

  $('#sourcingPipeline').innerHTML = pipelineHTML;
}

async function loadRecentQuotes() {
  try {
    const response = await api('procurement/quotes');
    const quotes = response.quotes || response;

    const quotesHTML = quotes.map(quote => `
      <div class="row">
        <div>
          <b>${quote.vendor}</b><br>
          <small>${quote.req_number} · ${money(quote.quote_amount)}</small>
        </div>
        <span class="tag ${quote.status === 'Accepted' ? 'status-approved' : 'status-pending'}">${quote.status}</span>
      </div>
    `).join('');

    $('#recentQuotes').innerHTML = quotesHTML;
  } catch (error) {
    console.error('Error loading recent quotes:', error);
  }
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

// Add Requisition Modal
$('#addRequisitionBtn').onclick = () => $('#addRequisitionModal').showModal();
$('#closeRequisition').onclick = () => $('#addRequisitionModal').close();

$('#addRequisitionForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const response = await fetch('/api/v1/procurement/requisitions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData)),
  });

  if (response.ok) {
    $('#addRequisitionModal').close();
    e.target.reset();
    loadProcurementData();
  } else {
    alert('Failed to submit requisition');
  }
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
    loadProcurementData();
  }
};

// Requisition action functions
window.viewRequisition = async (reqNumber) => {
  try {
    const response = await api(`procurement/requisitions/${reqNumber}`);
    const requisition = response.requisition;
    alert(`Requisition Details:\nTitle: ${requisition.title}\nReq #: ${requisition.req_number}\nDepartment: ${requisition.department}\nPriority: ${requisition.priority}\nStatus: ${requisition.status}\nEst. Cost: ${money(requisition.estimated_cost)}\nNeeded By: ${new Date(requisition.needed_by).toLocaleDateString()}`);
  } catch (error) {
    console.error('Error viewing requisition:', error);
  }
};

window.editRequisition = (reqNumber) => {
  alert(`Edit functionality for ${reqNumber} - to be implemented`);
};

// Load procurement data on page load
loadProcurementData();
