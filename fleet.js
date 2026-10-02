// ==========================================
// FLEET & VEHICLE REQUESTS (Internal Logistics §4)
// Inventory submits transport requests routed to Fleet & Vehicle Management.
// ==========================================

const $ = (selector) => document.querySelector(selector);
const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.addEventListener('DOMContentLoaded', async () => {
  await initializePermissions();
  loadFleetRequests();
});

let fleetItems = [];
const FLEET_STATUSES = ['Submitted', 'Scheduled', 'In Transit', 'Delivered', 'Cancelled'];

const fleetStatusBadge = (s) => {
  const cls = s === 'Delivered' ? 'bg-emerald-100 text-emerald-700'
    : s === 'Cancelled' ? 'bg-red-100 text-red-700'
    : s === 'In Transit' ? 'bg-blue-100 text-blue-700'
    : s === 'Scheduled' ? 'bg-violet-100 text-violet-700'
    : 'bg-amber-100 text-amber-700';
  return `<span class="px-2 py-1 rounded text-xs font-semibold ${cls}">${esc(s)}</span>`;
};

async function loadFleetRequests() {
  const data = await api('fleet-requests').catch(() => ({}));
  fleetItems = Array.isArray(data.items) ? data.items : [];
  renderFleetTable();
}

function renderFleetTable() {
  const el = $('#fleetTable');
  if (!el) return;
  const q = ($('#fleetSearch')?.value || '').toLowerCase().trim();
  const rows = q ? fleetItems.filter((r) => [r.req_number, r.item_name, r.destination, r.status].some((v) => (v || '').toLowerCase().includes(q))) : fleetItems;
  const canManage = ['Admin', 'Manager'].includes(currentUserRole);
  el.innerHTML = rows.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Request ID</th><th class="text-left p-4">Item / Asset</th><th class="text-left p-4">Qty</th>
    <th class="text-left p-4">From</th><th class="text-left p-4">Deliver To</th><th class="text-left p-4">Requested By</th>
    <th class="text-left p-4">Status</th><th class="text-left p-4">Submitted</th>${canManage ? '<th class="text-left p-4">Action</th>' : ''}</tr></thead>
    <tbody>${rows.map((r) => `<tr class="border-b border-slate-50">
      <td class="p-4 font-mono text-xs">${esc(r.req_number)}</td>
      <td class="p-4 font-medium">${esc(r.item_name)}</td>
      <td class="p-4">${esc(r.quantity)}</td>
      <td class="p-4 text-on-surface-variant">${esc(r.origin || 'Warehouse')}</td>
      <td class="p-4 text-on-surface-variant">${esc(r.destination)}</td>
      <td class="p-4 text-on-surface-variant">${esc(r.requested_by_name || '—')}</td>
      <td class="p-4">${fleetStatusBadge(r.status)}</td>
      <td class="p-4 text-on-surface-variant text-xs">${r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
      ${canManage ? `<td class="p-4"><select class="px-2 py-1 border border-outline-variant rounded-lg text-xs" data-fleet-status="${r.id}">
        ${FLEET_STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select></td>` : ''}
    </tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No transport requests yet — submit one for Fleet &amp; Vehicle Management.</div>';
}

// Submit a new transport request
$('#newFleetRequest')?.addEventListener('click', () => {
  $('#fleetModal')?.showModal();
});

$('#fleetForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch('/api/v1/fleet-requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(f),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Unable to submit transport request.'); return; }
  $('#fleetModal')?.close();
  e.target.reset();
  loadFleetRequests();
});

// Status updates (Admin/Manager — fleet fulfillment side)
document.addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-fleet-status]');
  if (!sel) return;
  const res = await fetch(`/api/v1/fleet-requests/${sel.dataset.fleetStatus}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: sel.value }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Update failed.'); }
  loadFleetRequests();
});

$('#fleetSearch')?.addEventListener('input', renderFleetTable);
