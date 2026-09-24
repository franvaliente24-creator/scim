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

  const gridHTML = zones.map(zone => {
    const occupancyPercent = Math.round((zone.occupied / zone.capacity) * 100);
    const alertClass = occupancyPercent > 85 ? 'danger' : occupancyPercent >= 60 ? 'warn' : '';
    
    return `
      <div class="warehouse-zone ${alertClass}" data-zone="${zone.zone}">
        <div class="zone-header">
          <b>Zone ${zone.zone}</b>
          <span>${zone.occupied}/${zone.capacity}</span>
        </div>
        <div class="zone-bar">
          <div class="zone-fill" style="width: ${occupancyPercent}%"></div>
        </div>
        <div class="zone-rows">
          ${renderZoneRows(zone.rows || [])}
        </div>
      </div>
    `;
  }).join('');

  gridEl.innerHTML = gridHTML;
}

function renderZoneRows(rows) {
  if (!rows || rows.length === 0) {
    return '<div class="zone-rows-placeholder">No row data available</div>';
  }

  return rows.map(row => {
    const rowOccupancy = Math.round((row.occupied / row.capacity) * 100);
    const rowClass = rowOccupancy > 85 ? 'danger' : rowOccupancy >= 60 ? 'warn' : '';
    
    return `
      <div class="warehouse-row ${rowClass}">
        <span>Row ${row.row}</span>
        <span>${row.occupied}/${row.capacity}</span>
      </div>
    `;
  }).join('');
}

async function loadRecentScans() {
  try {
    const response = await api('warehouse/scans');
    const scans = response.scans || response;

    const recentScansListEl = $('#recentScansList');
    if (!recentScansListEl) return;

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
  } catch (error) {
    console.error('Error loading recent scans:', error);
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Scanner Modal Controls
const mobileBtn = $('#mobileBtn');
if (mobileBtn) {
  mobileBtn.onclick = () => {
    const scanner = $('#scanner');
    if (scanner) {
      scanner.showModal();
      initializeCamera();
    }
  };
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
    video.style.display = 'none';
    fallback.style.display = 'grid';
    status.textContent = '● Camera unavailable';
    status.style.color = '#dc2626';
  }
}

function stopCamera() {
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

// QR Detection (simplified - in production, use a library like jsQR)
function startQRDetection() {
  // This is a placeholder for QR detection
  // In production, integrate a library like jsQR or html5-qrcode
  // For now, users can manually enter QR codes or use the camera as a visual reference
}

const scanNow = $('#scanNow');
if (scanNow) {
  scanNow.onclick = async () => {
    const qrInput = $('#qr');
    const scanResult = $('#scanResult');
    
    if (!qrInput) return;
    
    const response = await fetch('/api/v1/assets/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_code: qrInput.value,
        action: currentAction,
      }),
    });

    const data = await response.json();

    if (scanResult) {
      scanResult.textContent = response.ok
        ? `${data.asset.name} recorded for ${currentAction}.`
        : data.error;
    }

    if (response.ok) {
      loadWarehouseData();
    }
  };
}

// Load warehouse data on page load
loadWarehouseData();
