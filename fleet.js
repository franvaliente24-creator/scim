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

let fleetPage = 1;
const FLEET_PAGE = 15;

function renderFleetTable() {
  const el = $('#fleetTable');
  if (!el) return;
  const q = ($('#fleetSearch')?.value || '').toLowerCase().trim();
  const days = parseInt($('#fleetRange')?.value || '0', 10);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const rows = fleetItems.filter((r) =>
    (!q || [r.req_number, r.item_name, r.asset_ref, r.destination, r.recipient_name, r.recipient_dept, r.status].some((v) => (v || '').toLowerCase().includes(q)))
    && (!cutoff || (r.created_at && new Date(r.created_at).getTime() >= cutoff)));
  const pages = Math.max(1, Math.ceil(rows.length / FLEET_PAGE));
  if (fleetPage > pages) fleetPage = pages;
  const slice = rows.slice((fleetPage - 1) * FLEET_PAGE, fleetPage * FLEET_PAGE);
  const canManage = ['Admin', 'Manager'].includes(currentUserRole);
  el.innerHTML = slice.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Request ID</th><th class="text-left p-4">Item / Asset</th><th class="text-left p-4">Qty</th>
    <th class="text-left p-4">Pickup</th><th class="text-left p-4">Delivery To</th><th class="text-left p-4">Recipient</th>
    <th class="text-left p-4">Delivery Date</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Status</th>
    <th class="text-left p-4">Requested By</th>${canManage ? '<th class="text-left p-4">Action</th>' : ''}</tr></thead>
    <tbody>${slice.map((r) => `<tr class="border-b border-slate-50">
      <td class="p-4 font-mono text-xs">${esc(r.req_number)}</td>
      <td class="p-4 font-medium">${esc(r.item_name)}${r.asset_ref ? `<div class="text-xs text-on-surface-variant font-mono">${esc(r.asset_ref)}</div>` : ''}</td>
      <td class="p-4">${esc(r.quantity)}</td>
      <td class="p-4 text-on-surface-variant">${esc(r.origin || 'Warehouse')}</td>
      <td class="p-4 text-on-surface-variant">${esc(r.destination)}</td>
      <td class="p-4 text-on-surface-variant">${esc(r.recipient_name || '—')}${r.recipient_dept ? `<div class="text-xs">${esc(r.recipient_dept)}</div>` : ''}</td>
      <td class="p-4 text-on-surface-variant text-xs">${r.requested_date ? new Date(r.requested_date).toLocaleDateString() : '—'}</td>
      <td class="p-4 text-xs font-semibold">${esc(r.priority || 'Normal')}</td>
      <td class="p-4">${fleetStatusBadge(r.status)}</td>
      <td class="p-4 text-on-surface-variant text-xs">${esc(r.requested_by_name || '—')}</td>
      ${canManage ? `<td class="p-4"><select class="px-2 py-1 border border-outline-variant rounded-lg text-xs" data-fleet-status="${r.id}">
        ${FLEET_STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select></td>` : ''}
    </tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">No transport requests yet — submit one for Fleet &amp; Vehicle Management.</div>';
  const pager = $('#fleetPager');
  if (pager) pager.innerHTML = rows.length ? `<span class="text-xs text-slate-500">${rows.length} requests · page ${fleetPage} of ${pages}</span>
    <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${fleetPage <= 1 ? 'disabled' : ''} onclick="fleetPage--; renderFleetTable()">Prev</button>
    <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${fleetPage >= pages ? 'disabled' : ''} onclick="fleetPage++; renderFleetTable()">Next</button></div>` : '';
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

$('#fleetSearch')?.addEventListener('input', () => { fleetPage = 1; renderFleetTable(); });
$('#fleetRange')?.addEventListener('change', () => { fleetPage = 1; renderFleetTable(); });

// Real-time sync — request status changes on the fleet side flow in live.
setInterval(loadFleetRequests, 30000);
