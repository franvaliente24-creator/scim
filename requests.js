// Supply Requests Portal — requester entry point + department approval queue.
// Staff create/submit requests here; authorized department approvers validate
// them before they enter the supply-chain workflow.

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());
const $ = (sel) => document.querySelector(sel);
const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const showDialog = (d) => { if (d && !d.open) d.showModal(); };
const closeDialog = (d) => { if (d && d.open) d.close(); };

function srStatusBadge(s) {
    const map = {
        'Draft': 'bg-slate-100 text-slate-600',
        'Submitted': 'bg-sky-100 text-sky-700',
        'Under Department Review': 'bg-amber-100 text-amber-700',
        'Approved': 'bg-emerald-100 text-emerald-700',
        'Inventory Review': 'bg-indigo-100 text-indigo-700',
        'For Issuance': 'bg-teal-100 text-teal-700',
        'In Procurement': 'bg-purple-100 text-purple-700',
        'Partially Issued': 'bg-cyan-100 text-cyan-700',
        'Issued': 'bg-emerald-100 text-emerald-700',
        'Closed': 'bg-slate-200 text-slate-500',
        'Rejected': 'bg-red-100 text-red-700',
        'Cancelled': 'bg-slate-200 text-slate-400',
    };
    return `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${map[s] || 'bg-slate-100 text-slate-600'}">${escapeHTML(s)}</span>`;
}

function itemSummary(r) {
    return (r.items || []).map((i) => `${escapeHTML(i.item_name)} ×${i.quantity}`).join(', ') || '—';
}

async function loadMyRequests() {
    const res = await api('supply-requests?scope=mine').catch(() => ({}));
    const rows = res.requests || [];
    $('#myRequestsTable').innerHTML = rows.length
        ? `<table class="data-table w-full text-sm"><thead><tr>
            <th class="text-left p-4">Request #</th><th class="text-left p-4">Title / Items</th><th class="text-left p-4">Priority</th>
            <th class="text-left p-4">Needed By</th><th class="text-left p-4">Status</th><th class="text-left p-4">Approver Remarks</th><th class="text-left p-4">Actions</th>
          </tr></thead><tbody>${rows.map((r) => `<tr class="border-t border-slate-100">
            <td class="p-4 font-mono text-xs font-semibold">${escapeHTML(r.request_number)}</td>
            <td class="p-4"><div class="font-medium">${escapeHTML(r.title)}</div><div class="text-xs text-on-surface-variant">${itemSummary(r)}</div></td>
            <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td>
            <td class="p-4 text-on-surface-variant">${r.needed_by || '—'}</td>
            <td class="p-4">${srStatusBadge(r.status)}</td>
            <td class="p-4 text-xs text-on-surface-variant max-w-48">${escapeHTML(r.dept_remarks || '—')}</td>
            <td class="p-4 whitespace-nowrap">${
                r.status === 'Draft'
                    ? `<button class="action-btn !px-2 text-primary" data-my-action="submit" data-sr-id="${r.id}" title="Submit for approval"><span class="material-symbols-outlined text-base">send</span></button>
                       <button class="action-btn !px-2 text-red-500" data-my-action="cancel" data-sr-id="${r.id}" title="Cancel"><span class="material-symbols-outlined text-base">delete</span></button>`
                    : (r.status === 'Submitted'
                        ? `<button class="action-btn !px-2 text-red-500" data-my-action="cancel" data-sr-id="${r.id}" title="Cancel request"><span class="material-symbols-outlined text-base">cancel</span></button>`
                        : '<span class="text-xs text-on-surface-variant">—</span>')
            }</td></tr>`).join('')}</tbody></table>`
        : '<div class="p-10 text-center text-on-surface-variant text-sm">No requests yet — click "New Supply Request" to create one.</div>';
}

async function loadDeptApprovals() {
    const card = $('#deptApprovalsCard');
    const [me, apprRes, deptRes] = await Promise.all([
        api('auth/me').catch(() => null),
        api('department-approvers').catch(() => ({ approvers: [] })),
        api('supply-requests?scope=dept').catch(() => ({ requests: [] })),
    ]);
    const myId = me && (me.id || (me.user && me.user.id));
    const isApprover = (apprRes.approvers || []).some((a) => a.user_id === myId || a.id === myId) || (deptRes.requests || []).length > 0;
    if (!isApprover) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    const pending = (deptRes.requests || []).filter((r) => ['Submitted', 'Under Department Review'].includes(r.status));
    $('#deptApprovalsTable').innerHTML = pending.length
        ? `<table class="data-table w-full text-sm"><thead><tr>
            <th class="text-left p-4">Request #</th><th class="text-left p-4">Requester</th><th class="text-left p-4">Title / Items</th>
            <th class="text-left p-4">Purpose</th><th class="text-left p-4">Priority</th><th class="text-left p-4">Needed By</th><th class="text-left p-4">Actions</th>
          </tr></thead><tbody>${pending.map((r) => `<tr class="border-t border-slate-100">
            <td class="p-4 font-mono text-xs font-semibold">${escapeHTML(r.request_number)}</td>
            <td class="p-4"><div class="font-medium">${escapeHTML(r.requesting_employee || '—')}</div><div class="text-xs text-on-surface-variant">${escapeHTML(r.employee_id || '')} · ${escapeHTML(r.department || '')}</div></td>
            <td class="p-4"><div class="font-medium">${escapeHTML(r.title)}</div><div class="text-xs text-on-surface-variant">${itemSummary(r)}</div></td>
            <td class="p-4 text-xs text-on-surface-variant max-w-56">${escapeHTML(r.purpose || '—')}</td>
            <td class="p-4">${escapeHTML(r.priority || 'Normal')}</td>
            <td class="p-4 text-on-surface-variant">${r.needed_by || '—'}</td>
            <td class="p-4 whitespace-nowrap">
                <button class="action-btn !px-2 text-emerald-600" data-appr-action="approve" data-sr-id="${r.id}" title="Approve"><span class="material-symbols-outlined text-base">check_circle</span></button>
                <button class="action-btn !px-2 text-red-600" data-appr-action="reject" data-sr-id="${r.id}" title="Reject"><span class="material-symbols-outlined text-base">cancel</span></button>
            </td></tr>`).join('')}</tbody></table>`
        : '<div class="p-10 text-center text-on-surface-variant text-sm">No department requests awaiting your decision.</div>';
}

async function srStatus(id, status, remarks) {
    const res = await fetch(`/api/v1/supply-requests/${id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remarks !== undefined ? { status, remarks } : { status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Action failed.'); return false; }
    return true;
}

// Action dispatcher
document.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-my-action], [data-appr-action]');
    if (!btn) return;
    const id = btn.dataset.srId;

    if (btn.dataset.myAction === 'submit') {
        // Draft → Submitted → Under Department Review (requester-authorized).
        if (!(await srStatus(id, 'Submitted'))) return;
        await srStatus(id, 'Under Department Review');
        loadMyRequests();
        return;
    }
    if (btn.dataset.myAction === 'cancel') {
        const ok = await (window.scimConfirm ? scimConfirm({ title: 'Cancel this request?', message: 'The request will be cancelled and removed from the approval queue.', confirmLabel: 'Cancel Request', icon: 'cancel', danger: true }) : Promise.resolve(true));
        if (!ok) return;
        await srStatus(id, 'Cancelled');
        loadMyRequests();
        return;
    }
    if (btn.dataset.apprAction === 'approve' || btn.dataset.apprAction === 'reject') {
        const approve = btn.dataset.apprAction === 'approve';
        const decision = await (window.scimConfirm ? scimConfirm({
            title: approve ? 'Approve request?' : 'Reject request?',
            message: approve
                ? 'Approving confirms the department needs these items. The request moves to Supply Chain for inventory review.'
                : 'Rejecting returns the request to the requester. A reason is required.',
            confirmLabel: approve ? 'Approve' : 'Reject', icon: approve ? 'check_circle' : 'cancel',
            danger: !approve, reasonInput: true, reasonOptional: approve,
        }) : Promise.resolve(approve ? true : prompt('Rejection reason (required):')));
        if (decision === false || decision === null) return;
        const remarks = typeof decision === 'string' ? decision : '';
        const target = approve ? 'Approved' : 'Rejected';
        // Pick up a still-Submitted request into review, then decide on it.
        const cur = await api(`supply-requests/${id}`).catch(() => null);
        if (cur && cur.status === 'Submitted') await srStatus(id, 'Under Department Review');
        await srStatus(id, target, remarks);
        loadDeptApprovals(); loadMyRequests();
        return;
    }
});

// ---- Request form ---------------------------------------------------------
function addItemRow() {
    const row = document.createElement('div');
    row.className = 'sr-item-row flex gap-2';
    row.innerHTML = `
        <input name="sr_item_name" required placeholder="Item name" class="flex-1 px-3.5 py-2.5 border border-outline-variant rounded-xl text-sm">
        <input name="sr_item_qty" type="number" min="1" value="1" required title="Quantity" class="w-20 px-3.5 py-2.5 border border-outline-variant rounded-xl text-sm">
        <button type="button" class="sr-item-del text-slate-400 hover:text-red-500 px-1" title="Remove item"><span class="material-symbols-outlined text-base">delete</span></button>`;
    $('#srItemsBody').appendChild(row);
}
$('#srAddItem')?.addEventListener('click', addItemRow);
document.addEventListener('click', (e) => {
    const del = e.target.closest('.sr-item-del');
    if (del && document.querySelectorAll('.sr-item-row').length > 1) del.closest('.sr-item-row').remove();
});
$('#newRequest')?.addEventListener('click', () => showDialog($('#srModal')));

async function createRequest(draft) {
    const form = $('#srForm');
    const data = Object.fromEntries(new FormData(form).entries());
    const items = [...form.querySelectorAll('.sr-item-row')].map((row) => ({
        item_name: row.querySelector('input[name="sr_item_name"]').value.trim(),
        quantity: parseInt(row.querySelector('input[name="sr_item_qty"]').value, 10) || 1,
    })).filter((i) => i.item_name);
    if (!items.length) { alert('Add at least one item.'); return; }
    const res = await fetch('/api/v1/supply-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: data.title, employee_id: data.employee_id, department: data.department,
            priority: data.priority, needed_by: data.needed_by || null, purpose: data.purpose,
            source: 'STAFF_PORTAL', draft, items,
        }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { alert(r.error || 'Could not save the request.'); return; }
    if (!draft && r.id) {
        // Submitted → route into the department review queue immediately.
        await srStatus(r.id, 'Under Department Review');
    }
    closeDialog($('#srModal'));
    form.reset();
    $('#srItemsBody').innerHTML = '';
    addItemRow();
    loadMyRequests(); loadDeptApprovals();
}

$('#srForm')?.addEventListener('submit', (e) => { e.preventDefault(); createRequest(false); });
$('#srSaveDraft')?.addEventListener('click', () => createRequest(true));

document.addEventListener('DOMContentLoaded', () => { loadMyRequests(); loadDeptApprovals(); });
