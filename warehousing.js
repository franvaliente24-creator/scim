// ==========================================
// SMART WAREHOUSING SYSTEM PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

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
    $('#totalCapacity').textContent = totalCapacity;
    $('#currentOccupancy').textContent = `${utilizationRate}%`;
    $('#availableBins').textContent = availableBins;
    $('#criticalZones').textContent = criticalZones;

    // Render warehouse grid
    renderWarehouseGrid(zones);

    // Render zone details
    renderZoneDetails(zones);

    // Load recent scans
    loadRecentScans();
  } catch (error) {
    console.error('Error loading warehouse data:', error);
  }
}

function renderWarehouseGrid(zones) {
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

  $('#warehouseGrid').innerHTML = gridHTML;
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

function renderZoneDetails(zones) {
  const detailsHTML = zones.map(zone => {
    const occupancyPercent = Math.round((zone.occupied / zone.capacity) * 100);
    const alertClass = occupancyPercent > 85 ? 'danger' : occupancyPercent >= 60 ? 'warn' : '';
    
    return `
      <div class="row">
        <div>
          <b>Zone ${zone.zone}</b><br>
          <small>Capacity: ${zone.capacity} bins · Occupied: ${zone.occupied}</small>
        </div>
        <div class="zone-status ${alertClass}">
          ${occupancyPercent}%
        </div>
      </div>
    `;
  }).join('');

  $('#zoneDetails').innerHTML = detailsHTML;
}

async function loadRecentScans() {
  try {
    const response = await api('warehouse/scans');
    const scans = response.scans || response;

    const scansHTML = scans.map(scan => `
      <div class="row">
        <div>
          <b>${scan.action}</b><br>
          <small>${scan.qr_code} · Zone ${scan.zone || 'N/A'}</small>
        </div>
        <small>${new Date(scan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
    `).join('');

    $('#recentScans').innerHTML = scansHTML;
  } catch (error) {
    console.error('Error loading recent scans:', error);
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Navigation & Sidebar
$('#toggle').onclick = () => {
  if (window.innerWidth < 850) {
    $('#sidebar').classList.toggle('open');
  } else {
    $('#sidebar').classList.toggle('collapsed');
  }
};

$('#profile').onclick = () => {
  $('#profileMenu').hidden = !$('#profileMenu').hidden;
};

$('#usersLink').onclick = () => {
  window.location.href = 'users.html';
};

$('#logout').onclick = () => {
  window.location.href = 'login.html';
};

// Scanner Modal Controls
$('#mobileBtn').onclick = () => {
  $('#scanner').showModal();
  initializeCamera();
};

$('#closeScan').onclick = () => {
  stopCamera();
  $('#scanner').close();
};

let currentAction = 'Inventory Intake';
let cameraStream = null;

// Camera initialization
async function initializeCamera() {
  const video = $('#cameraPreview');
  const fallback = $('#cameraFallback');
  const status = $('#scannerStatus');

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
  $('#cameraPreview').style.display = 'none';
  $('#cameraFallback').style.display = 'grid';
  $('#scannerStatus').textContent = '● Camera stopped';
  $('#scannerStatus').style.color = '#64748b';
}

// Enable camera button (for fallback)
$('#enableCamera').onclick = () => {
  initializeCamera();
};

// Mode selection
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.mode;
  };
});

// QR Detection (simplified - in production, use a library like jsQR)
function startQRDetection() {
  // This is a placeholder for QR detection
  // In production, integrate a library like jsQR or html5-qrcode
  // For now, users can manually enter QR codes or use the camera as a visual reference
  
  // Example implementation with jsQR would be:
  // const canvas = $('#qrCanvas');
  // const video = $('#cameraPreview');
  // const context = canvas.getContext('2d');
  // 
  // setInterval(() => {
  //   if (video.readyState === video.HAVE_ENOUGH_DATA) {
  //     canvas.height = video.videoHeight;
  //     canvas.width = video.videoWidth;
  //     context.drawImage(video, 0, 0, canvas.width, canvas.height);
  //     
  //     const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  //     const code = jsQR(imageData.data, imageData.width, imageData.height);
  //     
  //     if (code) {
  //       $('#qr').value = code.data;
  //       // Auto-scan could be triggered here
  //     }
  //   }
  // }, 500);
}

$('#scanNow').onclick = async () => {
  const response = await fetch('/api/v1/assets/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_code: $('#qr').value,
      action: currentAction,
    }),
  });

  const data = await response.json();

  $('#scanResult').textContent = response.ok
    ? `${data.asset.name} recorded for ${currentAction}.`
    : data.error;

  if (response.ok) {
    loadWarehouseData();
  }
};

// Load warehouse data on page load
loadWarehouseData();
