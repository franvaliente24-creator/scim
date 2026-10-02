// Archives — standalone page (relocated from inventory.html, Admin only).
// GET /api/v1/archives lists every entity; restore via
// POST /api/v1/records/{entity}/{id}/restore (Admin-only, server-enforced).

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());
const $ = (sel) => document.querySelector(sel);

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

async function loadArchiveTable() {
  const entity = $('#archiveResource')?.value || 'asset';
  const q = ($('#archiveSearch')?.value || '').toLowerCase();
  const data = await api('archives').catch(() => ({}));
  const rows = (data.items || []).filter((r) => r.entity === entity && (!q || `${r.label} ${r.ref} ${r.archived_by || ''}`.toLowerCase().includes(q)));
  const el = $('#archiveTable');
  if (!el) return;
  el.innerHTML = rows.length ? `<table class="w-full text-sm data-table"><thead class="bg-slate-50 border-b border-slate-200"><tr>
    <th class="text-left p-4">Ref</th><th class="text-left p-4">Record</th><th class="text-left p-4">Archived By</th><th class="text-left p-4">Archived At</th><th class="text-left p-4">Reason</th><th class="text-left p-4">Action</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="border-b border-slate-50">
      <td class="p-4 font-mono text-xs">${escapeHTML(r.ref || r.id)}</td>
      <td class="p-4 font-medium">${escapeHTML(r.label)}</td>
      <td class="p-4 text-on-surface-variant text-xs">${escapeHTML(r.archived_by || '—')}</td>
      <td class="p-4 text-on-surface-variant text-xs">${r.archived_at ? new Date(r.archived_at).toLocaleString() : '—'}</td>
      <td class="p-4 text-on-surface-variant text-xs">${escapeHTML(r.archive_reason || '—')}</td>
      <td class="p-4"><button type="button" title="Restore" aria-label="Restore record" class="action-btn action-btn-view !px-2" data-restore-res="${r.entity}" data-restore-id="${r.id}"><span class="material-symbols-outlined text-base">unarchive</span></button></td></tr>`).join('')}</tbody></table>`
    : '<div class="p-10 text-center text-on-surface-variant text-sm">Archive is empty.</div>';
}

document.addEventListener('click', async (event) => {
  const rBtn = event.target.closest('[data-restore-res]');
  if (!rBtn) return;
  const res = await fetch(`/api/v1/records/${rBtn.dataset.restoreRes}/${rBtn.dataset.restoreId}/restore`, { method: 'POST' });
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Restore failed.'); }
  loadArchiveTable();
});

['archiveResource', 'archiveSearch'].forEach((id) => {
  const el = $('#' + id);
  if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', loadArchiveTable);
});

loadArchiveTable();
