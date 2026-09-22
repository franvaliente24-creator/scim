// ==========================================
// INVENTORY MANAGEMENT SYSTEM PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

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
    const maintenanceAssets = assets.filter(asset => asset.status === 'In Maintenance').length;

    // Update stats
    $('#totalAssets').textContent = totalAssets;
    $('#totalValue').textContent = money(totalValue);
    $('#deployedAssets').textContent = deployedAssets;
    $('#maintenanceAssets').textContent = maintenanceAssets;

    // Render asset table
    renderAssetTable(assets);

    // Render asset categories
    renderAssetCategories(assets);

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

    const transactionsHTML = transactions.map(transaction => `
      <div class="row">
        <div>
          <b>${transaction.action}</b><br>
          <small>${transaction.qr_code} · ${transaction.asset_name}</small>
        </div>
        <small>${new Date(transaction.created_at).toLocaleString()}</small>
      </div>
    `).join('');

  $('#recentTransactions').innerHTML = transactionsHTML;
  } catch (error) {
    console.error('Error loading recent transactions:', error);
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

// Add Asset Modal
$('#addAssetBtn').onclick = () => $('#addAssetModal').showModal();
$('#closeAddAsset').onclick = () => $('#addAssetModal').close();

$('#addAssetForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const response = await fetch('/api/v1/inventory/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData)),
  });

  if (response.ok) {
    $('#addAssetModal').close();
    e.target.reset();
    loadInventoryData();
  } else {
    alert('Failed to add asset');
  }
};

// Search functionality
$('#searchAssets').oninput = (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#assetTable tbody tr');
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? '' : 'none';
  });
};

// Scanner Modal Controls
$('#mobileBtn').onclick = () => $('#scanner').showModal();
$('#closeScan').onclick = () => $('#scanner').close();

let currentAction = 'Inventory Intake';

document.querySelectorAll('.modes button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.modes button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentAction = btn.textContent;
  };
});

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
    loadInventoryData();
  }
};

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
