// ==========================================
// SMART WAREHOUSING SYSTEM PAGE LOGIC
// ==========================================

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) {
    console.warn(`Element not found: ${selector}`);
    return null;
  }
  return element;
};

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

// Initialize permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializePermissions();
  loadWarehouseData();
});

// ==========================================
// WAREHOUSE DATA LOADING
// ==========================================
async function loadWarehouseData() {
  try {
    const response = await api('warehouse/zones');
    const data = response.zones || response;
    const zones = Array.isArray(data) ? data : [];

    // Calculate stats
    const totalCapacity = zones.reduce((sum, z) => sum + (z.capacity || 0), 0);
    const currentOccupancy = zones.reduce((sum, z) => sum + (z.occupied || 0), 0);
    const availableBins = totalCapacity - currentOccupancy;
    const criticalZones = zones.filter(z => (z.occupied / z.capacity) > 0.85).length;
    const utilizationRate = totalCapacity > 0 ? Math.round((currentOccupancy / totalCapacity) * 100) : 0;

    // Render warehouse grid
    renderWarehouseGrid(zones);

    // Zone suggestions for "Move to Zone" scans — real zone codes only.
    const dl = $('#zoneSuggestions');
    if (dl) dl.innerHTML = zones.map((z) => `<option value="${z.zone}">${z.category || ''}</option>`).join('');
  } catch (error) {
    console.error('Error loading warehouse data:', error);
  }
}

function renderWarehouseGrid(zones) {
  const gridEl = $('#warehouseGrid');
  if (!gridEl) return;

  if (!zones.length) {
    gridEl.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center py-14 text-center">
        <span class="material-symbols-outlined text-5xl text-slate-300 mb-3">warehouse</span>
        <p class="text-on-surface-variant text-sm font-medium">No warehouse zones yet</p>
        <p class="text-slate-400 text-xs mt-1">Click "Add Zone" to map your first storage area.</p>
      </div>`;
    return;
  }

  const palette = (pct) => pct > 85
    ? { chip: 'bg-red-100 text-red-700', bar: 'bg-red-500', ring: 'border-red-200', label: 'Critical' }
    : pct >= 60
      ? { chip: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', ring: 'border-amber-200', label: 'Filling' }
      : { chip: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', ring: 'border-emerald-200', label: 'Available' };
  const isAdmin = typeof currentUserRole === 'undefined' || currentUserRole === 'Admin';

  gridEl.innerHTML = zones.map(zone => {
    const pct = zone.capacity > 0 ? Math.round((zone.occupied / zone.capacity) * 100) : 0;
    const isDisposal = String(zone.zone).toUpperCase() === 'DISPOSAL';
    const c = isDisposal
      ? { chip: 'bg-slate-800 text-white', bar: 'bg-slate-700', ring: 'border-slate-300', label: 'Disposal' }
      : palette(pct);

    const rows = (zone.rows || []).map(row => {
      const rPct = row.capacity > 0 ? Math.round((row.occupied / row.capacity) * 100) : 0;
      const rc = palette(rPct);
      return `
        <div class="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
          <span class="text-xs font-semibold text-slate-600">Row ${row.row}</span>
          <span class="text-xs font-bold ${rc.chip.split(' ')[1]}">${row.occupied}/${row.capacity}</span>
        </div>`;
    }).join('');

    return `
      <div class="rounded-2xl border ${c.ring} bg-white p-5 hover:shadow-lg transition-shadow" data-zone="${zone.zone}">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-10 h-10 rounded-xl ${c.chip} flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-xl">${isDisposal ? 'delete_forever' : 'shelves'}</span>
            </span>
            <div class="min-w-0">
              <p class="text-base font-bold text-on-surface leading-tight">${isDisposal ? 'Disposal Zone' : 'Zone ' + zone.zone}</p>
              <p class="text-xs text-on-surface-variant">${zone.occupied} of ${zone.capacity} slots${zone.category ? ` · ${zone.category}` : ''}</p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${c.chip}">${c.label}</span>
            ${isAdmin && !isDisposal ? `<button type="button" class="text-slate-300 hover:text-red-500 transition-colors" title="Delete zone" aria-label="Delete zone ${zone.zone}" onclick="deleteZone('${zone.zone}')"><span class="material-symbols-outlined text-base">delete</span></button>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-3 mb-4">
          <div class="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full ${c.bar} rounded-full transition-all duration-500" style="width: ${Math.min(pct, 100)}%"></div>
          </div>
          <span class="text-sm font-extrabold text-on-surface w-10 text-right">${pct}%</span>
        </div>
        <div class="space-y-1.5">${rows || '<p class="text-xs text-slate-400 text-center py-2">No row data</p>'}</div>
      </div>`;
  }).join('');
}

// Zone deletion — Admin only server-side; occupied zones are refused.
window.deleteZone = async (zone) => {
  const ok = await (window.scimConfirm ? scimConfirm({
    title: `Delete Zone ${zone}?`,
    message: 'The zone and its row map are removed permanently. Zones still holding stock cannot be deleted.',
    confirmLabel: 'Delete Zone', icon: 'delete_forever',
  }) : Promise.resolve(confirm(`Delete zone ${zone}?`)));
  if (!ok) return;
  const res = await fetch(`/api/v1/warehouse/zones/${encodeURIComponent(zone)}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Unable to delete zone.'); return; }
  loadWarehouseData();
};

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Add Zone Button - open the in-module form
const addZoneBtn = $('#addZone');
const addZoneModal = $('#addZoneModal');
const addZoneForm = $('#addZoneForm');
const zoneFormError = $('#zoneFormError');

if (addZoneBtn) {
  addZoneBtn.onclick = () => addZoneModal?.showModal();
}

$('#closeZoneModal')?.addEventListener('click', () => addZoneModal?.close());

addZoneForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  zoneFormError.hidden = true;

  try {
    const response = await fetch('/api/v1/warehouse/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(addZoneForm).entries())),
    });
    const result = await response.json();
    if (!response.ok) {
      zoneFormError.textContent = result.error || 'Unable to create zone.';
      zoneFormError.hidden = false;
      return;
    }

    addZoneModal.close();
    addZoneForm.reset();
    await loadWarehouseData();
  } catch (error) {
    console.error('Error creating warehouse zone:', error);
    zoneFormError.textContent = 'Unable to reach the server. Please try again.';
    zoneFormError.hidden = false;
  }
});

// Scanner is an inline hub tab — switching to it starts the camera
// (the global FAB still opens the shared quick-scan modal).
const openScanner = () => {
  if (typeof window.switchModuleTab === 'function') window.switchModuleTab('scanner');
  initializeCamera();
};

const closeScan = $('#closeScan');
if (closeScan) {
  closeScan.onclick = () => stopCamera();
}

let currentAction = 'Inventory Intake';
let cameraStream = null;
let qrDetectionFrame = null;

// Camera initialization
async function initializeCamera() {
  const video = $('#cameraPreview');
  const fallback = $('#cameraFallback');
  const status = $('#scannerStatus');

  if (!video || !fallback || !status) return;

  try {
    // Check if camera is available
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      cameraStream = stream;
      video.srcObject = stream;
      await video.play();
      video.style.display = 'block';
      fallback.style.display = 'none';
      status.textContent = '● Camera active';
      status.style.color = '#059669';
      
      // Start QR detection interval
      startQRDetection();
    } else {
      throw new Error('Camera API not available');
    }
  } catch (error) {
    console.error('Camera access error:', error);
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    video.style.display = 'none';
    fallback.style.display = 'grid';
    status.textContent = error.name === 'NotAllowedError'
      ? '● Allow camera access to scan QR codes'
      : '● Camera unavailable';
    status.style.color = '#dc2626';
  }
}

function stopCamera() {
  if (qrDetectionFrame !== null) {
    cancelAnimationFrame(qrDetectionFrame);
    qrDetectionFrame = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = $('#cameraPreview');
  const fallback = $('#cameraFallback');
  const status = $('#scannerStatus');
  
  if (video) video.style.display = 'none';
  if (fallback) fallback.style.display = 'grid';
  if (status) {
    status.textContent = '● Camera stopped';
    status.style.color = '#64748b';
  }
}

// Enable camera button (for fallback)
const enableCamera = $('#enableCamera');
if (enableCamera) {
  enableCamera.onclick = () => {
    initializeCamera();
  };
}

// Mode selection
const modeButtons = document.querySelectorAll('.mode-btn');
const updateScanExtraFields = () => {
  const wrap = $('#extraFields');
  const input = $('#extraInput');
  if (!wrap || !input) return;
  const labels = {
    'Assign to Staff': 'Employee name (validated against Employee Info)…',
    'Move to Zone': 'Zone / aisle (e.g. A-02)…',
    'PO Receipt': 'PO number — required (e.g. PO-2026-001)…',
  };
  if (labels[currentAction]) {
    wrap.classList.remove('hidden');
    input.placeholder = labels[currentAction];
  }
  if (currentAction === 'Move to Zone') {
    input.setAttribute('list', 'zoneSuggestions');
  } else {
    input.removeAttribute('list');
    wrap.classList.add('hidden');
  }
};
modeButtons.forEach((btn) => {
  btn.onclick = () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.mode;
    updateScanExtraFields();
  };
});

function startQRDetection() {
  const video = $('#cameraPreview');
  const canvas = $('#qrCanvas');
  const result = $('#scanResult');
  if (!video || !canvas || !cameraStream) return;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;

  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (error) {
      console.warn('Native QR detector unavailable; using jsQR:', error);
    }
  }
  let detectionInProgress = false;

  const decodeWithJsQR = () => {
    if (typeof window.jsQR !== 'function') return null;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return window.jsQR(pixels.data, pixels.width, pixels.height);
  };

  const detect = () => {
    if (!cameraStream) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA && !detectionInProgress) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const onCode = (value) => {
        const qrInput = $('#qr');
        if (qrInput) qrInput.value = value;
        if (result) result.textContent = `QR detected: ${value}. Press Record scan to save it.`;
        stopCamera();
      };

      if (detector) {
        detectionInProgress = true;
        detector.detect(video)
          .then((codes) => { if (codes.length) onCode(codes[0].rawValue); })
          .catch((error) => {
            console.warn('Native QR detection failed; trying jsQR:', error);
            const code = decodeWithJsQR();
            if (code) onCode(code.data);
          })
          .finally(() => { detectionInProgress = false; });
      } else if (typeof window.jsQR === 'function') {
        const code = decodeWithJsQR();
        if (code) {
          onCode(code.data);
          return;
        }
      } else {
        const status = $('#scannerStatus');
        if (status) status.textContent = 'QR decoder unavailable. Enter the code manually.';
        return;
      }
    }

    qrDetectionFrame = requestAnimationFrame(detect);
  };

  qrDetectionFrame = requestAnimationFrame(detect);
}

const scanNow = $('#scanNow');
if (scanNow) {
  scanNow.onclick = async () => {
    const qrInput = $('#qr');
    const scanResult = $('#scanResult');
    
    if (!qrInput) return;
    
    if (!qrInput.value.trim()) {
      if (scanResult) scanResult.textContent = 'Scan or enter a QR code first.';
      return;
    }

    const extraVal = ($('#extraInput')?.value || '').trim();
    const payload = { qr_code: qrInput.value.trim(), action: currentAction };
    if (currentAction === 'Assign to Staff') payload.assignee = extraVal;
    if (currentAction === 'Move to Zone') payload.zone = extraVal;
    if (currentAction === 'PO Receipt') payload.po_number = extraVal;
    if (currentAction === 'Check-In' && extraVal) payload.zone = extraVal;

    try {
      const response = await fetch('/api/v1/assets/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (scanResult) {
        let msg = response.ok
          ? `${data.asset?.name || payload.qr_code} recorded for ${currentAction}.`
          : (data.collision ? '⚠ ' : '') + (data.error || 'Unable to record scan.');
        if (data.clearance_token) msg += ` Clearance token ${data.clearance_token} issued to Core 3.`;
        if (data.auto_requisition) msg += ` Auto-requisition ${data.auto_requisition} dispatched.`;
        scanResult.textContent = msg;
        scanResult.style.color = response.ok ? '#059669' : '#dc2626';
      }

      if (response.ok) await loadWarehouseData();
    } catch (error) {
      console.error('Error recording scan:', error);
      if (scanResult) scanResult.textContent = 'Unable to reach the server. Please try again.';
    }
  };
}

// Refresh button
const refreshWarehouseBtn = $('#refreshWarehouse');
if (refreshWarehouseBtn) {
  refreshWarehouseBtn.onclick = () => {
    loadWarehouseData();
  };
}

// View All button - reload all scans

// Load warehouse data on page load
loadWarehouseData();

// ==========================================
// QR SCAN & GENERATE PORTAL (blueprint §5)
// Batch-serializes assets as AGENCY-ASSET-CAT-000000 and renders a
// print-ready label sheet via QRious.
// ==========================================
let lastSerialBatch = [];

const qrBatchForm = $('#qrBatchForm');
if (qrBatchForm) {
  qrBatchForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(qrBatchForm));
    const res = await fetch('/api/v1/assets/generate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Batch generation failed.');
      return;
    }
    lastSerialBatch = data.serials || [];
    const grid = $('#qrBatchGrid');
    if (grid) {
      grid.innerHTML = lastSerialBatch.map((s) => `
        <div class="border border-slate-200 rounded-xl p-3 flex flex-col items-center gap-2 bg-slate-50">
          <canvas class="qr-cell" data-serial="${s}" width="96" height="96"></canvas>
          <code class="text-[10px] font-mono text-slate-700 text-center break-all">${s}</code>
        </div>`).join('');
      grid.querySelectorAll('.qr-cell').forEach((cv) => {
        if (typeof QRious !== 'undefined') {
          new QRious({ element: cv, value: cv.dataset.serial, size: 96 });
        }
      });
    }
    $('#qrBatchResult')?.classList.remove('hidden');
    const printBtn = $('#printQrSheet');
    if (printBtn) printBtn.disabled = lastSerialBatch.length === 0;
    loadWarehouseData();
  };
}

const printQrSheetBtn = $('#printQrSheet');
if (printQrSheetBtn) {
  printQrSheetBtn.onclick = () => {
    if (!lastSerialBatch.length || typeof QRious === 'undefined') return;
    const cells = lastSerialBatch.map((s) => {
      const q = new QRious({ value: s, size: 160 });
      return `<div class="cell"><img src="${q.toDataURL()}" alt="${s}"><span>${s}</span></div>`;
    }).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!doctype html><html><head><title>SCIM QR Label Sheet</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 16px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .cell { border: 1px dashed #94a3b8; border-radius: 8px; padding: 10px; text-align: center; }
        .cell img { width: 120px; height: 120px; }
        .cell span { display: block; font-size: 9px; font-family: monospace; margin-top: 6px; word-break: break-all; }
        h1 { font-size: 14px; } p { font-size: 11px; color: #64748b; }
        @media print { .noprint { display: none; } }
      </style></head><body>
      <h1>SCIM Asset Label Sheet — ${new Date().toLocaleString()}</h1>
      <p>Scan each serialized tag at the Receiving Dock to mutate assets from Awaiting Print / Inbound into stock.</p>
      <button class="noprint" onclick="window.print()">Print / Save as PDF</button>
      <div class="grid">${cells}</div></body></html>`);
    w.document.close();
  };
}

// ==========================================
// MASTER-HUB TAB SYSTEM + LAZY LOADERS
// ==========================================
const whLoadedTabs = new Set();

async function loadTabAssets() {
  const res = await fetch('/api/v1/assets');
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.assets) ? data.assets : (Array.isArray(data) ? data : []);
}

// --- Tracking tab (ported from warehouse-tracking) ---
let trackAssets = [];
const TRACK_PAGE = 10;
let trackPage = 0;
function renderTrackingTable() {
  const el = $('#assetTrackingTable');
  if (!el) return;
  const term = ($('#trackSearch')?.value || '').toLowerCase();
  const status = $('#trackStatusFilter')?.value || '';
  const filtered = trackAssets.filter((a) =>
    (!status || a.status === status) &&
    (!term || `${a.name} ${a.qr_code} ${a.location || ''}`.toLowerCase().includes(term)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / TRACK_PAGE));
  trackPage = Math.min(Math.max(trackPage, 0), totalPages - 1);
  const rows = filtered.slice(trackPage * TRACK_PAGE, (trackPage + 1) * TRACK_PAGE);
  el.innerHTML = rows.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No assets match.</p>'
    : `<table class="w-full text-sm min-w-[640px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 px-4 font-medium text-slate-600">ID</th><th class="py-2 px-4 font-medium text-slate-600">Asset</th>
        <th class="py-2 px-4 font-medium text-slate-600">Category</th><th class="py-2 px-4 font-medium text-slate-600">Location</th>
        <th class="py-2 px-4 font-medium text-slate-600">Status</th></tr></thead>
        <tbody>${rows.map((a) => `<tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="py-2.5 px-4 font-mono text-xs">${a.qr_code}</td>
          <td class="py-2.5 px-4 font-semibold text-slate-900">${a.name}</td>
          <td class="py-2.5 px-4 text-slate-600">${a.category || '—'}</td>
          <td class="py-2.5 px-4 text-slate-600">${a.location || '—'}</td>
          <td class="py-2.5 px-4"><span class="px-2 py-1 rounded-full text-xs font-semibold ${a.status === 'Deployed' ? 'bg-blue-100 text-blue-700' : a.status === 'In Warehouse' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${a.status}</span></td>
        </tr>`).join('')}</tbody></table>`;
  if (filtered.length > 0) {
    const foot = document.createElement('div');
    foot.className = 'px-4 py-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500';
    foot.innerHTML = `<span>${filtered.length} assets · Page ${trackPage + 1} of ${totalPages}</span>
      <div class="flex gap-1">
        <button class="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40" ${trackPage === 0 ? 'disabled' : ''} id="trackPrev">Prev</button>
        <button class="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40" ${trackPage >= totalPages - 1 ? 'disabled' : ''} id="trackNext">Next</button>
      </div>`;
    el.appendChild(foot);
    $('#trackPrev')?.addEventListener('click', () => { trackPage--; renderTrackingTable(); });
    $('#trackNext')?.addEventListener('click', () => { trackPage++; renderTrackingTable(); });
  }
}
async function loadTracking() {
  trackAssets = await loadTabAssets();
  const today = new Date().toDateString();
  const tx = await api('inventory/transactions').catch(() => ({}));
  const txList = Array.isArray(tx.transactions) ? tx.transactions : (Array.isArray(tx) ? tx : []);
  const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
  set('#trackTotalAssets', trackAssets.length);
  set('#trackDeployed', trackAssets.filter((a) => a.status === 'Deployed').length);
  set('#trackInbound', trackAssets.filter((a) => ['Inbound/Receiving', 'Awaiting Print'].includes(a.status)).length);
  set('#todayMovements', txList.filter((t) => new Date(t.created_at).toDateString() === today).length);
  renderTrackingTable();
}
const trackSearchEl = $('#trackSearch');
if (trackSearchEl) trackSearchEl.oninput = renderTrackingTable;
const trackStatusEl = $('#trackStatusFilter');
if (trackStatusEl) trackStatusEl.onchange = renderTrackingTable;
const refreshTrackingBtn = $('#refreshTracking');
if (refreshTrackingBtn) refreshTrackingBtn.onclick = loadTracking;

// --- Returns tab ---
async function loadReturns() {
  const el = $('#returnsList');
  if (!el) return;
  const assets = (await loadTabAssets()).filter((a) => a.status === 'Deployed');
  el.innerHTML = assets.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No deployed assets — nothing is out for return.</p>'
    : `<table class="w-full text-sm min-w-[560px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">ID</th><th class="py-2 pr-4 font-medium text-slate-600">Asset</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Assigned To</th><th class="py-2 font-medium text-slate-600">Action</th></tr></thead>
        <tbody>${assets.map((a) => `<tr class="border-b border-slate-100">
          <td class="py-2.5 pr-4 font-mono text-xs">${a.qr_code}</td>
          <td class="py-2.5 pr-4 font-semibold text-slate-900">${a.name}</td>
          <td class="py-2.5 pr-4 text-slate-600">${a.external_employee_name || '—'}</td>
          <td class="py-2.5"><button class="action-btn action-btn-receive !px-2" title="Mark returned" aria-label="Mark returned" onclick="returnAsset('${a.qr_code}')"><span class="material-symbols-outlined text-base">keyboard_return</span></button></td>
        </tr>`).join('')}</tbody></table>`;
}
window.returnAsset = (qr) => {
  // §3: returns require a reason — checkbox category plus a free-text
  // explanation (required when "Other" is chosen).
  const modal = $('#returnReasonModal');
  if (!modal) return;
  $('#returnReasonQr').textContent = qr;
  modal.querySelectorAll('input[name="returnReason"]').forEach((cb) => { cb.checked = false; });
  const custom = $('#returnReasonCustom');
  if (custom) { custom.value = ''; custom.classList.add('hidden'); }
  modal.dataset.qr = qr;
  modal.showModal();
};

document.addEventListener('change', (e) => {
  if (e.target.name === 'returnReason') {
    $('#returnReasonCustom')?.classList.toggle('hidden', e.target.value !== 'Other');
  }
});

const returnReasonSubmit = $('#returnReasonSubmit');
if (returnReasonSubmit) {
  returnReasonSubmit.onclick = async () => {
    const modal = $('#returnReasonModal');
    const qr = modal?.dataset.qr;
    const checked = modal?.querySelector('input[name="returnReason"]:checked');
    if (!checked) { alert('Select a return reason.'); return; }
    let reason = checked.value;
    const custom = ($('#returnReasonCustom')?.value || '').trim();
    if (reason === 'Other') {
      if (!custom) { alert('Describe the return reason.'); return; }
      reason = 'Other: ' + custom;
    } else if (custom) {
      reason += ' — ' + custom;
    }
    const res = await fetch('/api/v1/assets/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_code: qr, action: 'Check-In', reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { alert(data.error || 'Return failed.'); return; }
    modal.close();
    if (data.clearance_token) alert(`Exit clearance issued — token ${data.clearance_token} dispatched to Core 3.`);
    loadReturns();
  };
}

// --- Activity Log tab (immutable scan ledger: action, operator name + ID) ---
let whActPage = 1;
const WH_ACT_PAGE = 20;
async function loadAssetHistory() {
  const el = $('#assetHistoryList');
  if (!el) return;
  const data = await api('scan-logs').catch(() => ({}));
  let tx = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
  const days = parseInt($('#whActRange')?.value || '0', 10);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  if (cutoff) tx = tx.filter((t) => t.created_at && new Date(t.created_at).getTime() >= cutoff);
  const pages = Math.max(1, Math.ceil(tx.length / WH_ACT_PAGE));
  if (whActPage > pages) whActPage = pages;
  const slice = tx.slice((whActPage - 1) * WH_ACT_PAGE, whActPage * WH_ACT_PAGE);
  el.innerHTML = slice.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No activity yet.</p>'
    : `<table class="w-full text-sm min-w-[640px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">Time</th><th class="py-2 pr-4 font-medium text-slate-600">ID</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Action</th><th class="py-2 pr-4 font-medium text-slate-600">Details</th>
        <th class="py-2 font-medium text-slate-600">Scanned By</th></tr></thead>
        <tbody>${slice.map((t) => `<tr class="border-b border-slate-100">
          <td class="py-2.5 pr-4 text-slate-500 text-xs whitespace-nowrap">${new Date(t.created_at).toLocaleString()}</td>
          <td class="py-2.5 pr-4 font-mono text-xs">${t.qr_code || '—'}</td>
          <td class="py-2.5 pr-4 text-slate-800">${t.action}</td>
          <td class="py-2.5 pr-4 text-slate-600 text-xs">${t.details || '—'}</td>
          <td class="py-2.5 text-slate-600">${t.scanned_by || '—'}${t.user_id ? ` <small class="text-slate-400">(#${t.user_id})</small>` : ''}</td>
        </tr>`).join('')}</tbody></table>`;
  const pager = $('#whActPager');
  if (pager) pager.innerHTML = tx.length ? `<span class="text-xs text-slate-500">${tx.length} events · page ${whActPage} of ${pages}</span>
    <div class="flex gap-2"><button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${whActPage <= 1 ? 'disabled' : ''} onclick="whActPage--; loadAssetHistory()">Prev</button>
    <button class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-40" ${whActPage >= pages ? 'disabled' : ''} onclick="whActPage++; loadAssetHistory()">Next</button></div>` : '';
}

const whTabLoaders = {
  tracking: loadTracking,
  returns: loadReturns,
  history: loadAssetHistory,
};
document.addEventListener('hub:tab', (e) => {
  const tab = e.detail.tab;
  if (tab === 'scanner' && !cameraStream) initializeCamera();
  if (tab !== 'scanner' && cameraStream) stopCamera();
  if (whTabLoaders[tab] && !whLoadedTabs.has(tab)) {
    whLoadedTabs.add(tab);
    whTabLoaders[tab]();
  }
});

if (window.initHubTabs) initHubTabs('layout');
