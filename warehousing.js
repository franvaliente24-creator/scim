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

    // Update stats
    const totalZonesEl = $('#totalZones');
    if (totalZonesEl) totalZonesEl.textContent = zones.length;
    
    const totalCapacityEl = $('#totalCapacity');
    if (totalCapacityEl) totalCapacityEl.textContent = totalCapacity;
    
    const totalOccupiedEl = $('#totalOccupied');
    if (totalOccupiedEl) totalOccupiedEl.textContent = currentOccupancy;
    
    const recentScansEl = $('#recentScans');
    if (recentScansEl) recentScansEl.textContent = '0'; // Will be updated separately

    // Render warehouse grid
    renderWarehouseGrid(zones);

    // Load recent scans
    loadRecentScans();
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

  gridEl.innerHTML = zones.map(zone => {
    const pct = zone.capacity > 0 ? Math.round((zone.occupied / zone.capacity) * 100) : 0;
    const c = palette(pct);

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
              <span class="material-symbols-outlined text-xl">shelves</span>
            </span>
            <div class="min-w-0">
              <p class="text-base font-bold text-on-surface leading-tight">Zone ${zone.zone}</p>
              <p class="text-xs text-on-surface-variant">${zone.occupied} of ${zone.capacity} slots</p>
            </div>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${c.chip} shrink-0">${c.label}</span>
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

let allScans = [];

async function loadRecentScans() {
  try {
    const response = await api('warehouse/scans');
    const scans = response.scans || response;
    allScans = Array.isArray(scans) ? scans : [];
    renderScansList();
  } catch (error) {
    console.error('Error loading recent scans:', error);
  }
}

function renderScansList() {
  const recentScansListEl = $('#recentScansList');
  if (!recentScansListEl) return;

  const term = ($('#scanSearch')?.value || '').toLowerCase();
  const scans = term
    ? allScans.filter((s) => `${s.action} ${s.qr_code} ${s.zone || ''}`.toLowerCase().includes(term))
    : allScans;

  const scansHTML = scans.map(scan => `
    <div class="row">
      <div>
        <b>${scan.action}</b><br>
        <small>${scan.qr_code} · Zone ${scan.zone || 'N/A'}</small>
      </div>
      <small>${new Date(scan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
    </div>
  `).join('');

  recentScansListEl.innerHTML = scansHTML || '<p class="text-on-surface-variant text-sm">No recent scans</p>';

  // Update the counter
  const recentScansEl = $('#recentScans');
  if (recentScansEl) recentScansEl.textContent = scans.length;
}

$('#scanSearch')?.addEventListener('input', renderScansList);

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

// Scanner is now an inline hub tab — the hero button switches to it and
// starts the camera (the global FAB still opens the shared quick-scan modal).
const heroScanBtn = $('#heroScanBtn');
const openScanner = () => {
  if (typeof window.switchModuleTab === 'function') window.switchModuleTab('scanner');
  initializeCamera();
};
if (heroScanBtn) {
  heroScanBtn.onclick = openScanner;
}

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
  } else {
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
const viewAllScansBtn = $('#viewAllScans');
if (viewAllScansBtn) {
  viewAllScansBtn.onclick = async () => {
    await loadRecentScans();
    $('#recentScansList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

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

// --- Registration tab (ported from warehouse-assets) ---
const whAssetForm = $('#assetForm');
if (whAssetForm) {
  whAssetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#formError');
    const res = await fetch('/api/v1/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(whAssetForm))),
    });
    const data = await res.json().catch(() => ({}));
    if (err) {
      err.hidden = false;
      err.textContent = res.ok ? 'Asset registered successfully!' : (data.error || 'Unable to register asset.');
      err.classList.toggle('text-emerald-600', res.ok);
      err.classList.toggle('text-red-600', !res.ok);
    }
    if (res.ok) { whAssetForm.reset(); loadRecentRegistered(); }
  });
}
async function loadRecentRegistered() {
  const el = $('#recentAssets');
  if (!el) return;
  const assets = await loadTabAssets();
  el.innerHTML = assets.slice(-10).reverse().map((a) => `
    <div class="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
      <div><b class="text-sm text-slate-900">${a.name}</b><br><small class="text-xs text-slate-500">${a.category || ''} · <code class="font-mono">${a.qr_code}</code></small></div>
      <span class="px-2 py-1 rounded-full text-xs font-semibold ${a.status === 'Deployed' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}">${a.status}</span>
    </div>`).join('') || '<p class="text-slate-500 text-sm">No assets registered yet.</p>';
}
const refreshAssetsBtn2 = $('#refreshAssets');
if (refreshAssetsBtn2) refreshAssetsBtn2.onclick = loadRecentRegistered;

// --- Tracking tab (ported from warehouse-tracking) ---
let trackAssets = [];
function renderTrackingTable() {
  const el = $('#assetTrackingTable');
  if (!el) return;
  const term = ($('#trackSearch')?.value || '').toLowerCase();
  const status = $('#trackStatusFilter')?.value || '';
  const rows = trackAssets.filter((a) =>
    (!status || a.status === status) &&
    (!term || `${a.name} ${a.qr_code} ${a.location || ''}`.toLowerCase().includes(term)));
  el.innerHTML = rows.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No assets match.</p>'
    : `<table class="w-full text-sm min-w-[640px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 px-4 font-medium text-slate-600">Serial</th><th class="py-2 px-4 font-medium text-slate-600">Asset</th>
        <th class="py-2 px-4 font-medium text-slate-600">Category</th><th class="py-2 px-4 font-medium text-slate-600">Location</th>
        <th class="py-2 px-4 font-medium text-slate-600">Status</th></tr></thead>
        <tbody>${rows.map((a) => `<tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="py-2.5 px-4 font-mono text-xs">${a.qr_code}</td>
          <td class="py-2.5 px-4 font-semibold text-slate-900">${a.name}</td>
          <td class="py-2.5 px-4 text-slate-600">${a.category || '—'}</td>
          <td class="py-2.5 px-4 text-slate-600">${a.location || '—'}</td>
          <td class="py-2.5 px-4"><span class="px-2 py-1 rounded-full text-xs font-semibold ${a.status === 'Deployed' ? 'bg-blue-100 text-blue-700' : a.status === 'In Warehouse' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${a.status}</span></td>
        </tr>`).join('')}</tbody></table>`;
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

// --- Low stock tab ---
async function loadWhLowStock() {
  const el = $('#whLowStockList');
  if (!el) return;
  const data = await api('stock-alerts').catch(() => ({}));
  const items = Array.isArray(data.items) ? data.items : [];
  el.innerHTML = items.length === 0
    ? '<p class="text-slate-500 text-sm col-span-full text-center py-8">No threshold categories configured.</p>'
    : items.map((i) => {
        const pct = i.min_quantity > 0 ? Math.min(100, Math.round((i.on_hand / i.min_quantity) * 100)) : 100;
        return `<div class="p-4 rounded-xl border ${i.deficit ? 'border-red-200 bg-red-50/60' : 'border-slate-200'}">
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-semibold text-slate-800">${i.category}</span>
            <span class="text-xs font-bold ${i.deficit ? 'text-red-600' : 'text-slate-500'}">${i.on_hand} / ${i.min_quantity} min</span>
          </div>
          <div class="w-full bg-slate-200 rounded-full h-2"><div class="${i.deficit ? 'bg-red-500' : 'bg-emerald-500'} h-2 rounded-full" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
}

// --- Returns tab ---
async function loadReturns() {
  const el = $('#returnsList');
  if (!el) return;
  const assets = (await loadTabAssets()).filter((a) => a.status === 'Deployed');
  el.innerHTML = assets.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No deployed assets — nothing is out for return.</p>'
    : `<table class="w-full text-sm min-w-[560px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">Serial</th><th class="py-2 pr-4 font-medium text-slate-600">Asset</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Assigned To</th><th class="py-2 font-medium text-slate-600">Action</th></tr></thead>
        <tbody>${assets.map((a) => `<tr class="border-b border-slate-100">
          <td class="py-2.5 pr-4 font-mono text-xs">${a.qr_code}</td>
          <td class="py-2.5 pr-4 font-semibold text-slate-900">${a.name}</td>
          <td class="py-2.5 pr-4 text-slate-600">${a.external_employee_name || '—'}</td>
          <td class="py-2.5"><button class="action-btn action-btn-receive" onclick="returnAsset('${a.qr_code}')">Return</button></td>
        </tr>`).join('')}</tbody></table>`;
}
window.returnAsset = async (qr) => {
  const ok = await (window.scimConfirm ? scimConfirm({ title: 'Process Return?', message: `Check ${qr} back into warehouse stock?`, confirmLabel: 'Return', icon: 'keyboard_return', danger: false }) : Promise.resolve(true));
  if (!ok) return;
  const res = await fetch('/api/v1/assets/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_code: qr, action: 'Check-In' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Return failed.'); return; }
  if (data.clearance_token) alert(`Exit clearance issued — token ${data.clearance_token} dispatched to Core 3.`);
  loadReturns();
};

// --- History tab ---
async function loadAssetHistory() {
  const el = $('#assetHistoryList');
  if (!el) return;
  const data = await api('inventory/transactions').catch(() => ({}));
  const tx = Array.isArray(data.transactions) ? data.transactions : (Array.isArray(data) ? data : []);
  el.innerHTML = tx.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No movement history yet.</p>'
    : `<table class="w-full text-sm min-w-[560px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">Time</th><th class="py-2 pr-4 font-medium text-slate-600">Asset</th>
        <th class="py-2 pr-4 font-medium text-slate-600">Serial</th><th class="py-2 pr-4 font-medium text-slate-600">Action</th>
        <th class="py-2 font-medium text-slate-600">Zone</th></tr></thead>
        <tbody>${tx.map((t) => `<tr class="border-b border-slate-100">
          <td class="py-2.5 pr-4 text-slate-500 text-xs whitespace-nowrap">${new Date(t.created_at).toLocaleString()}</td>
          <td class="py-2.5 pr-4 font-semibold text-slate-900">${t.asset_name || t.name || '—'}</td>
          <td class="py-2.5 pr-4 font-mono text-xs">${t.qr_code || '—'}</td>
          <td class="py-2.5 pr-4 text-slate-800">${t.action}</td>
          <td class="py-2.5 text-slate-600">${t.zone || '—'}</td>
        </tr>`).join('')}</tbody></table>`;
}

// --- Cost reports tab ---
async function loadCostReports() {
  const el = $('#costReportList');
  if (!el) return;
  const assets = await loadTabAssets();
  const byCat = {};
  assets.forEach((a) => {
    const c = a.category || 'Uncategorized';
    byCat[c] = byCat[c] || { count: 0, value: 0 };
    byCat[c].count++; byCat[c].value += parseFloat(a.value) || 0;
  });
  const rows = Object.entries(byCat).sort((a, b) => b[1].value - a[1].value);
  const total = rows.reduce((s, [, v]) => s + v.value, 0);
  el.innerHTML = rows.length === 0
    ? '<p class="text-slate-500 text-sm text-center py-8">No assets to value.</p>'
    : `<table class="w-full text-sm min-w-[480px]"><thead><tr class="border-b border-slate-200 text-left">
        <th class="py-2 pr-4 font-medium text-slate-600">Category</th><th class="py-2 pr-4 font-medium text-slate-600">Units</th>
        <th class="py-2 font-medium text-slate-600">Total Value</th></tr></thead>
        <tbody>${rows.map(([c, v]) => `<tr class="border-b border-slate-100">
          <td class="py-2.5 pr-4 font-semibold text-slate-900">${c}</td>
          <td class="py-2.5 pr-4 text-slate-600">${v.count}</td>
          <td class="py-2.5 text-slate-900 font-medium">₱${v.value.toLocaleString()}</td>
        </tr>`).join('')}
        <tr class="font-bold"><td class="py-3 pr-4">TOTAL</td><td class="py-3 pr-4">${assets.length}</td><td class="py-3">₱${total.toLocaleString()}</td></tr></tbody></table>`;
}

const whTabLoaders = {
  register: loadRecentRegistered,
  tracking: loadTracking,
  lowstock: loadWhLowStock,
  returns: loadReturns,
  history: loadAssetHistory,
  costs: loadCostReports,
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

if (window.initHubTabs) initHubTabs('overview');
