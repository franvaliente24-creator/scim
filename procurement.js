// ==========================================
// PROCUREMENT & SOURCING MANAGEMENT PAGE LOGIC
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
// PROCUREMENT DATA LOADING
// ==========================================
async function loadProcurementData() {
  try {
    const response = await api('procurement/requisitions');
    const data = response.requisitions || response;
    const requisitions = Array.isArray(data) ? data : [];

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
    const data = response.quotes || response;
    const quotes = Array.isArray(data) ? data : [];

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

// Add Requisition Button - redirect to add page
const addRequisitionBtn = $('#addRequisition');
if (addRequisitionBtn) {
  addRequisitionBtn.onclick = () => {
    window.location.href = 'procurement-add.html';
  };
}

// Scanner Modal Controls
const mobileBtn = $('#mobileBtn');
if (mobileBtn) {
  mobileBtn.onclick = () => {
    const scanner = $('#scanner');
    if (scanner) {
      scanner.showModal();
      initializeCamera();
    }
  };
}

const closeScan = $('#closeScan');
if (closeScan) {
  closeScan.onclick = () => {
    stopCamera();
    const scanner = $('#scanner');
    if (scanner) scanner.close();
  };
}

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

const enableCamera = $('#enableCamera');
if (enableCamera) {
  enableCamera.onclick = () => {
    initializeCamera();
  };
}

const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach((btn) => {
  btn.onclick = () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.mode;
  };
});

function startQRDetection() {
  // Placeholder for QR detection
}

const scanNow = $('#scanNow');
if (scanNow) {
  scanNow.onclick = async () => {
    const qrInput = $('#qr');
    const scanResult = $('#scanResult');
    
    if (!qrInput) return;
    
    const response = await fetch('/api/v1/assets/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_code: qrInput.value,
        action: currentAction,
      }),
    });

    const data = await response.json();

    if (scanResult) {
      scanResult.textContent = response.ok
        ? `${data.asset.name} recorded for ${currentAction}.`
        : data.error;
    }

    if (response.ok) {
      loadProcurementData();
    }
  };
}


// Load procurement data on page load
document.addEventListener("DOMContentLoaded", function() {
    // Initialize permissions
    if (typeof initializePermissions === "function") {
        initializePermissions();
    }
    
    // Load procurement data
    loadProcurementData();
});
