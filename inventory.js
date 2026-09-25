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
            <td><span class="tag">${asset.qr_code}</span></td>
            <td><b>${asset.name}</b></td>
            <td>${asset.category}</td>
            <td><span class="tag ${getStatusClass(asset.status)}">${asset.status}</span></td>
            <td>${money(asset.value)}</td>
            <td>${asset.location || 'N/A'}</td>
            <td>
              <button class="action-btn" onclick="viewAsset('${asset.qr_code}')">View</button>
              <button class="action-btn" onclick="editAsset('${asset.qr_code}')">Edit</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#assetTable').innerHTML = tableHTML;
}

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
  // Placeholder for QR detection - integrate jsQR library in production
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
    const response = await api(`inventory/assets/${qrCode}`);
    const asset = response.asset;
    alert(`Asset Details:\nName: ${asset.name}\nQR: ${asset.qr_code}\nCategory: ${asset.category}\nStatus: ${asset.status}\nValue: ${money(asset.value)}\nLocation: ${asset.location || 'N/A'}`);
  } catch (error) {
    console.error('Error viewing asset:', error);
  }
};

window.editAsset = (qrCode) => {
  alert(`Edit functionality for ${qrCode} - to be implemented`);
};

// Load inventory data on page load
loadInventoryData();

// Add Asset Button - Redirect to dedicated page
const addAssetBtn = $('#addAsset');
if (addAssetBtn) {
  addAssetBtn.onclick = () => {
    window.location.href = 'inventory-add.html';
  };
}
