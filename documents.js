// ==========================================
// DOCUMENT TRACKING & LOGISTICS PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let allDocuments = [];

// ==========================================
// DOCUMENT DATA LOADING
// ==========================================
async function loadDocumentData() {
  const table = $('#documentTable');
  try {
    const response = await api('documents');
    allDocuments = Array.isArray(response.documents) ? response.documents : [];

    const total = allDocuments.length;
    const pending = allDocuments.filter((d) => d.status === 'Pending Verification' || d.status === 'Pending').length;
    const verified = allDocuments.filter((d) => d.status === 'Verified' || d.status === 'Signed').length;
    const compliance = total ? Math.round((verified / total) * 100) : 0;

    setText('totalDocuments', total);
    setText('verifiedDocuments', verified);
    setText('pendingDocuments', pending);
    setText('complianceRate', compliance + '%');

    renderDocumentTable(allDocuments);
    loadCourierReceipts(allDocuments);
    loadRecentActivity();
  } catch (error) {
    console.error('Error loading document data:', error);
    if (table) table.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load documents.</p>';
  }
}

function renderDocumentTable(documents) {
  const el = $('#documentTable');
  if (!el) return;
  if (!documents.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No documents yet. Click "Add Document" to create one.</p>';
    return;
  }
  el.innerHTML = `
    <table class="data-table w-full text-sm">
      <thead>
        <tr><th>Type</th><th>Reference #</th><th>Owner</th><th>Status</th><th>Created</th><th>Due Date</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${documents.map((doc) => `
          <tr>
            <td><b>${esc(doc.document_type)}</b></td>
            <td><span class="tag">${esc(doc.reference_no)}</span></td>
            <td>${esc(doc.owner)}</td>
            <td><span class="tag">${esc(doc.status)}</span></td>
            <td>${doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}</td>
            <td>${doc.due_date ? new Date(doc.due_date).toLocaleDateString() : '—'}</td>
            <td>
              <button class="action-btn action-btn-view" onclick="viewDocument(${doc.id})">View</button>
              <button class="action-btn action-btn-edit" onclick="updateDocStatus(${doc.id}, '${esc(doc.status)}')">Update</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function loadCourierReceipts(documents) {
  const el = $('#courierReceipts');
  if (!el) return;
  const receipts = documents.filter((d) => ['Receipt', 'Invoice', 'Delivery Receipt', 'Courier'].includes(d.document_type));
  el.innerHTML = receipts.length
    ? receipts.slice(0, 8).map((doc) => `
        <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
          <div>
            <b class="text-sm">${esc(doc.document_type)}</b>
            <p class="text-xs text-slate-500">${esc(doc.reference_no)} · ${esc(doc.owner)}</p>
          </div>
          <span class="tag">${esc(doc.status)}</span>
        </div>`).join('')
    : '<p class="text-sm text-slate-400 py-6 text-center">No courier receipts to track.</p>';
}

async function loadRecentActivity() {
  const el = $('#documentActivity');
  if (!el) return;
  try {
    const response = await api('documents/activity');
    const activities = Array.isArray(response.activities) ? response.activities : [];
    el.innerHTML = activities.length
      ? activities.map((a) => `
          <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
            <div>
              <b class="text-sm">${esc(a.action)}</b>
              <p class="text-xs text-slate-500">${esc(a.reference_no || '')} ${a.details ? '· ' + esc(a.details) : ''}</p>
            </div>
            <small class="text-slate-400">${a.created_at ? new Date(a.created_at).toLocaleString() : ''}</small>
          </div>`).join('')
      : '<p class="text-sm text-slate-400 py-6 text-center">No document activity yet.</p>';
  } catch (error) {
    console.error('Error loading activity:', error);
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================
const addDocModal = $('#addDocumentModal');
const addDocumentBtn = $('#addDocument');
if (addDocumentBtn && addDocModal) {
  addDocumentBtn.onclick = () => addDocModal.showModal ? addDocModal.showModal() : addDocModal.setAttribute('open', 'open');
}
const closeDocumentModal = $('#closeDocumentModal');
if (closeDocumentModal && addDocModal) {
  closeDocumentModal.onclick = () => addDocModal.close ? addDocModal.close() : addDocModal.removeAttribute('open');
}

const addDocumentForm = $('#addDocumentForm');
if (addDocumentForm) {
  addDocumentForm.onsubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('/api/v1/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    if (response.ok) {
      addDocModal?.close?.();
      e.target.reset();
      loadDocumentData();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to create document');
    }
  };
}

// Search + status filter (client-side over loaded docs)
const docSearch = $('#documentSearch');
const statusFilter = $('#statusFilter');
function applyDocFilters() {
  const term = (docSearch?.value || '').toLowerCase();
  const status = statusFilter?.value || '';
  const filtered = allDocuments.filter((d) => {
    const matchesTerm = !term || `${d.document_type} ${d.reference_no} ${d.owner}`.toLowerCase().includes(term);
    const matchesStatus = !status || d.status === status;
    return matchesTerm && matchesStatus;
  });
  renderDocumentTable(filtered);
}
if (docSearch) docSearch.oninput = applyDocFilters;
if (statusFilter) statusFilter.onchange = applyDocFilters;

// Document action functions — dedicated modal cards
const viewDocModal = $('#viewDocumentModal');
const updateDocModal = $('#updateDocModal');
let updateDocId = null;

$('#closeViewDocModal')?.addEventListener('click', () => viewDocModal?.close());
$('#closeUpdateDocModal')?.addEventListener('click', () => updateDocModal?.close());
$('#updateDocCancel')?.addEventListener('click', () => updateDocModal?.close());

window.viewDocument = async (docId) => {
  try {
    const doc = await api(`documents/${docId}`);
    setText('viewDocRef', doc.reference_no || '');
    setText('viewDocType', doc.document_type || '—');
    setText('viewDocOwner', doc.owner || '—');
    setText('viewDocPO', doc.related_po || '—');
    setText('viewDocSigner', doc.signer_name || '—');
    setText('viewDocDesc', doc.description || 'No description provided.');
    const statusEl = $('#viewDocStatus');
    if (statusEl) statusEl.innerHTML = `<span class="tag">${esc(doc.status || '')}</span>`;
    viewDocModal?.showModal();
  } catch (e) { console.error(e); }
};

window.updateDocStatus = (docId, currentStatus) => {
  const doc = allDocuments.find((d) => d.id === docId);
  updateDocId = docId;
  setText('updateDocRef', doc?.reference_no || '');
  setText('updateDocCurrent', currentStatus);
  const sel = $('#updateDocSelect');
  if (sel) {
    const opts = Array.from(sel.options).map((o) => o.value);
    sel.value = opts.includes(currentStatus) ? currentStatus : sel.options[0].value;
  }
  updateDocModal?.showModal();
};

$('#updateDocSave')?.addEventListener('click', async () => {
  const newStatus = $('#updateDocSelect')?.value;
  if (!newStatus || updateDocId == null) return;
  const btn = $('#updateDocSave');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const res = await fetch(`/api/v1/documents/${updateDocId}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
  });
  btn.disabled = false;
  btn.textContent = 'Save Status';
  if (res.ok) { updateDocModal?.close(); loadDocumentData(); }
  else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Failed to update document status');
  }
});

window.signDocument = async (docId) => {
  const signature = prompt('Enter your name as digital signature:');
  if (!signature) return;
  const res = await fetch(`/api/v1/documents/${docId}/sign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature }),
  });
  if (res.ok) { alert('Document signed'); loadDocumentData(); }
  else alert('Failed to sign document');
};

const viewAllReceiptsBtn = $('#viewAllReceipts');
if (viewAllReceiptsBtn) {
  viewAllReceiptsBtn.onclick = () => $('#courierReceipts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', function () {
  if (typeof initializePermissions === 'function') initializePermissions();
  loadDocumentData();
});
