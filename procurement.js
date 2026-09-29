// ==========================================
// PROCUREMENT & SOURCING MANAGEMENT PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount || 0);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ==========================================
// PROCUREMENT DATA LOADING
// ==========================================
async function loadProcurementData(showAll = false) {
  const table = $('#requisitionsTable');
  if (table && !showAll) table.innerHTML = '<p class="text-sm text-slate-400 py-4">Loading requisitions...</p>';
  try {
    const response = await api('procurement/requisitions');
    const requisitions = Array.isArray(response.requisitions) ? response.requisitions : [];
    const displayRequisitions = showAll ? requisitions : requisitions.slice(0, 10);

    const active = requisitions.filter((r) => !['Completed', 'Cancelled', 'Closed', 'Rejected'].includes(r.status)).length;
    const pending = requisitions.filter((r) => ['Submitted', 'Pending', 'Pending Quote', 'Under Review'].includes(r.status)).length;
    const pipeline = requisitions.reduce((sum, r) => sum + (parseFloat(r.actual_cost) || parseFloat(r.estimated_cost) || 0), 0);

    setText('totalRequisitions', requisitions.length);
    setText('pendingRequisitions', pending || active);
    setText('pipelineValue', money(pipeline));

    renderRequisitionTable(displayRequisitions);
    renderSourcingPipeline(requisitions);
    loadRecentQuotes(showAll);
  } catch (error) {
    console.error('Error loading procurement data:', error);
    if (table) table.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load requisitions.</p>';
  }
}

function renderRequisitionTable(requisitions) {
  const el = $('#requisitionsTable');
  if (!el) return;
  if (!requisitions.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No requisitions yet. Click "New Requisition" to create one.</p>';
    return;
  }
  el.innerHTML = `
    <table class="data-table w-full text-sm">
      <thead>
        <tr>
          <th>Req #</th><th>Title</th><th>Department</th><th>Priority</th>
          <th>Est. Cost</th><th>Status</th><th>Needed By</th>
        </tr>
      </thead>
      <tbody>
        ${requisitions.map((req) => `
          <tr>
            <td><span class="tag">${esc(req.req_number)}</span></td>
            <td><b>${esc(req.title)}</b></td>
            <td>${esc(req.department)}</td>
            <td><span class="tag">${esc(req.priority)}</span></td>
            <td>${money(req.estimated_cost)}</td>
            <td><span class="tag">${esc(req.status)}</span></td>
            <td>${req.needed_by ? new Date(req.needed_by).toLocaleDateString() : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

function renderSourcingPipeline(requisitions) {
  const el = $('#sourcingPipeline');
  if (!el) return;
  const stages = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Completed'];
  const counts = Object.fromEntries(stages.map((s) => [s, 0]));
  requisitions.forEach((r) => {
    const s = counts.hasOwnProperty(r.status) ? r.status : 'Submitted';
    counts[s]++;
  });
  const max = Math.max(1, ...Object.values(counts));
  el.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-5 gap-4">
      ${Object.entries(counts).map(([stage, count]) => `
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-slate-600">${stage}</span>
            <span class="text-sm font-bold text-primary">${count}</span>
          </div>
          <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div class="h-full bg-primary rounded-full" style="width:${Math.round((count / max) * 100)}%"></div>
          </div>
        </div>`).join('')}
    </div>`;
}

async function loadRecentQuotes(showAll = false) {
  const el = $('#quotesTable');
  if (!el) return;
  try {
    const response = await api('procurement/quotes');
    const quotes = Array.isArray(response.quotes) ? response.quotes : [];
    setText('totalQuotes', quotes.length);
    const display = showAll ? quotes : quotes.slice(0, 5);
    el.innerHTML = display.length
      ? display.map((q) => `
          <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
            <div>
              <b class="text-sm">${esc(q.vendor)}</b>
              <p class="text-xs text-slate-500">${esc(q.req_number)} · ${money(q.quote_amount)}</p>
            </div>
            <span class="tag">${esc(q.status)}</span>
          </div>`).join('')
      : '<p class="text-sm text-slate-400 py-6 text-center">No supplier quotes yet.</p>';
  } catch (error) {
    console.error('Error loading quotes:', error);
    el.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load quotes.</p>';
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================
const addRequisitionBtn = $('#addRequisition');
const reqModal = $('#addRequisitionModal');
if (addRequisitionBtn && reqModal) {
  addRequisitionBtn.onclick = () => reqModal.showModal ? reqModal.showModal() : reqModal.setAttribute('open', 'open');
}
const closeRequisitionModal = $('#closeRequisitionModal');
if (closeRequisitionModal && reqModal) {
  closeRequisitionModal.onclick = () => reqModal.close ? reqModal.close() : reqModal.removeAttribute('open');
}

const addRequisitionForm = $('#addRequisitionForm');
if (addRequisitionForm) {
  addRequisitionForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const response = await fetch('/api/v1/procurement/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      reqModal?.close?.();
      e.target.reset();
      loadProcurementData();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to create requisition');
    }
  };
}

const viewAllRequisitionsBtn = $('#viewAllRequisitions');
if (viewAllRequisitionsBtn) {
  viewAllRequisitionsBtn.onclick = () => loadProcurementData(true).then(() => {
    $('#requisitionsTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const viewAllQuotesBtn = $('#viewAllQuotes');
if (viewAllQuotesBtn) {
  viewAllQuotesBtn.onclick = () => loadRecentQuotes(true).then(() => {
    $('#quotesTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  if (typeof initializePermissions === 'function') initializePermissions();
  loadProcurementData();
});
