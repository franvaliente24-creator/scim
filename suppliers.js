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
    renderAttentionSuppliers(allSuppliers);
  } catch (error) {
    console.error('Error loading supplier data:', error);
    if (table) table.innerHTML = '<p class="text-sm text-red-500 py-4">Could not load suppliers.</p>';
  }
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
        <tr><th>Supplier</th><th>Category</th><th>Rating</th><th>On-Time</th><th>Defects</th><th>Contact</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${suppliers.map((s) => `
          <tr>
            <td><b>${esc(s.name)}</b></td>
            <td>${esc(s.category)}</td>
            <td>★ ${(parseFloat(s.rating) || 0).toFixed(1)}</td>
            <td>${esc(s.on_time_rate ?? 0)}%</td>
            <td>${esc(s.defect_rate ?? 0)}%</td>
            <td>${esc(s.email || s.phone || '—')}</td>
            <td class="whitespace-nowrap">
              <button class="action-btn action-btn-edit" onclick="editSupplier(${s.id})">Edit</button>
              <button class="action-btn action-btn-danger" onclick="deleteSupplier(${s.id})">Delete</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAttentionSuppliers(suppliers) {
  const el = $('#attentionNeeded');
  if (!el) return;
  const attention = suppliers.filter((s) => (s.on_time_rate || 0) < 75 || (s.defect_rate || 0) > 10 || (s.rating || 5) < 3);
  el.innerHTML = attention.length
    ? attention.map((s) => `
        <div class="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
          <div>
            <b class="text-sm">${esc(s.name)}</b>
            <p class="text-xs text-slate-500">${s.on_time_rate || 0}% on-time · ${s.defect_rate || 0}% defects</p>
          </div>
          <span class="tag">Needs Review</span>
        </div>`).join('')
    : '<p class="text-sm text-slate-400 py-6 text-center">All suppliers performing well.</p>';
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
  $('#editSupplierAddress').value = s.address || '';
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
      address: $('#editSupplierAddress').value.trim(),
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

document.addEventListener('DOMContentLoaded', function () {
  if (typeof initializePermissions === 'function') initializePermissions();
  loadSupplierData();
});
