// ==========================================
// SUPPLIER/VENDOR MANAGEMENT PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let allSuppliers = [];

async function loadSupplierData() {
  const table = $('#supplierTable');
  try {
    const response = await api('suppliers');
    allSuppliers = Array.isArray(response.suppliers) ? response.suppliers : (Array.isArray(response) ? response : []);

    const total = allSuppliers.length;
    const topPerformers = allSuppliers.filter((s) => (s.rating || 0) >= 4).length;
    const avgOnTime = total ? Math.round(allSuppliers.reduce((s, v) => s + (parseFloat(v.on_time_rate) || 0), 0) / total) : 0;
    const avgDefect = total ? Math.round(allSuppliers.reduce((s, v) => s + (parseFloat(v.defect_rate) || 0), 0) / total) : 0;

    setText('totalSuppliers', total);
    setText('topPerformers', topPerformers);
    setText('avgOnTime', avgOnTime + '%');
    setText('avgDefect', avgDefect + '%');

    renderSupplierTable(allSuppliers);
  } catch (error) {
    console.error('Error loading supplier data:', error);
    if (table) table.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load suppliers.</p>';
  }
}

// TRD §6 — systematic performance tiering. Computed dynamically from the
// three dashboard scorecard metrics (rating, on-time rate, defect rate).
function supplierTier(s) {
  const rating = parseFloat(s.rating) || 0;
  const otd = parseFloat(s.on_time_rate) || 0;
  const defect = parseFloat(s.defect_rate) || 0;
  if (rating >= 4.5 && otd >= 95 && defect <= 2) return { label: 'Strategic', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: 'military_tech' };
  if (rating >= 4 && otd >= 85 && defect <= 5) return { label: 'Preferred', cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: 'verified' };
  if (rating >= 3 && otd >= 75 && defect <= 10) return { label: 'Approved', cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'check_circle' };
  return { label: 'Probationary', cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: 'warning' };
}

function renderSupplierTable(suppliers) {
  const el = $('#supplierTable');
  if (!el) return;
  if (!suppliers.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No suppliers yet. Click "Add Supplier" to create one.</p>';
    return;
  }
  el.innerHTML = `
    <table class="data-table w-full text-sm">
      <thead>
        <tr><th>Supplier</th><th>Tier</th><th>Category</th><th>Rating</th><th>On-Time</th><th>Defects</th><th>Contact</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${suppliers.map((s) => {
          const t = supplierTier(s);
          return `
          <tr>
            <td><b>${esc(s.name)}</b></td>
            <td><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-bold ${t.cls}" title="Computed from rating, on-time %, and defect rate"><span class="material-symbols-outlined text-sm">${t.icon}</span>${t.label}</span></td>
            <td>${esc(s.category)}</td>
            <td>★ ${(parseFloat(s.rating) || 0).toFixed(1)}</td>
            <td>${esc(s.on_time_rate ?? 0)}%</td>
            <td>${esc(s.defect_rate ?? 0)}%</td>
            <td class="text-xs"><div>${esc(s.email || '—')}</div><div class="text-slate-400">${esc(s.phone || '')}</div></td>
            <td class="whitespace-nowrap">
              <button class="action-btn action-btn-edit !px-2" title="Edit supplier" aria-label="Edit supplier" onclick="editSupplier(${s.id})"><span class="material-symbols-outlined text-base">edit</span></button>
              <button class="action-btn action-btn-danger !px-2" title="Delete supplier" aria-label="Delete supplier" onclick="deleteSupplier(${s.id})"><span class="material-symbols-outlined text-base">delete</span></button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
const supplierModal = $('#addSupplierModal');
const addSupplierBtn = $('#addSupplier');
if (addSupplierBtn && supplierModal) {
  addSupplierBtn.onclick = () => supplierModal.showModal ? supplierModal.showModal() : supplierModal.setAttribute('open', 'open');
}
const closeSupplierModal = $('#closeSupplierModal');
if (closeSupplierModal && supplierModal) {
  closeSupplierModal.onclick = () => supplierModal.close ? supplierModal.close() : supplierModal.removeAttribute('open');
}

const addSupplierForm = $('#addSupplierForm');
if (addSupplierForm) {
  addSupplierForm.onsubmit = async (e) => {
    e.preventDefault();
    const response = await fetch('/api/v1/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target).entries())),
    });
    if (response.ok) {
      supplierModal?.close?.();
      e.target.reset();
      loadSupplierData();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to create supplier');
    }
  };
}

// Search + category filter
const supplierSearch = $('#supplierSearch');
const supplierCategoryFilter = $('#categoryFilter');
function applySupplierFilters() {
  const term = (supplierSearch?.value || '').toLowerCase();
  const cat = supplierCategoryFilter?.value || '';
  const filtered = allSuppliers.filter((s) => {
    const matchesTerm = !term || `${s.name} ${s.email} ${s.category}`.toLowerCase().includes(term);
    const matchesCat = !cat || s.category === cat;
    return matchesTerm && matchesCat;
  });
  renderSupplierTable(filtered);
}
if (supplierSearch) supplierSearch.oninput = applySupplierFilters;
if (supplierCategoryFilter) supplierCategoryFilter.onchange = applySupplierFilters;

// ---- Edit / Delete supplier (Admin/Manager actions) --------------------
const editSupplierModal = $('#editSupplierModal');

window.editSupplier = (id) => {
  const s = allSuppliers.find((x) => x.id === id);
  if (!s) return;
  $('#editSupplierId').value = s.id;
  $('#editSupplierName').value = s.name || '';
  $('#editSupplierCategory').value = s.category || '';
  $('#editSupplierEmail').value = s.email || '';
  $('#editSupplierPhone').value = s.phone || '';
  editSupplierModal?.showModal();
};

$('#closeEditSupplierModal')?.addEventListener('click', () => editSupplierModal?.close());

$('#editSupplierForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#editSupplierId').value;
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  const res = await fetch(`/api/v1/suppliers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: $('#editSupplierName').value.trim(),
      category: $('#editSupplierCategory').value.trim(),
      email: $('#editSupplierEmail').value.trim(),
      phone: $('#editSupplierPhone').value.trim(),
    }),
  });
  btn.disabled = false;
  if (res.ok) { editSupplierModal?.close(); loadSupplierData(); }
  else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Failed to update supplier');
  }
});

window.deleteSupplier = async (id) => {
  const s = allSuppliers.find((x) => x.id === id);
  const ok = await (window.scimConfirm ? scimConfirm({
    title: 'Delete Supplier?',
    message: `This will permanently remove ${s ? s.name : 'this supplier'} from the vendor directory. This action cannot be undone.`,
    confirmLabel: 'Delete',
    icon: 'business',
  }) : Promise.resolve(confirm('Delete this supplier?')));
  if (!ok) return;
  const res = await fetch(`/api/v1/suppliers/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (res.ok) { loadSupplierData(); }
  else alert(data.error || 'Failed to delete supplier');
};

// Supplier Quotes — relocated from Procurement & Sourcing (TRD §5).
let allQuotes = [];
async function loadQuotes() {
  const el = $('#quotesTable');
  if (!el) return;
  const res = await api('procurement/quotes').catch(() => ({}));
  allQuotes = Array.isArray(res.quotes) ? res.quotes : [];
  renderQuotes();
}
function renderQuotes() {
  const el = $('#quotesTable');
  if (!el) return;
  const term = ($('#quotesSearch')?.value || '').toLowerCase();
  const rows = allQuotes.filter((q) => !term || `${q.vendor} ${q.vendor_name || ''} ${q.req_number || ''} ${q.status || ''}`.toLowerCase().includes(term));
  el.innerHTML = rows.length ? `<table class="data-table w-full text-sm min-w-[560px]">
    <thead><tr><th>Requisition</th><th>Supplier</th><th>Quoted Price</th><th>Status</th></tr></thead>
    <tbody>${rows.map((q) => `<tr>
      <td><span class="tag">${esc(q.req_number || '—')}</span></td>
      <td><b>${esc(q.vendor_name || q.vendor || '—')}</b></td>
      <td class="font-mono">₱${Number(q.quote_amount || q.amount || q.quoted_price || 0).toLocaleString()}</td>
      <td><span class="px-2 py-1 rounded-full text-xs font-semibold ${q.status === 'Accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${esc(q.status || 'Submitted')}</span></td>
    </tr>`).join('')}</tbody></table>`
    : '<p class="text-sm text-slate-400 py-6 text-center">No supplier quotes yet.</p>';
}
const quotesSearchEl = document.getElementById('quotesSearch');
if (quotesSearchEl) quotesSearchEl.oninput = renderQuotes;

document.addEventListener('DOMContentLoaded', function () {
  if (typeof initializePermissions === 'function') initializePermissions();
  loadSupplierData();
  loadQuotes();
});

// ==========================================
// SUPPLIER ITEM CATALOGS — pricing index from sourcing quotes
// ==========================================
let catalogItems = [];

async function loadCatalog() {
  const el = $('#catalogList');
  if (!el) return;
  const res = await fetch('/api/v1/procurement/quotes');
  const data = await res.json().catch(() => ({}));
  catalogItems = Array.isArray(data.quotes) ? data.quotes : [];
  renderCatalog();
}

function renderCatalog() {
  const el = $('#catalogList');
  if (!el) return;
  const term = ($('#catalogSearch')?.value || '').toLowerCase();
  const rows = catalogItems.filter((q) =>
    !term || `${q.vendor} ${q.req_number} ${q.notes || ''}`.toLowerCase().includes(term));
  if (!rows.length) {
    el.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">No catalog entries yet — approved sourcing quotes appear here.</p>';
    return;
  }
  el.innerHTML = `
    <table class="w-full text-sm min-w-[520px]">
      <thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">Requisition</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Approved Seller</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Quoted Price</th>
        <th class="py-2 font-medium text-slate-600">Status</th>
      </tr></thead>
      <tbody>${rows.map((q) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="py-2.5 pr-4 font-semibold text-slate-900">${q.req_number || '—'}</td>
          <td class="py-2.5 pr-4 text-slate-600">${q.vendor || '—'}</td>
          <td class="py-2.5 pr-4 text-slate-900 font-medium">₱${Number(q.quote_amount || 0).toLocaleString()}</td>
          <td class="py-2.5"><span class="px-2 py-1 rounded-full text-xs font-semibold ${q.status === 'Accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${q.status}</span></td>
        </tr>`).join('')}</tbody>
    </table>`;
}

const catalogSearchEl = document.getElementById('catalogSearch');
if (catalogSearchEl) catalogSearchEl.oninput = renderCatalog;
loadCatalog();


if (window.initHubTabs) initHubTabs('directory');
