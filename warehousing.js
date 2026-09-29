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

// Scanner Modal Controls — opened from the hero panel (the global FAB also
// triggers the shared quick-scan modal on every page)
const heroScanBtn = $('#heroScanBtn');
const openScanner = () => {
  const scanner = $('#scanner');
  if (scanner) {
    scanner.showModal();
    initializeCamera();
  }
};
if (heroScanBtn) {
  heroScanBtn.onclick = openScanner;
}

// Sidebar deep links: #scan opens the scanner, #zones opens zone config
if (window.location.hash === '#scan') {
  setTimeout(openScanner, 400);
}
if (window.location.hash === '#zones') {
  setTimeout(() => addZoneModal?.showModal(), 400);
}

const closeScan = $('#closeScan');
if (closeScan) {
  closeScan.onclick = () => {
    stopCamera();
    const scanner = $('#scanner');
    if (scanner) scanner.close();
  };
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
modeButtons.forEach((btn) => {
  btn.onclick = () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.mode;
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

    try {
      const response = await fetch('/api/v1/assets/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code: qrInput.value.trim(), action: currentAction }),
      });
      const data = await response.json();

      if (scanResult) {
        scanResult.textContent = response.ok
          ? `${data.asset.name} recorded for ${currentAction}.`
          : data.error || 'Unable to record scan.';
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
