// Equipment Requests Management Script
// Handles cross-system equipment request workflow

let currentRequests = [];
let currentApprovalRequest = null;
let currentRejectionRequest = null;
let currentFulfillmentRequest = null;

// Load equipment requests on page load
document.addEventListener('DOMContentLoaded', function() {
    loadEquipmentRequests();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('search-input').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });
}

async function loadEquipmentRequests() {
    try {
        const response = await fetch('/api/v1/equipment-requests');
        const data = await response.json();
        
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
    const container = document.getElementById('requests-container');
    
    if (requests.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <p>No equipment requests found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = requests.map(request => createRequestCard(request)).join('');
}

function createRequestCard(request) {
    const statusClass = `status-${request.status.toLowerCase().replace(' ', '-')}`;
    const priorityClass = `priority-${(request.priority || 'medium').toLowerCase()}`;
    const equipmentNeeded = JSON.parse(request.equipment_needed || '[]');
    
    return `
        <div class="request-card" id="request-${request.id}">
            <div class="request-header">
                <div>
                    <div class="request-number">${request.request_number}</div>
                    <span class="system-badge">${request.requesting_system}</span>
                </div>
                <div>
                    <span class="status-badge ${statusClass}">${request.status}</span>
                    <span class="priority-badge ${priorityClass}">${request.priority || 'Medium'}</span>
                </div>
            </div>
            
            <div class="request-details">
                <div class="detail-item">
                    <span class="detail-label">Employee</span>
                    <span class="detail-value">${request.employee_name}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Employee ID</span>
                    <span class="detail-value">${request.employee_id || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Department</span>
                    <span class="detail-value">${request.department || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Needed By</span>
                    <span class="detail-value">${formatDate(request.needed_by)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Estimated Cost</span>
                    <span class="detail-value">${formatCurrency(request.estimated_cost)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Requested Date</span>
                    <span class="detail-value">${formatDateTime(request.requested_date)}</span>
                </div>
            </div>
            
            <div class="equipment-items">
                <strong>Equipment Needed:</strong>
                ${equipmentNeeded.map(item => `
                    <div class="equipment-item">
                        <div>
                            <span style="font-weight: 500;">${item.category}</span>
                            <span style="color: #6b7280; margin-left: 10px;">${item.specifications || ''}</span>
                        </div>
                        <div>
                            <span style="font-weight: 500;">Qty: ${item.quantity}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            ${request.business_justification ? `
                <div style="margin-bottom: 15px;">
                    <strong>Business Justification:</strong>
                    <p style="color: #6b7280; margin-top: 5px;">${request.business_justification}</p>
                </div>
            ` : ''}
            
            ${request.rejection_reason ? `
                <div style="margin-bottom: 15px; padding: 10px; background: #fee2e2; border-radius: 6px;">
                    <strong style="color: #991b1b;">Rejection Reason:</strong>
                    <p style="color: #991b1b; margin-top: 5px;">${request.rejection_reason}</p>
                </div>
            ` : ''}
            
            <div class="action-buttons">
                ${getRequestActionButtons(request)}
            </div>
            
            <div class="activity-timeline">
                <strong>Activity Timeline</strong>
                <div id="activity-${request.id}">
                    <p style="color: #6b7280; font-size: 0.9em;">Loading activity...</p>
                </div>
            </div>
        </div>
    `;
}

function getRequestActionButtons(request) {
    const buttons = [];
    
    switch (request.status) {
        case 'Pending':
            buttons.push(`<button class="btn btn-success" onclick="openApprovalModal('${request.request_number}')">Approve</button>`);
            buttons.push(`<button class="btn btn-danger" onclick="openRejectionModal('${request.request_number}')">Reject</button>`);
            break;
        case 'Approved':
            buttons.push(`<button class="btn btn-primary" onclick="openFulfillmentModal('${request.request_number}')">Start Fulfillment</button>`);
            break;
        case 'Fulfilling':
            buttons.push(`<button class="btn btn-success" onclick="completeFulfillment('${request.request_number}')">Complete Fulfillment</button>`);
            break;
        case 'Fulfilled':
            buttons.push(`<button class="btn btn-secondary" onclick="viewRequestDetails('${request.request_number}')">View Details</button>`);
            break;
        case 'Rejected':
            buttons.push(`<button class="btn btn-secondary" onclick="viewRequestDetails('${request.request_number}')">View Details</button>`);
            break;
        default:
            buttons.push(`<button class="btn btn-secondary" onclick="viewRequestDetails('${request.request_number}')">View Details</button>`);
    }
    
    return buttons.join('');
}

async function loadRequestActivity(requestId) {
    try {
        const response = await fetch(`/api/v1/equipment-requests/${requestId}/activity`);
        const data = await response.json();
        
        const activityContainer = document.getElementById(`activity-${requestId}`);
        if (data.activities && data.activities.length > 0) {
            activityContainer.innerHTML = data.activities.map(activity => `
                <div class="activity-item">
                    <div class="activity-time">${formatDateTime(activity.created_at)}</div>
                    <div>
                        <div class="activity-action">${activity.action}</div>
                        <div class="activity-details">${activity.details || ''}</div>
                        <div class="activity-details">By: ${activity.performed_by || activity.performed_by_system || 'System'}</div>
                    </div>
                </div>
            `).join('');
        } else {
            activityContainer.innerHTML = '<p style="color: #6b7280; font-size: 0.9em;">No activity recorded</p>';
        }
    } catch (error) {
        console.error('Error loading activity:', error);
    }
}

// Load activity for all requests after displaying them
setTimeout(() => {
    currentRequests.forEach(request => {
        loadRequestActivity(request.id);
    });
}, 500);

function updateStats(requests) {
    document.getElementById('total-requests').textContent = requests.length;
    document.getElementById('pending-requests').textContent = requests.filter(r => r.status === 'Pending').length;
    document.getElementById('approved-requests').textContent = requests.filter(r => r.status === 'Approved').length;
    document.getElementById('fulfilled-requests').textContent = requests.filter(r => r.status === 'Fulfilled').length;
}

function applyFilters() {
    const status = document.getElementById('filter-status').value;
    const priority = document.getElementById('filter-priority').value;
    const system = document.getElementById('filter-system').value;
    const search = document.getElementById('search-input').value.toLowerCase();
    
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
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-system').value = '';
    document.getElementById('search-input').value = '';
    
    displayRequests(currentRequests);
}

// Modal functions
function openApprovalModal(requestNumber) {
    currentApprovalRequest = requestNumber;
    document.getElementById('approval-request-number').value = requestNumber;
    document.getElementById('approval-notes').value = '';
    document.getElementById('approval-modal').classList.add('active');
}

function openRejectionModal(requestNumber) {
    currentRejectionRequest = requestNumber;
    document.getElementById('rejection-request-number').value = requestNumber;
    document.getElementById('rejection-reason').value = '';
    document.getElementById('rejection-modal').classList.add('active');
}

function openFulfillmentModal(requestNumber) {
    currentFulfillmentRequest = requestNumber;
    document.getElementById('fulfillment-request-number').value = requestNumber;
    document.getElementById('fulfillment-notes').value = '';
    
    // Load equipment items for fulfillment
    loadFulfillmentItems(requestNumber);
    
    document.getElementById('fulfillment-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    currentApprovalRequest = null;
    currentRejectionRequest = null;
    currentFulfillmentRequest = null;
}

async function loadFulfillmentItems(requestNumber) {
    try {
        const response = await fetch(`/api/v1/equipment-requests/${requestNumber}`);
        const data = await response.json();
        
        if (data.request) {
            const equipmentNeeded = JSON.parse(data.request.equipment_needed || '[]');
            const fulfillmentItems = document.getElementById('fulfillment-items');
            
            fulfillmentItems.innerHTML = `
                <h4>Equipment Items to Fulfill</h4>
                ${equipmentNeeded.map((item, index) => `
                    <div class="form-group" style="background: #f9fafb; padding: 15px; border-radius: 6px; margin-bottom: 10px;">
                        <div style="font-weight: 500; margin-bottom: 10px;">${item.category} x ${item.quantity}</div>
                        <div style="font-size: 0.9em; color: #6b7280; margin-bottom: 10px;">${item.specifications || ''}</div>
                        <div class="form-group">
                            <label>Assign Asset QR Code</label>
                            <input type="text" class="asset-qr-input" data-index="${index}" placeholder="Enter QR code to assign">
                        </div>
                    </div>
                `).join('')}
            `;
        }
    } catch (error) {
        console.error('Error loading fulfillment items:', error);
        showNotification('Error loading equipment items', 'error');
    }
}

async function confirmApproval() {
    if (!currentApprovalRequest) return;
    
    const notes = document.getElementById('approval-notes').value;
    
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
    
    const reason = document.getElementById('rejection-reason').value;
    
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
    
    const notes = document.getElementById('fulfillment-notes').value;
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
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        ${type === 'success' ? 'background: #10b981;' : ''}
        ${type === 'error' ? 'background: #ef4444;' : ''}
        ${type === 'info' ? 'background: #3b82f6;' : ''}
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);