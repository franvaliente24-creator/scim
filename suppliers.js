// ==========================================
// SUPPLIER/VENDOR MANAGEMENT PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

// ==========================================
// SUPPLIER DATA LOADING
// ==========================================
async function loadSupplierData() {
  try {
    const response = await api('suppliers');
    const suppliers = response.suppliers || response;

    // Calculate stats
    const totalSuppliers = suppliers.length;
    const avgRating = suppliers.length > 0 
      ? (suppliers.reduce((sum, s) => sum + (s.rating || 0), 0) / suppliers.length).toFixed(1)
      : '0.0';
    const avgOnTime = suppliers.length > 0
      ? Math.round(suppliers.reduce((sum, s) => sum + (s.on_time_rate || 0), 0) / suppliers.length)
      : 0;
    const avgDefect = suppliers.length > 0
      ? Math.round(suppliers.reduce((sum, s) => sum + (s.defect_rate || 0), 0) / suppliers.length)
      : 0;

    // Update stats
    $('#totalSuppliers').textContent = totalSuppliers;
    $('#avgRating').textContent = avgRating;
    $('#avgOnTime').textContent = `${avgOnTime}%`;
    $('#avgDefect').textContent = `${avgDefect}%`;

    // Render supplier table
    renderSupplierTable(suppliers);

    // Render top suppliers
    renderTopSuppliers(suppliers);

    // Render suppliers needing attention
    renderAttentionSuppliers(suppliers);
  } catch (error) {
    console.error('Error loading supplier data:', error);
  }
}

function renderSupplierTable(suppliers) {
  const tableHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Supplier</th>
          <th>Category</th>
          <th>Rating</th>
          <th>On-Time Rate</th>
          <th>Defect Rate</th>
          <th>Contact</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${suppliers.map(supplier => `
          <tr>
            <td><b>${supplier.name}</b></td>
            <td>${supplier.category}</td>
            <td><span class="rating-star">★ ${supplier.rating.toFixed(1)}</span></td>
            <td>
              <div class="metric-bar">
                <div class="metric-fill ${getPerformanceClass(supplier.on_time_rate, 90, 75)}" style="width: ${supplier.on_time_rate}%"></div>
              </div>
              <small>${supplier.on_time_rate}%</small>
            </td>
            <td>
              <div class="metric-bar">
                <div class="metric-fill ${getDefectClass(supplier.defect_rate, 5, 10)}" style="width: ${Math.min(supplier.defect_rate * 5, 100)}%"></div>
              </div>
              <small>${supplier.defect_rate}%</small>
            </td>
            <td>${supplier.email}</td>
            <td>
              <button class="action-btn" onclick="viewSupplier('${supplier.id}')">View</button>
              <button class="action-btn" onclick="editSupplier('${supplier.id}')">Edit</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  $('#supplierTable').innerHTML = tableHTML;
}

function getPerformanceClass(value, excellent, good) {
  if (value >= excellent) return 'performance-excellent';
  if (value >= good) return 'performance-good';
  return 'performance-poor';
}

function getDefectClass(value, poor, acceptable) {
  if (value <= poor) return 'defect-excellent';
  if (value <= acceptable) return 'defect-good';
  return 'defect-poor';
}

function renderTopSuppliers(suppliers) {
  const topSuppliers = [...suppliers]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);

  const topHTML = topSuppliers.map((supplier, index) => `
    <div class="row">
      <div>
        <b>${index + 1}. ${supplier.name}</b><br>
        <small>${supplier.category} · ${supplier.on_time_rate}% on-time</small>
      </div>
      <div class="rating-badge">★ ${supplier.rating.toFixed(1)}</div>
    </div>
  `).join('');

  $('#topSuppliers').innerHTML = topHTML;
}

function renderAttentionSuppliers(suppliers) {
  const attentionSuppliers = suppliers.filter(s => 
    s.on_time_rate < 75 || s.defect_rate > 10 || s.rating < 3.0
  );

  const attentionHTML = attentionSuppliers.map(supplier => `
    <div class="row">
      <div>
        <b>${supplier.name}</b><br>
        <small>${supplier.on_time_rate}% on-time · ${supplier.defect_rate}% defects</small>
      </div>
      <span class="tag status-pending">Needs Review</span>
    </div>
  `).join('');

  $('#attentionSuppliers').innerHTML = attentionHTML || '<p class="muted">No suppliers need attention</p>';
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

// Add Supplier Modal
$('#addSupplierBtn').onclick = () => $('#addSupplierModal').showModal();
$('#closeSupplier').onclick = () => $('#addSupplierModal').close();

$('#addSupplierForm').onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);

  const response = await fetch('/api/v1/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(formData)),
  });

  if (response.ok) {
    $('#addSupplierModal').close();
    e.target.reset();
    loadSupplierData();
  } else {
    alert('Failed to add supplier');
  }
};

// Search functionality
$('#searchSuppliers').oninput = (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#supplierTable tbody tr');
  
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
    loadSupplierData();
  }
};

// Supplier action functions
window.viewSupplier = async (supplierId) => {
  try {
    const response = await api(`suppliers/${supplierId}`);
    const supplier = response.supplier;
    alert(`Supplier Details:\nName: ${supplier.name}\nCategory: ${supplier.category}\nRating: ★ ${supplier.rating.toFixed(1)}\nOn-Time Rate: ${supplier.on_time_rate}%\nDefect Rate: ${supplier.defect_rate}%\nEmail: ${supplier.email}\nPhone: ${supplier.phone || 'N/A'}`);
  } catch (error) {
    console.error('Error viewing supplier:', error);
  }
};

window.editSupplier = (supplierId) => {
  alert(`Edit functionality for supplier ${supplierId} - to be implemented`);
};

// Load supplier data on page load
loadSupplierData();
