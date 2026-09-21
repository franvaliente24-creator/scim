// ==========================================
// DOCUMENT TRACKING & LOGISTICS PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

// ==========================================
// DOCUMENT DATA LOADING
// ==========================================
async function loadDocumentData() {
  try {
    const response = await api('documents');
    const documents = response.documents || response;

    // Calculate stats
    const totalDocuments = documents.length;
    const pendingVerification = documents.filter(doc => doc.status === 'Pending Verification').length;
    const eafDocuments = documents.filter(doc => doc.document_type === 'EAF');
    const eafCompliance = eafDocuments.length > 0
      ? Math.round((eafDocuments.filter(doc => doc.status === 'Verified').length / eafDocuments.length) * 100)
      : 0;
    const monthlyDocs = documents.filter(doc => {
      const docDate = new Date(doc.created_at);
      const now = new Date();
      return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
    }).length;

    // Update stats
    $('#totalDocuments').textContent = totalDocuments;
    $('#pendingVerification').textContent = pendingVerification;
    $('#eafCompliance').textContent = `${eafCompliance}%`;
    $('#monthlyDocs').textContent = monthlyDocs;

    // Render document table
    renderDocumentTable(documents);

    // Render EAF status
    renderEAFStatus(documents);

    // Load recent activity
    loadRecentActivity();

    // Load courier tracking
    loadCourierTracking(documents);
  } catch (error) {
    console.error('Error loading document data:', error);
  }
}

function renderDocumentTable(documents) {
  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Document Type</th>
          <th>Reference #</th>
          <th>Owner</th>
          <th>Status</th>
          <th>Created</th>
          <th>Due Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${documents.map(doc => `
          <tr>
            <td><b>${doc.document_type}</b></td>
            <td><span class="tag">${doc.reference_no}</span></td>
            <td>${doc.owner}</td>
            <td><span class="tag ${getDocStatusClass(doc.status)}">${doc.status}</span></td>
            <td>${new Date(doc.created_at).toLocaleDateString()}</td>
            <td>${doc.due_date ? new Date(doc.due_date).toLocaleDateString() : 'N/A'}</td>
            <td>
              <button class="action-btn" onclick="viewDocument('${doc.id}')">View</button>
              <button class="action-btn" onclick="updateDocStatus('${doc.id}', '${doc.status}')">Update</button>
              ${doc.document_type === 'EAF' ? '<button class="action-btn" onclick="signDocument(\'' + doc.id + '\')">Sign</button>' : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#documentTable').innerHTML = tableHTML;
}

function getDocStatusClass(status) {
  switch (status) {
    case 'Verified':
      return 'status-verified';
    case 'Pending Verification':
      return 'status-pending';
    case 'Signed':
      return 'status-signed';
    case 'Rejected':
      return 'status-rejected';
    case 'Expired':
      return 'status-expired';
    default:
      return 'status-default';
  }
}

function renderEAFStatus(documents) {
  const eafDocuments = documents.filter(doc => doc.document_type === 'EAF');
  
  const eafStats = {
    total: eafDocuments.length,
    verified: eafDocuments.filter(doc => doc.status === 'Verified').length,
    signed: eafDocuments.filter(doc => doc.status === 'Signed').length,
    pending: eafDocuments.filter(doc => doc.status === 'Pending Verification').length
  };

  const eafHTML = `
    <div class="row">
      <div>
        <b>Total EAFs</b><br>
        <small>All accountability forms</small>
      </div>
      <b>${eafStats.total}</b>
    </div>
    <div class="row">
      <div>
        <b>Verified</b><br>
        <small>Compliance confirmed</small>
      </div>
      <span class="tag status-verified">${eafStats.verified}</span>
    </div>
    <div class="row">
      <div>
        <b>Signed</b><br>
        <small>Digital signatures</small>
      </div>
      <span class="tag status-signed">${eafStats.signed}</span>
    </div>
    <div class="row">
      <div>
        <b>Pending</b><br>
        <small>Awaiting verification</small>
      </div>
      <span class="tag status-pending">${eafStats.pending}</span>
    </div>
  `;

  $('#eafStatus').innerHTML = eafHTML;
}

async function loadRecentActivity() {
  try {
    const response = await api('documents/activity');
    const activities = response.activities || response;

    const activityHTML = activities.map(activity => `
      <div class="row">
        <div>
          <b>${activity.action}</b><br>
          <small>${activity.document_type} · ${activity.reference_no}</small>
        </div>
        <small>${new Date(activity.created_at).toLocaleString()}</small>
      </div>
    `).join('');

    $('#recentDocActivity').innerHTML = activityHTML;
  } catch (error) {
    console.error('Error loading recent activity:', error);
  }
}

function loadCourierTracking(documents) {
  const courierDocs = documents.filter(doc => 
    doc.document_type === 'Receipt' || doc.document_type === 'Invoice'
  );

  const courierHTML = courierDocs.map(doc => `
    <div class="row">
      <div>
        <b>${doc.document_type}</b><br>
        <small>${doc.reference_no} · ${doc.owner}</small>
      </div>
      <span class="tag ${getDocStatusClass(doc.status)}">${doc.status}</span>
    </div>
  `).join('');

  $('#courierTracking').innerHTML = courierHTML || '<p class="muted">No courier/invoice documents to track</p>';
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

// Add Document Modal
$('#addDocumentBtn').onclick = () => $('#addDocumentModal').showModal();
$('#closeDocument').onclick = () => $('#addDocumentModal').close();

$('#addDocumentForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const response = await fetch('/api/v1/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData)),
  });

  if (response.ok) {
    $('#addDocumentModal').close();
    e.target.reset();
    loadDocumentData();
  } else {
    alert('Failed to create document');
  }
};

// Search functionality
$('#searchDocuments').oninput = (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#documentTable tbody tr');
  
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
    loadDocumentData();
  }
};

// Document action functions
window.viewDocument = async (docId) => {
  try {
    const response = await api(`documents/${docId}`);
    const doc = response.document;
    alert(`Document Details:\nType: ${doc.document_type}\nReference #: ${doc.reference_no}\nOwner: ${doc.owner}\nStatus: ${doc.status}\nDescription: ${doc.description || 'N/A'}\nCreated: ${new Date(doc.created_at).toLocaleDateString()}\nDue Date: ${doc.due_date ? new Date(doc.due_date).toLocaleDateString() : 'N/A'}\nRelated PO: ${doc.related_po || 'N/A'}`);
  } catch (error) {
    console.error('Error viewing document:', error);
  }
};

window.updateDocStatus = (docId, currentStatus) => {
  const newStatus = prompt(`Current status: ${currentStatus}\nEnter new status (Verified, Pending Verification, Signed, Rejected, Expired):`);
  if (newStatus) {
    updateDocumentStatus(docId, newStatus);
  }
};

async function updateDocumentStatus(docId, newStatus) {
  try {
    const response = await fetch(`/api/v1/documents/${docId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    if (response.ok) {
      loadDocumentData();
    } else {
      alert('Failed to update document status');
    }
  } catch (error) {
    console.error('Error updating document status:', error);
    alert('Error updating document status');
  }
}

window.signDocument = async (docId) => {
  try {
    const signature = prompt('Enter your digital signature (name):');
    if (signature) {
      const response = await fetch(`/api/v1/documents/${docId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });

      if (response.ok) {
        alert('Document signed successfully');
        loadDocumentData();
      } else {
        alert('Failed to sign document');
      }
    }
  } catch (error) {
    console.error('Error signing document:', error);
    alert('Error signing document');
  }
};

// Load document data on page load
loadDocumentData();
