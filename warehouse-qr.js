// ==========================================
// WAREHOUSE QR SCANNER PAGE LOGIC
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
  loadRecentScans();
});

let currentAction = 'Inventory Intake';
let cameraStream = null;
let qrDetectionFrame = null;
let allScans = [];

// ==========================================
// CAMERA INITIALIZATION
// ==========================================
async function initializeCamera() {
  const video = $('#cameraPreview');
  const fallback = $('#cameraFallback');
  const status = $('#scannerStatus');

  if (!video || !fallback || !status) return;

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
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

// Enable camera button
const enableCamera = $('#enableCamera');
if (enableCamera) {
  enableCamera.onclick = () => {
    initializeCamera();
  };
}

const closeScan = $('#closeScan');
if (closeScan) {
  closeScan.onclick = () => {
    stopCamera();
  };
}

// ==========================================
// MODE SELECTION
// ==========================================
const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach((btn) => {
  btn.onclick = () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.dataset.mode;
    updateExtraFields();
  };
});

function updateExtraFields() {
  const extraFields = $('#extraFields');
  const extraInput = $('#extraInput');
  
  if (!extraFields || !extraInput) return;
  
  if (currentAction === 'Assign to Staff') {
    extraFields.classList.remove('hidden');
    extraInput.placeholder = 'Employee name...';
  } else if (currentAction === 'Move to Zone') {
    extraFields.classList.remove('hidden');
    extraInput.placeholder = 'Zone / aisle (e.g. A-02)...';
  } else if (currentAction === 'PO Receipt') {
    extraFields.classList.remove('hidden');
    extraInput.placeholder = 'PO number (optional)...';
  } else {
    extraFields.classList.add('hidden');
  }
}

// ==========================================
// QR DETECTION
// ==========================================
function startQRDetection() {
  const video = $('#cameraPreview');
  const canvas = document.createElement('canvas');
  const result = $('#scanResult');
  if (!video || !cameraStream) return;

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

// ==========================================
// SCAN RECORDING
// ==========================================
const scanNow = $('#scanNow');
if (scanNow) {
  scanNow.onclick = async () => {
    const qrInput = $('#qr');
    const scanResult = $('#scanResult');
    const extraInput = $('#extraInput');
    
    if (!qrInput) return;
    
    if (!qrInput.value.trim()) {
      if (scanResult) scanResult.textContent = 'Scan or enter a QR code first.';
      return;
    }

    const payload = {
      qr_code: qrInput.value.trim(),
      action: currentAction
    };
    
    if (currentAction === 'Assign to Staff' && extraInput) {
      payload.assignee = extraInput.value.trim();
    }
    if (currentAction === 'Move to Zone' && extraInput) {
      payload.zone = extraInput.value.trim();
    }
    if (currentAction === 'PO Receipt' && extraInput) {
      payload.po_number = extraInput.value.trim();
    }

    try {
      const response = await fetch('/api/v1/assets/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (scanResult) {
        scanResult.textContent = response.ok
          ? `${data.action}: ${data.asset ? data.asset.name : qrInput.value}`
          : data.error || 'Unable to record scan.';
      }

      if (response.ok) {
        await loadRecentScans();
        qrInput.value = '';
        if (extraInput) extraInput.value = '';
      }
    } catch (error) {
      console.error('Error recording scan:', error);
      if (scanResult) scanResult.textContent = 'Unable to reach the server. Please try again.';
    }
  };
}

// ==========================================
// RECENT SCANS
// ==========================================
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

  const scansHTML = allScans.slice(0, 10).map(scan => `
    <div class="row">
      <div>
        <b>${scan.action}</b><br>
        <small>${scan.qr_code} · Zone ${scan.zone || 'N/A'}</small>
      </div>
      <small>${new Date(scan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
    </div>
  `).join('');

  recentScansListEl.innerHTML = scansHTML || '<p class="text-on-surface-variant text-sm">No recent scans</p>';
}

const refreshScansBtn = $('#refreshScans');
if (refreshScansBtn) {
  refreshScansBtn.onclick = () => {
    loadRecentScans();
  };
}
