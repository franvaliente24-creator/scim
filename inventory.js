// ==========================================
// INVENTORY MANAGEMENT SYSTEM PAGE LOGIC
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

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

// Show loading state
function showLoading(containerId) {
  const container = $(containerId);
  if (container) {
    container.innerHTML = '<div class="text-center py-8"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div><p class="text-slate-500 mt-2">Loading...</p></div>';
  }
}

// Show error state
function showError(containerId, message) {
  const container = $(containerId);
  if (container) {
    container.innerHTML = `<div class="text-center py-8 text-red-500"><p>${message}</p></div>`;
  }
}

// Initialize permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Show loading states
  showLoading('#assetsContainer');
  
  try {
    await initializePermissions();
    await loadInventoryData();
  } catch (error) {
    console.error('Error initializing page:', error);
    showError('#assetsContainer', 'Failed to load data. Please refresh the page.');
  }
});

// ==========================================
// INVENTORY DATA LOADING
// ==========================================
async function loadInventoryData() {
  try {
    const response = await api('inventory/assets');
    const data = response.assets || response;
    const assets = Array.isArray(data) ? data : [];

    // Calculate stats
    const totalAssets = assets.length;
    const totalValue = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
    const deployedAssets = assets.filter(asset => asset.status === 'Deployed').length;
    const warehouseAssets = assets.filter(asset => asset.status === 'In Warehouse').length;

    // Update stats
    const totalAssetsEl = $('#totalAssets');
    if (totalAssetsEl) totalAssetsEl.textContent = totalAssets;
    
    const totalValueEl = $('#totalValue');
    if (totalValueEl) totalValueEl.textContent = money(totalValue);
    
    const deployedAssetsEl = $('#deployedAssets');
    if (deployedAssetsEl) deployedAssetsEl.textContent = deployedAssets;
    
    const warehouseAssetsEl = $('#warehouseAssets');
    if (warehouseAssetsEl) warehouseAssetsEl.textContent = warehouseAssets;

    // Render asset table
    renderAssetTable(assets);

    // Load recent transactions
    loadRecentTransactions();
  } catch (error) {
    console.error('Error loading inventory data:', error);
  }
}

function renderAssetTable(assets) {
  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>QR Code</th>
          <th>Asset Name</th>
          <th>Category</th>
          <th>Status</th>
          <th>Value</th>
          <th>Location</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${assets.map(asset => `
          <tr>
            <td><span class="tag">${escapeHTML(asset.qr_code)}</span></td>
            <td><b>${escapeHTML(asset.name)}</b></td>
            <td>${escapeHTML(asset.category)}</td>
            <td><span class="tag ${getStatusClass(asset.status)}">${escapeHTML(asset.status)}</span></td>
            <td>${money(asset.value)}</td>
            <td>${escapeHTML(asset.location || 'N/A')}</td>
            <td>
              <button class="action-btn" type="button" data-asset-action="view" data-qr-code="${escapeHTML(asset.qr_code)}">View</button>
              <button class="action-btn" type="button" data-asset-action="edit" data-qr-code="${escapeHTML(asset.qr_code)}">Edit</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#assetTable').innerHTML = tableHTML;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-asset-action][data-qr-code]');
  if (!button) return;

  const { assetAction, qrCode } = button.dataset;
  if (assetAction === 'view') window.viewAsset(qrCode);
  if (assetAction === 'edit') window.editAsset(qrCode);
});

const assetModal = $('#assetModal');
const assetForm = $('#assetForm');
const assetModalTitle = $('#assetModalTitle');
const assetFormError = $('#assetFormError');
let editingAssetQr = null;

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', 'open');
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function openAssetForm(asset = null) {
  if (!assetForm || !assetModal) return;
  editingAssetQr = asset?.qr_code || null;
  assetModalTitle.textContent = editingAssetQr ? 'Edit Asset' : 'Add Asset';
  assetForm.elements.qr_code.readOnly = Boolean(editingAssetQr);
  assetForm.elements.qr_code.value = asset?.qr_code || '';
  assetForm.elements.name.value = asset?.name || '';
  assetForm.elements.category.value = asset?.category || '';
  assetForm.elements.status.value = asset?.status || 'In Warehouse';
  assetForm.elements.value.value = asset?.value ?? '';
  assetForm.elements.location.value = asset?.location || '';
  assetFormError.hidden = true;
  assetFormError.textContent = '';
  showDialog(assetModal);
}

$('#closeAssetModal')?.addEventListener('click', () => closeDialog(assetModal));
$('#closeViewAsset')?.addEventListener('click', () => closeDialog($('#viewAssetModal')));

assetForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(assetForm).entries());
  const endpoint = editingAssetQr
    ? `/api/v1/inventory/assets/${encodeURIComponent(editingAssetQr)}`
    : '/api/v1/inventory/assets';

  try {
    const response = await fetch(endpoint, {
      method: editingAssetQr ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      assetFormError.textContent = result.error || 'Unable to save asset.';
      assetFormError.hidden = false;
      return;
    }

    closeDialog(assetModal);
    assetForm.reset();
    await loadInventoryData();
  } catch (error) {
    console.error('Error saving asset:', error);
    assetFormError.textContent = 'Unable to reach the server. Please try again.';
    assetFormError.hidden = false;
  }
});

function getStatusClass(status) {
  switch (status) {
    case 'Deployed':
      return 'status-deployed';
    case 'In Maintenance':
      return 'status-maintenance';
    case 'In Warehouse':
    default:
      return 'status-warehouse';
  }
}

function renderAssetCategories(assets) {
  const categories = {};
  assets.forEach(asset => {
    const category = asset.category || 'Uncategorized';
    if (!categories[category]) {
      categories[category] = { count: 0, value: 0 };
    }
    categories[category].count++;
    categories[category].value += Number(asset.value || 0);
  });

  const categoriesHTML = Object.entries(categories).map(([category, data]) => `
    <div class="row">
      <div>
        <b>${category}</b><br>
        <small>${data.count} assets</small>
      </div>
      <b>${money(data.value)}</b>
    </div>
  `).join('');

  $('#assetCategories').innerHTML = categoriesHTML;
}

async function loadRecentTransactions() {
  try {
    const response = await api('inventory/transactions');
    const data = response.transactions || response;
    const transactions = Array.isArray(data) ? data : [];

    const transactionTableEl = $('#transactionTable');
    if (!transactionTableEl) return;

    const transactionsHTML = transactions.map(transaction => `
      <div class="row">
        <div>
          <b>${transaction.action}</b><br>
          <small>${transaction.qr_code} · ${transaction.asset_name}</small>
        </div>
        <small>${new Date(transaction.created_at).toLocaleString()}</small>
      </div>
    `).join('');

    transactionTableEl.innerHTML = transactionsHTML || '<p class="text-on-surface-variant text-sm">No recent transactions</p>';
  } catch (error) {
    console.error('Error loading recent transactions:', error);
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
      if (typeof scanner.showModal === 'function') {
        scanner.showModal();
      } else {
        scanner.setAttribute('open', 'open');
      }
      initializeCamera();
    }
  };
}

const closeScan = $('#closeScan');
if (closeScan) {
  closeScan.onclick = () => {
    stopCamera();
    const scanner = $('#scanner');
    if (scanner) {
      if (typeof scanner.close === 'function') {
        scanner.close();
      } else {
        scanner.removeAttribute('open');
      }
    }
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

const enableCamera = $('#enableCamera');
if (enableCamera) {
  enableCamera.onclick = () => {
    initializeCamera();
  };
}

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
  const resultEl = $('#scanResult');

  if (!video || !canvas || !cameraStream || !window.jsQR) {
    return;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const detect = () => {
    if (video.readyState === video.HAVE_CURRENT_DATA) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        const qrInput = $('#qr');
        if (qrInput) {
          qrInput.value = code.data;
        }
        if (resultEl) {
          resultEl.textContent = `QR detected: ${code.data}`;
        }
        return;
      }
    }

    requestAnimationFrame(detect);
  };

  requestAnimationFrame(detect);
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
      loadInventoryData();
    }
  };
}

// Asset action functions
window.viewAsset = async (qrCode) => {
  try {
    const response = await fetch(`/api/v1/inventory/assets/${encodeURIComponent(qrCode)}`);
    const payload = await response.json();
    const asset = payload.asset || payload;

    if (!response.ok || !asset || asset.error) {
      alert(asset?.error || 'Asset not found');
      return;
    }

    const details = $('#viewAssetDetails');
    details.innerHTML = `
      <div><dt>QR Code</dt><dd>${escapeHTML(asset.qr_code)}</dd></div>
      <div><dt>Name</dt><dd>${escapeHTML(asset.name)}</dd></div>
      <div><dt>Category</dt><dd>${escapeHTML(asset.category)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHTML(asset.status)}</dd></div>
      <div><dt>Value</dt><dd>${escapeHTML(money(asset.value))}</dd></div>
      <div><dt>Location</dt><dd>${escapeHTML(asset.location || 'N/A')}</dd></div>`;
    showDialog($('#viewAssetModal'));
  } catch (error) {
    console.error('Error viewing asset:', error);
    alert('Unable to load asset details.');
  }
};

window.editAsset = (qrCode) => {
  if (!qrCode) {
    alert('Asset QR code is missing.');
    return;
  }

  fetch(`/api/v1/inventory/assets/${encodeURIComponent(qrCode)}`)
    .then(async (response) => {
      const payload = await response.json();
      const asset = payload.asset || payload;
      if (!response.ok || !asset || asset.error) throw new Error(asset?.error || 'Asset not found');
      openAssetForm(asset);
    })
    .catch((error) => {
      console.error('Error loading asset for editing:', error);
      alert(error.message || 'Unable to load asset for editing.');
    });
};

// Add Asset Button - open the in-module form
const addAssetBtn = $('#addAsset');
if (addAssetBtn) {
  addAssetBtn.addEventListener('click', () => openAssetForm());
}

