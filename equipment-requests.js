// Equipment Requests Management Script
// Handles cross-system equipment request workflow

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`Element not found: ${selector}`);
    return null;
  }
  return element;
};

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

let currentRequests = [];
let currentApprovalRequest = null;
let currentRejectionRequest = null;
let currentFulfillmentRequest = null;

// Initialize permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializePermissions();
  await requireSession().then((signedIn) => signedIn && loadEquipmentRequests());
  setupEventListeners();
});

async function requireSession() {
  const response = await fetch('/api/v1/auth/me');
  const data = await response.json();
  if (!data.user) {
    window.location.replace('login.html');
    return false;
  }
  
  return true;
}

function setupEventListeners() {
  const searchInput = $('#search-input');
  if (searchInput) {
    searchInput.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') {
        applyFilters();
      }
    });
  }
}

async function loadEquipmentRequests() {
  try {
    const data = await api('equipment-requests');
    
    if (data.requests) {
      currentRequests = data.requests;
      displayRequests(currentRequests);
      updateStats(currentRequests);
    }
  } catch (error) {
    console.error('Error loading equipment requests:', error);
    showNotification('Error loading equipment requests', 'error');
  }
}

function displayRequests(requests) {
  const container = $('#requests-container');
  
  if (!container) return;
  
  if (requests.length === 0) {
    container.innerHTML = `
      <div class="dashboard-card bg-white shadow-sm border border-slate-200 p-8 text-center">
        <span class="material-symbols-outlined text-6xl text-on-surface-variant/30">inbox</span>
        <p class="text-on-surface-variant mt-4">No equipment requests found</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = requests.map(request => createRequestCard(request)).join('');
  
  // Load activity for all requests after displaying them
  setTimeout(() => {
    requests.forEach(request => {
      loadRequestActivity(request.id);
    });
  }, 300);
}

function createRequestCard(request) {
  const statusStyles = getStatusStyles(request.status);
  const priorityStyles = getPriorityStyles(request.priority || 'medium');
  const equipmentNeeded = JSON.parse(request.equipment_needed || '[]');
  
  return `
    <div class="dashboard-card bg-white shadow-sm border border-slate-200 overflow-hidden" id="request-${request.id}">
      <div class="p-6 border-b border-outline-variant/30 flex justify-between items-start">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <h3 class="text-lg font-headline font-bold text-on-surface">${request.request_number}</h3>
            <span class="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-md border border-primary/20">${request.requesting_system || 'Internal'}</span>
          </div>
          <div class="flex gap-2">
            <span class="px-3 py-1 text-xs font-medium rounded-full ${statusStyles.bg} ${statusStyles.text}">${request.status}</span>
            <span class="px-3 py-1 text-xs font-medium rounded-full ${priorityStyles.bg} ${priorityStyles.text}">${request.priority || 'Medium'}</span>
          </div>
        </div>
      </div>
      
      <div class="p-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div>
            <p class="text-xs text-on-surface-variant mb-1">Employee</p>
            <p class="text-sm font-medium text-on-surface">${request.employee_name}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant mb-1">Employee ID</p>
            <p class="text-sm font-medium text-on-surface">${request.employee_id || 'N/A'}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant mb-1">Department</p>
            <p class="text-sm font-medium text-on-surface">${request.department || 'N/A'}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant mb-1">Needed By</p>
            <p class="text-sm font-medium text-on-surface">${formatDate(request.needed_by)}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant mb-1">Estimated Cost</p>
            <p class="text-sm font-medium text-on-surface">${formatCurrency(request.estimated_cost)}</p>
          </div>
          <div>
            <p class="text-xs text-on-surface-variant mb-1">Requested Date</p>
            <p class="text-sm font-medium text-on-surface">${formatDateTime(request.requested_date)}</p>
          </div>
        </div>
        
        <div class="bg-surface-container-low rounded-lg p-4 mb-4">
          <h4 class="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">devices</span>
            Equipment Needed
          </h4>
          ${equipmentNeeded.length > 0 ? equipmentNeeded.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-outline-variant/20 last:border-0">
              <div>
                <p class="text-sm font-medium text-on-surface">${item.category}</p>
                <p class="text-xs text-on-surface-variant">${item.specifications || ''}</p>
              </div>
              <span class="text-sm font-medium text-on-surface">Qty: ${item.quantity}</span>
            </div>
          `).join('') : '<p class="text-sm text-on-surface-variant">No equipment specified</p>'}
        </div>
        
        ${request.business_justification ? `
          <div class="mb-4">
            <h4 class="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2">
              <span class="material-symbols-outlined text-lg">description</span>
              Business Justification
            </h4>
            <p class="text-sm text-on-surface-variant bg-surface-container-low p-3 rounded-lg">${request.business_justification}</p>
          </div>
        ` : ''}
        
        ${request.rejection_reason ? `
          <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 class="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
              <span class="material-symbols-outlined text-lg">error</span>
              Rejection Reason
            </h4>
            <p class="text-sm text-red-700">${request.rejection_reason}</p>
          </div>
        ` : ''}
        
        <div class="flex gap-3 mb-4">
          ${getRequestActionButtons(request)}
        </div>
        
        <div class="border-t border-outline-variant/20 pt-4">
          <h4 class="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-lg">history</span>
            Activity Timeline
          </h4>
          <div id="activity-${request.id}" class="space-y-2">
            <p class="text-sm text-on-surface-variant">Loading activity...</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getStatusStyles(status) {
  const styles = {
    'Pending': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'Approved': { bg: 'bg-green-100', text: 'text-green-800' },
    'Rejected': { bg: 'bg-red-100', text: 'text-red-800' },
    'Fulfilling': { bg: 'bg-blue-100', text: 'text-blue-800' },
    'Fulfilled': { bg: 'bg-green-100', text: 'text-green-800' }
  };
  return styles[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
}

function getPriorityStyles(priority) {
  const styles = {
    'High': { bg: 'bg-red-100', text: 'text-red-800' },
    'Medium': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'Low': { bg: 'bg-green-100', text: 'text-green-800' }
  };
  return styles[priority] || { bg: 'bg-gray-100', text: 'text-gray-800' };
}

function getRequestActionButtons(request) {
  const buttons = [];
  
  switch (request.status) {
    case 'Pending':
      buttons.push(`<button onclick="openApprovalModal('${request.request_number}')" class="btn-primary dashboard-action-button">
        <span class="material-symbols-outlined">check_circle</span>
        Approve
      </button>`);
      buttons.push(`<button onclick="openRejectionModal('${request.request_number}')" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
        <span class="material-symbols-outlined">cancel</span>
        Reject
      </button>`);
      break;
    case 'Approved':
      buttons.push(`<button onclick="openFulfillmentModal('${request.request_number}')" class="btn-primary dashboard-action-button">
        <span class="material-symbols-outlined">inventory_2</span>
        Start Fulfillment
      </button>`);
      break;
    case 'Fulfilling':
      buttons.push(`<button onclick="completeFulfillment('${request.request_number}')" class="btn-primary dashboard-action-button">
        <span class="material-symbols-outlined">task_alt</span>
        Complete Fulfillment
      </button>`);
      break;
    case 'Fulfilled':
      buttons.push(`<button onclick="viewRequestDetails('${request.request_number}')" class="btn-secondary dashboard-action-button">
        <span class="material-symbols-outlined">visibility</span>
        View Details
      </button>`);
      break;
    case 'Rejected':
      buttons.push(`<button onclick="viewRequestDetails('${request.request_number}')" class="btn-secondary dashboard-action-button">
        <span class="material-symbols-outlined">visibility</span>
        View Details
      </button>`);
      break;
    default:
      buttons.push(`<button onclick="viewRequestDetails('${request.request_number}')" class="btn-secondary dashboard-action-button">
        <span class="material-symbols-outlined">visibility</span>
        View Details
      </button>`);
  }
  
  return buttons.join('');
}

async function loadRequestActivity(requestId) {
  try {
    const data = await api(`equipment-requests/${requestId}/activity`);
    
    const activityContainer = $(`#activity-${requestId}`);
    if (!activityContainer) return;
    
    if (data.activities && data.activities.length > 0) {
      activityContainer.innerHTML = data.activities.map(activity => `
        <div class="flex gap-3 py-2 border-b border-outline-variant/20 last:border-0">
          <div class="min-w-[140px]">
            <p class="text-xs text-on-surface-variant">${formatDateTime(activity.created_at)}</p>
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium text-on-surface">${activity.action}</p>
            <p class="text-xs text-on-surface-variant">${activity.details || ''}</p>
            <p class="text-xs text-on-surface-variant">By: ${activity.performed_by || activity.performed_by_system || 'System'}</p>
          </div>
        </div>
      `).join('');
    } else {
      activityContainer.innerHTML = '<p class="text-sm text-on-surface-variant">No activity recorded</p>';
    }
  } catch (error) {
    console.error('Error loading activity:', error);
    const activityContainer = $(`#activity-${requestId}`);
    if (activityContainer) {
      activityContainer.innerHTML = '<p class="text-sm text-on-surface-variant">Error loading activity</p>';
    }
  }
}

function updateStats(requests) {
  const totalRequestsEl = $('#total-requests');
  const pendingRequestsEl = $('#pending-requests');
  const approvedRequestsEl = $('#approved-requests');
  const fulfilledRequestsEl = $('#fulfilled-requests');
  
  if (totalRequestsEl) totalRequestsEl.textContent = requests.length;
  if (pendingRequestsEl) pendingRequestsEl.textContent = requests.filter(r => r.status === 'Pending').length;
  if (approvedRequestsEl) approvedRequestsEl.textContent = requests.filter(r => r.status === 'Approved').length;
  if (fulfilledRequestsEl) fulfilledRequestsEl.textContent = requests.filter(r => r.status === 'Fulfilled').length;
}

function applyFilters() {
  const statusEl = $('#filter-status');
  const priorityEl = $('#filter-priority');
  const systemEl = $('#filter-system');
  const searchEl = $('#search-input');
  
  const status = statusEl ? statusEl.value : '';
  const priority = priorityEl ? priorityEl.value : '';
  const system = systemEl ? systemEl.value : '';
  const search = searchEl ? searchEl.value.toLowerCase() : '';
  
  let filtered = currentRequests;
  
  if (status) {
    filtered = filtered.filter(r => r.status === status);
  }
  
  if (priority) {
    filtered = filtered.filter(r => r.priority === priority);
  }
  
  if (system) {
    filtered = filtered.filter(r => r.requesting_system === system);
  }
  
  if (search) {
    filtered = filtered.filter(r => 
      r.employee_name.toLowerCase().includes(search) ||
      r.request_number.toLowerCase().includes(search) ||
      (r.employee_id && r.employee_id.toLowerCase().includes(search))
    );
  }
  
  displayRequests(filtered);
}

function resetFilters() {
  const statusEl = $('#filter-status');
  const priorityEl = $('#filter-priority');
  const systemEl = $('#filter-system');
  const searchEl = $('#search-input');
  
  if (statusEl) statusEl.value = '';
  if (priorityEl) priorityEl.value = '';
  if (systemEl) systemEl.value = '';
  if (searchEl) searchEl.value = '';
  
  displayRequests(currentRequests);
}

// Modal functions
function openApprovalModal(requestNumber) {
  currentApprovalRequest = requestNumber;
  const requestNumberEl = $('#approval-request-number');
  const approvalNotesEl = $('#approval-notes');
  const modalEl = $('#approval-modal');
  
  if (requestNumberEl) requestNumberEl.value = requestNumber;
  if (approvalNotesEl) approvalNotesEl.value = '';
  if (modalEl) {
    modalEl.style.display = 'flex';
  }
}

function openRejectionModal(requestNumber) {
  currentRejectionRequest = requestNumber;
  const requestNumberEl = $('#rejection-request-number');
  const rejectionReasonEl = $('#rejection-reason');
  const modalEl = $('#rejection-modal');
  
  if (requestNumberEl) requestNumberEl.value = requestNumber;
  if (rejectionReasonEl) rejectionReasonEl.value = '';
  if (modalEl) {
    modalEl.style.display = 'flex';
  }
}

function openFulfillmentModal(requestNumber) {
  currentFulfillmentRequest = requestNumber;
  const requestNumberEl = $('#fulfillment-request-number');
  const fulfillmentNotesEl = $('#fulfillment-notes');
  const modalEl = $('#fulfillment-modal');
  
  if (requestNumberEl) requestNumberEl.value = requestNumber;
  if (fulfillmentNotesEl) fulfillmentNotesEl.value = '';
  
  // Load equipment items for fulfillment
  loadFulfillmentItems(requestNumber);
  
  if (modalEl) {
    modalEl.style.display = 'flex';
  }
}

function closeModal(modalId) {
  const modalEl = $(`#${modalId}`);
  if (modalEl) {
    modalEl.style.display = 'none';
  }
  currentApprovalRequest = null;
  currentRejectionRequest = null;
  currentFulfillmentRequest = null;
}

async function loadFulfillmentItems(requestNumber) {
  try {
    const data = await api(`equipment-requests/${requestNumber}`);
    
    if (data.request) {
      const equipmentNeeded = JSON.parse(data.request.equipment_needed || '[]');
      const fulfillmentItems = $('#fulfillment-items');
      
      if (fulfillmentItems) {
        fulfillmentItems.innerHTML = `
          <h4 class="text-sm font-semibold text-on-surface mb-3">Equipment Items to Fulfill</h4>
          ${equipmentNeeded.map((item, index) => `
            <div class="bg-surface-container-low p-4 rounded-lg mb-3">
              <div class="font-medium text-on-surface mb-2">${item.category} x ${item.quantity}</div>
              <div class="text-sm text-on-surface-variant mb-3">${item.specifications || ''}</div>
              <div>
                <label class="block text-sm font-medium text-on-surface mb-2">Assign Asset QR Code</label>
                <input type="text" class="asset-qr-input w-full px-4 py-2 border border-outline-variant rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" data-index="${index}" placeholder="Enter QR code to assign">
              </div>
            </div>
          `).join('')}
        `;
      }
    }
  } catch (error) {
    console.error('Error loading fulfillment items:', error);
    showNotification('Error loading equipment items', 'error');
  }
}

async function confirmApproval() {
  if (!currentApprovalRequest) return;
  
  const approvalNotesEl = $('#approval-notes');
  const notes = approvalNotesEl ? approvalNotesEl.value : '';
  
  try {
    const response = await fetch(`/api/v1/equipment-requests/${currentApprovalRequest}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'Approved',
        notes: notes
      })
    });
    
    if (response.ok) {
      showNotification('Equipment request approved successfully', 'success');
      closeModal('approval-modal');
      loadEquipmentRequests();
    } else {
      throw new Error('Approval failed');
    }
  } catch (error) {
    console.error('Error approving request:', error);
    showNotification('Error approving equipment request', 'error');
  }
}

async function confirmRejection() {
  if (!currentRejectionRequest) return;
  
  const rejectionReasonEl = $('#rejection-reason');
  const reason = rejectionReasonEl ? rejectionReasonEl.value : '';
  
  if (!reason.trim()) {
    showNotification('Please provide a rejection reason', 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/v1/equipment-requests/${currentRejectionRequest}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'Rejected',
        rejection_reason: reason
      })
    });
    
    if (response.ok) {
      showNotification('Equipment request rejected', 'success');
      closeModal('rejection-modal');
      loadEquipmentRequests();
    } else {
      throw new Error('Rejection failed');
    }
  } catch (error) {
    console.error('Error rejecting request:', error);
    showNotification('Error rejecting equipment request', 'error');
  }
}

async function confirmFulfillment() {
  if (!currentFulfillmentRequest) return;
  
  const fulfillmentNotesEl = $('#fulfillment-notes');
  const notes = fulfillmentNotesEl ? fulfillmentNotesEl.value : '';
  const qrInputs = document.querySelectorAll('.asset-qr-input');
  
  // Collect assigned QR codes
  const assignments = [];
  qrInputs.forEach((input, index) => {
    if (input.value.trim()) {
      assignments.push({
        index: index,
        qr_code: input.value.trim()
      });
    }
  });
  
  try {
    const response = await fetch(`/api/v1/equipment-requests/${currentFulfillmentRequest}/fulfill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assignments: assignments,
        notes: notes
      })
    });
    
    if (response.ok) {
      showNotification('Equipment request fulfilled successfully', 'success');
      closeModal('fulfillment-modal');
      loadEquipmentRequests();
    } else {
      throw new Error('Fulfillment failed');
    }
  } catch (error) {
    console.error('Error fulfilling request:', error);
    showNotification('Error fulfilling equipment request', 'error');
  }
}

async function completeFulfillment(requestNumber) {
  try {
    const response = await fetch(`/api/v1/equipment-requests/${requestNumber}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'Fulfilled'
      })
    });
    
    if (response.ok) {
      showNotification('Equipment request fulfillment completed', 'success');
      loadEquipmentRequests();
    } else {
      throw new Error('Completion failed');
    }
  } catch (error) {
    console.error('Error completing fulfillment:', error);
    showNotification('Error completing fulfillment', 'error');
  }
}

async function viewRequestDetails(requestNumber) {
  // For now, just show a notification - this could be expanded to show a detailed modal
  showNotification(`Viewing details for ${requestNumber}`, 'info');
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatCurrency(amount) {
  if (!amount) return 'N/A';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  const typeStyles = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    info: 'bg-blue-600'
  };
  
  notification.className = `fixed top-4 right-4 px-6 py-4 rounded-xl shadow-lg text-white font-medium z-50 flex items-center gap-3 ${typeStyles[type] || typeStyles.info}`;
  notification.innerHTML = `
    <span class="material-symbols-outlined">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
    <span>${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}