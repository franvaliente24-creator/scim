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

// §6 — systematic performance tiering. Computed dynamically from the three
// dashboard scorecard metrics (rating, on-time rate, defect rate).
function supplierTier(s) {
  const rating = parseFloat(s.rating) || 0;
  const otd = parseFloat(s.on_time_rate) || 0;
  const defect = parseFloat(s.defect_rate) || 0;
  if (rating >= 4.5 && otd >= 95 && defect <= 2) return { label: 'Strategic Partner', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: 'military_tech' };
  if (rating >= 4 && otd >= 85 && defect <= 5) return { label: 'Tier 1 Supplier', cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: 'verified' };
  if (rating >= 3 && otd >= 75 && defect <= 10) return { label: 'Preferred Vendor', cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'check_circle' };
  return { label: 'Probationary', cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: 'warning' };
}

// Compliance summary chip — flags expired COI and missing clearances.
function complianceSummary(s) {
  const flags = [];
  if (s.coi_expiry && new Date(s.coi_expiry) < new Date()) flags.push('<span class="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold" title="Certificate of Insurance expired">COI EXPIRED</span>');
  if (!Number(s.tax_compliant)) flags.push('<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold" title="Tax registration not marked compliant">TAX</span>');
  if (!Number(s.anti_bribery_clear)) flags.push('<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold" title="No anti-bribery clearance on file">ABC</span>');
  return flags.length ? flags.join(' ') : '<span class="text-emerald-600 text-[10px] font-bold">COMPLIANT</span>';
}

let supplierPage = 1;
const SUP_PAGE = 12;

// §Supplier Partner Status — verification badge colours.
const VERIFICATION_BADGE = (v) => {
  const map = { Verified: 'bg-emerald-100 text-emerald-700', 'In Review': 'bg-blue-100 text-blue-700',
                Suspended: 'bg-red-100 text-red-700' };
  return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${map[v] || 'bg-amber-100 text-amber-700'}">${esc(v || 'Pending')}</span>`;
};

function renderSupplierTable(suppliers) {
  const el = $('#supplierTable');
  if (!el) return;
  if (!suppliers.length) {
    el.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No suppliers yet. Click "Add Supplier" to create one.</p>';
    const p = $('#supplierPager'); if (p) p.innerHTML = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(suppliers.length / SUP_PAGE));
  if (supplierPage > pages) supplierPage = pages;
  const slice = suppliers.slice((supplierPage - 1) * SUP_PAGE, supplierPage * SUP_PAGE);
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';
  const canArchive = isAdmin || currentUserRole === 'Manager';
  el.innerHTML = `
    <table class="data-table w-full text-sm">
      <thead>
        <tr><th>Supplier</th><th>Status</th><th>Verification</th><th>Tier</th><th>Compliance</th><th>Rating</th><th>On-Time</th><th>Defects</th><th class="text-right">Actions</th></tr>
      </thead>
      <tbody>
        ${slice.map((s) => {
          const t = supplierTier(s);
          const active = (s.status || 'Active') === 'Active';
          const autoPO = Number(s.auto_approve) === 1;
          return `
          <tr>
            <td><b>${esc(s.name)}</b><div class="text-[10px] text-slate-400 font-mono">${esc(s.vendor_code || '—')}</div>${autoPO ? '<span class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold" title="Auto-PO Approval — Inventory may send POs without procurement review">PRE-CLEARED</span>' : ''}</td>
            <td><span class="inline-flex items-center gap-1 text-[11px] font-bold ${active ? 'text-emerald-600' : 'text-slate-400'}"><span class="h-2 w-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}"></span>${active ? 'Active' : 'Inactive'}</span></td>
            <td>${VERIFICATION_BADGE(s.verification_status)}<div class="text-[10px] text-slate-400 mt-0.5">${esc(s.onboarding_stage || 'Supplier Intake')}</div></td>
            <td><span class="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-bold ${t.cls}" title="Computed from rating, on-time %, and defect rate"><span class="material-symbols-outlined text-sm">${t.icon}</span>${t.label}</span></td>
            <td>${complianceSummary(s)}</td>
            <td>★ ${(parseFloat(s.rating) || 0).toFixed(1)}</td>
            <td>${esc(s.on_time_rate ?? 0)}%</td>
            <td>${esc(s.defect_rate ?? 0)}%</td>
            <td class="whitespace-nowrap text-right">
              <button class="action-btn action-btn-view !px-2" title="View profile" aria-label="View profile" onclick="viewSupplierProfile(${s.id})"><span class="material-symbols-outlined text-base">visibility</span></button>
              ${isAdmin ? `<button class="action-btn action-btn-edit !px-2" title="Edit supplier" aria-label="Edit supplier" onclick="editSupplier(${s.id})"><span class="material-symbols-outlined text-base">edit</span></button>` : ''}
              ${canArchive ? `<button class="action-btn action-btn-danger !px-2" title="Archive supplier" aria-label="Archive supplier" onclick="archiveSupplier(${s.id}, '${esc(s.name).replace(/'/g, "\\'")}')"><span class="material-symbols-outlined text-base">archive</span></button>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  const pager = $('#supplierPager');
  if (pager) pager.innerHTML = `<span class="text-xs text-slate-500">${suppliers.length} suppliers · page ${supplierPage} of ${pages}</span>
    <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${supplierPage <= 1 ? 'disabled' : ''} onclick="supplierPage--; applySupplierFilters()">Prev</button>
    <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${supplierPage >= pages ? 'disabled' : ''} onclick="supplierPage++; applySupplierFilters()">Next</button></div>`;
}

// §Supplier Qualification / Onboarding — the 7-stage verification pipeline.
const ONBOARDING_STAGES = ['Supplier Intake', 'Document Verification', 'Due Diligence',
  'Contract & Agreement', 'System Registration', 'Approval & Activation', 'Ongoing Monitoring'];

function onboardingTracker(stage) {
  const idx = Math.max(0, ONBOARDING_STAGES.indexOf(stage));
  return `<div class="flex items-center gap-1 my-3">${ONBOARDING_STAGES.map((st, i) => `
    <div class="flex-1 text-center">
      <div class="h-1.5 rounded-full ${i <= idx ? 'bg-primary' : 'bg-slate-200'}"></div>
      <div class="text-[9px] mt-1 ${i === idx ? 'font-bold text-primary' : 'text-slate-400'}">${st}</div>
    </div>`).join('')}</div>`;
}

// Comprehensive profile (§Supplier Profile spec): identity, classification,
// verification, contract, compliance, auto-PO, and performance metrics.
window.viewSupplierProfile = (id) => {
  const s = allSuppliers.find((x) => x.id === id);
  if (!s) return;
  const t = supplierTier(s);
  const coiExpired = s.coi_expiry && new Date(s.coi_expiry) < new Date();
  const contractExpired = s.contract_expiry && new Date(s.contract_expiry) < new Date();
  const otif = parseFloat(s.otif_rate ?? s.on_time_rate ?? 0);
  const quality = 100 - (parseFloat(s.defect_rate) || 0);
  const row = (k, v, cls = '') => `<div><dt class="text-xs text-slate-500">${k}</dt><dd class="font-medium ${cls}">${v ?? '—'}</dd></div>`;
  $('#spName').textContent = s.name || 'Supplier Profile';
  $('#spBody').innerHTML = `
    <div class="flex items-center gap-2 mb-2 flex-wrap">
      <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-bold ${t.cls}"><span class="material-symbols-outlined text-sm">${t.icon}</span>${t.label}</span>
      <span class="px-2 py-1 rounded-full text-xs font-bold ${(s.status || 'Active') === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}">${esc(s.status || 'Active')}</span>
      ${VERIFICATION_BADGE(s.verification_status)}
      ${Number(s.auto_approve) ? '<span class="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">Auto-PO Pre-Cleared</span>' : ''}
    </div>
    <p class="text-[10px] uppercase tracking-wide font-bold text-slate-400">Supplier Qualification / Onboarding</p>
    ${onboardingTracker(s.onboarding_stage)}
    <dl class="grid grid-cols-2 gap-3 text-sm">
      ${row('Vendor ID', `<span class="font-mono">${esc(s.vendor_code || 'VND-' + String(s.id).padStart(4, '0'))}</span>`)}
      ${row('Category', esc(s.category))}
      ${row('Contact', `${esc(s.email || '—')}<br>${esc(s.phone || '')}`)}
      ${row('Contract Ref', `<span class="font-mono">${esc(s.contract_ref)}</span>`)}
      ${row('Contract Status', s.contract_ref ? (contractExpired ? 'Expired' : 'On File') : 'None on file', contractExpired ? 'text-red-600' : '')}
      ${row('Contract Expiry', s.contract_expiry ? new Date(s.contract_expiry).toLocaleDateString() + (contractExpired ? ' (EXPIRED)' : '') : null, contractExpired ? 'text-red-600 font-bold' : '')}
      ${row('Compliance', `${Number(s.tax_compliant) ? '✓' : '✗'} tax · ${Number(s.anti_bribery_clear) ? '✓' : '✗'} anti-bribery`)}
      ${row('Certifications', esc(s.certs))}
      ${row('Insurance (COI)', s.coi_expiry ? new Date(s.coi_expiry).toLocaleDateString() + (coiExpired ? ' (EXPIRED)' : '') : 'Not on file', coiExpired ? 'text-red-600 font-bold' : '')}
    </dl>
    <p class="text-[10px] uppercase tracking-wide font-bold text-slate-400 mt-4">Performance Metrics</p>
    <dl class="grid grid-cols-2 gap-3 text-sm">
      ${row('OTIF Rate', otif.toFixed(1) + '%')}
      ${row('Quality Acceptance', quality.toFixed(1) + '%')}
      ${row('Avg. Lead Time', s.lead_time_days != null ? s.lead_time_days + ' days' : null)}
      ${row('Purchase Orders', s.po_count ?? 0)}
      ${row('Late Deliveries', s.late_deliveries ?? 0)}
      ${row('Returns / Discrepancies', s.returns_discrepancies ?? s.discrepancies ?? 0)}
    </dl>`;
  $('#supplierProfileModal')?.showModal();
};
document.getElementById('closeSupplierProfile')?.addEventListener('click', () => $('#supplierProfileModal')?.close());

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
  $('#editSupplierStatus').value = s.status || 'Active';
  $('#editSupplierVerification').value = s.verification_status || 'Pending';
  $('#editSupplierOnboarding').value = s.onboarding_stage || 'Supplier Intake';
  $('#editSupplierContract').value = s.contract_ref || '';
  $('#editSupplierContractExpiry').value = s.contract_expiry || '';
  $('#editSupplierLeadTime').value = s.lead_time_days ?? '';
  $('#editSupplierCerts').value = s.certs || '';
  $('#editSupplierCoi').value = s.coi_expiry || '';
  $('#editSupplierTax').checked = !!Number(s.tax_compliant);
  $('#editSupplierAbc').checked = !!Number(s.anti_bribery_clear);
  $('#editSupplierAutoApprove').checked = !!Number(s.auto_approve);
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
      status: $('#editSupplierStatus').value,
      verification_status: $('#editSupplierVerification').value,
      onboarding_stage: $('#editSupplierOnboarding').value,
      contract_ref: $('#editSupplierContract').value.trim(),
      contract_expiry: $('#editSupplierContractExpiry').value || null,
      lead_time_days: $('#editSupplierLeadTime').value === '' ? null : parseInt($('#editSupplierLeadTime').value, 10),
      certs: $('#editSupplierCerts').value.trim(),
      coi_expiry: $('#editSupplierCoi').value || null,
      tax_compliant: $('#editSupplierTax').checked ? 1 : 0,
      anti_bribery_clear: $('#editSupplierAbc').checked ? 1 : 0,
      auto_approve: $('#editSupplierAutoApprove').checked ? 1 : 0,
    }),
  });
  btn.disabled = false;
  if (res.ok) { editSupplierModal?.close(); loadSupplierData(); }
  else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'Failed to update supplier');
  }
});

// Archive instead of delete — records who/why via the reason prompt; the
// record lands in the centralized Archive folder (Admin review/restore).
window.archiveSupplier = async (id, name) => {
  const reason = prompt(`Archive supplier "${name}"?\n\nProvide an archiving reason (recorded in the activity log):`, '');
  if (reason === null) return;
  if (!reason.trim()) { alert('An archiving reason is required.'); return; }
  const ok = await (window.scimConfirm ? scimConfirm({
    title: 'Archive Supplier?',
    message: `"${name}" will be moved to the Archive folder (admin review). It is hidden from the directory but recoverable.`,
    confirmLabel: 'Archive', icon: 'archive', danger: true,
  }) : Promise.resolve(true));
  if (!ok) return;
  const res = await fetch(`/api/v1/records/supplier/${id}/archive`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) loadSupplierData();
  else alert(data.error || 'Failed to archive supplier');
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


if (window.initHubTabs) initHubTabs('directory');
