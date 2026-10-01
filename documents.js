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
            <td class="whitespace-nowrap">
              <button class="action-btn action-btn-view !px-2" title="View document" aria-label="View document" onclick="viewDocument(${doc.id})"><span class="material-symbols-outlined text-base">visibility</span></button>
              <button class="action-btn action-btn-view !px-2" title="Download record" aria-label="Download record" onclick="downloadDocument(${doc.id})"><span class="material-symbols-outlined text-base">download</span></button>
              ${(typeof currentUserRole === 'undefined' || currentUserRole === 'Admin') ? `<button class="action-btn action-btn-view !px-2" title="Archive document" aria-label="Archive document" onclick="archiveRecord('document', ${doc.id}, () => loadDocumentData())"><span class="material-symbols-outlined text-base">archive</span></button>` : ''}
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

// Document action functions — dedicated modal cards (view-only per TRD §6)
const viewDocModal = $('#viewDocumentModal');

$('#closeViewDocModal')?.addEventListener('click', () => viewDocModal?.close());

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

// Document download — exports the tracked record instantly
window.downloadDocument = (docId) => {
  const doc = allDocuments.find((d) => d.id === docId);
  if (!doc) return;
  const lines = [
    'DOCUMENT RECORD — Great Solomon SCIM',
    '='.repeat(40),
    `Reference:  ${doc.reference_no}`,
    `Type:       ${doc.document_type}`,
    `Owner:      ${doc.owner}`,
    `Status:     ${doc.status}`,
    `Related PO: ${doc.related_po || 'N/A'}`,
    `Due Date:   ${doc.due_date || 'N/A'}`,
    `Created:    ${doc.created_at || 'N/A'}`,
    '',
    'Description:',
    doc.description || 'None.',
  ].join('\n');
  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.reference_no || 'document'}.txt`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
};

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

// ==========================================
// COMPLIANCE ASSET CLEARANCE (outbound → Core 3)
// ==========================================
async function loadClearances() {
  const el = $('#clearanceList');
  if (!el) return;
  const res = await fetch('/api/v1/clearances');
  const data = await res.json().catch(() => ({}));
  const checklist = Array.isArray(data.checklist) ? data.checklist : [];
  const tokens = Array.isArray(data.tokens) ? data.tokens : [];

  el.innerHTML = `
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Pending Clearances — unreturned assets</p>
    ${checklist.length === 0
      ? '<p class="text-slate-500 text-sm py-2">No employees hold unreturned assets.</p>'
      : checklist.map((c) => `
        <div class="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 mb-2">
          <div class="flex justify-between items-center">
            <span class="text-sm font-semibold text-slate-800">${c.employee}</span>
            <span class="text-xs font-bold text-amber-700">${c.unreturned} item(s) out</span>
          </div>
          <p class="text-xs text-slate-500 mt-1 break-all">${c.items || ''}</p>
        </div>`).join('')}
    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-6 mb-3">Issued Clearance Tokens</p>
    ${tokens.length === 0
      ? '<p class="text-slate-500 text-sm py-2">No clearance tokens issued yet.</p>'
      : tokens.map((t) => `
        <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 mb-2">
          <div>
            <p class="text-sm font-semibold text-emerald-900">${t.employee_name}</p>
            <code class="text-[11px] font-mono text-emerald-700">${t.token}</code>
          </div>
          <div class="text-right">
            <span class="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">${t.status}</span>
            <p class="text-[11px] text-slate-500 mt-1">${t.issued_at ? new Date(t.issued_at).toLocaleString() : ''}</p>
          </div>
        </div>`).join('')}`;
}

// ==========================================
// IMMUTABLE AUDIT HISTORY — append-only scan ledger
// ==========================================
let auditPage = 1;
let auditItems = [];
let auditTotal = 0;
let auditPages = 1;

async function loadAudit() {
  const res = await fetch(`/api/v1/scan-logs?page=${auditPage}&per_page=15`);
  const data = await res.json().catch(() => ({}));
  auditItems = Array.isArray(data.items) ? data.items : [];
  auditTotal = data.total || 0;
  auditPages = data.pages || 1;
  renderAudit();
}

function renderAudit() {
  const el = $('#auditList');
  if (!el) return;
  const term = ($('#auditSearch')?.value || '').toLowerCase();
  const rows = auditItems.filter((s) =>
    !term || `${s.qr_code} ${s.action} ${s.scanned_by} ${s.details || ''}`.toLowerCase().includes(term));
  el.innerHTML = rows.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-6">No audit entries recorded.</p>'
    : `<table class="w-full text-sm min-w-[640px]">
        <thead><tr class="border-b border-slate-200 text-left">
          <th class="py-2 pr-4 font-medium text-slate-600">Timestamp</th>
          <th class="py-2 pr-4 font-medium text-slate-600">Serial / QR</th>
          <th class="py-2 pr-4 font-medium text-slate-600">Action</th>
          <th class="py-2 pr-4 font-medium text-slate-600">Details</th>
          <th class="py-2 font-medium text-slate-600">Actor</th>
        </tr></thead>
        <tbody>${rows.map((s) => `
          <tr class="border-b border-slate-100 ${Number(s.collision) ? 'bg-red-50/60' : ''}">
            <td class="py-2.5 pr-4 text-slate-500 text-xs whitespace-nowrap">${new Date(s.created_at).toLocaleString()}</td>
            <td class="py-2.5 pr-4 font-mono text-xs text-slate-800">${s.qr_code || '—'}</td>
            <td class="py-2.5 pr-4 font-semibold ${Number(s.collision) ? 'text-red-600' : 'text-slate-900'}">${s.action}${Number(s.collision) ? ' ⚠' : ''}</td>
            <td class="py-2.5 pr-4 text-slate-500 text-xs">${s.details || ''}</td>
            <td class="py-2.5 text-slate-600 text-xs">${s.scanned_by || '—'}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  const pager = $('#auditPager');
  if (pager) {
    pager.innerHTML = `
      <span class="text-xs text-slate-500">${auditTotal} entries — page ${auditPage} of ${auditPages}</span>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${auditPage <= 1 ? 'disabled' : ''} onclick="auditPage--; loadAudit();">Prev</button>
        <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${auditPage >= auditPages ? 'disabled' : ''} onclick="auditPage++; loadAudit();">Next</button>
      </div>`;
  }
}

const auditSearchEl = document.getElementById('auditSearch');
if (auditSearchEl) auditSearchEl.oninput = renderAudit;

loadClearances();
loadAudit();


if (window.initHubTabs) initHubTabs('repository');
