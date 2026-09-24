// ==========================================
// DASHBOARD PAGE LOGIC
// ==========================================

const $ = (selector) => document.querySelector(selector);

const api = (path) => fetch(`/api/v1/${path}`).then((res) => res.json());

async function requireSession() {
  const response = await fetch('/api/v1/auth/me');
  const data = await response.json();
  if (!data.user) {
    window.location.replace('login.html');
    return false;
  }
  document.querySelector('#profile').textContent = data.user.initials;
  return true;
}

const money = (amount) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);

// ==========================================
// DASHBOARD & DATA LOADING
// ==========================================
async function load() {
  const [dash, pos, vendors, docs] = await Promise.all([
    api('dashboard'),
    api('pos'),
    api('suppliers'),
    api('documents'),
  ]);

  const stats = dash.stats;
  const purchaseOrders = Array.isArray(pos.pos) ? pos.pos : [];
  const vendorList = Array.isArray(vendors.suppliers) ? vendors.suppliers : [];
  const documentList = Array.isArray(docs.documents) ? docs.documents : [];

  // Render Stats
  $('#stats').innerHTML = [
    ['Total inventory value', money(stats.value), `Across ${stats.total} tracked assets`],
    ['Asset deployment mix', `${stats.deployed} deployed`, `${Math.round((stats.deployed / stats.total) * 100)}% of inventory`],
    ['Active purchase orders', purchaseOrders.filter((x) => x.status !== 'Received').length, 'In the approval pipeline'],
    ['Compliance alerts', documentList.filter((x) => x.status !== 'Verified').length, 'Items need attention'],
  ]
    .map(
      ([title, value, subtitle]) => `
        <div class="stat">
          <p>${title}</p>
          <strong>${value}</strong>
          <small>${subtitle}</small>
        </div>
      `
    )
    .join('');

  // Render Zones
  $('#zones').innerHTML = dash.zones
    .map((z) => {
      const alertClass = z.pct > 85 ? 'danger' : z.pct >= 60 ? 'warn' : '';
      return `
        <div class="zone">
          <b>Zone ${z.zone}</b>
          <span>${z.occupied}/${z.capacity} bins</span>
          <div class="bar ${alertClass}">
            <i style="width: ${z.pct}%"></i>
          </div>
        </div>
      `;
    })
    .join('');

  // Render Purchase Orders
  $('#pos').innerHTML = purchaseOrders
    .map(
      (p) => `
        <div class="row">
          <div>
            <b>${p.po_number}</b><br>
            <small>${p.vendor_name || p.vendor} · ${money(p.total)}</small>
          </div>
          <span class="tag">${p.status}</span>
        </div>
      `
    )
    .join('');

  // Render Vendors
  $('#vendors').innerHTML = vendorList
    .map(
      (v) => `
        <div class="row">
          <div>
            <b>${v.name}</b><br>
            <small>${v.on_time_rate}% on-time · ${v.defect_rate}% defect rate</small>
          </div>
          <b>★ ${v.rating}</b>
        </div>
      `
    )
    .join('');

  // Render Recent Scans
  $('#scans').innerHTML = dash.scans
    .map(
      (x) => `
        <div class="row">
          <div>
            <b>${x.action}</b><br>
            <small>${x.name} · ${x.qr_code}</small>
          </div>
          <small>${new Date(x.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      `
    )
    .join('');

  // Render Documents
  $('#docs').innerHTML = documentList
    .map(
      (d) => `
        <div class="row">
          <div>
            <b>${d.document_type}</b><br>
            <small>${d.reference_no} · ${d.owner}</small>
          </div>
          <span class="tag">${d.status}</span>
        </div>
      `
    )
    .join('');
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

$('#usersLink').onclick = () => { window.location.href = 'users.html'; };

$('#mfaSetupLink').onclick = () => { window.location.href = 'mfa-setup.html'; };

$('#logout').onclick = () => {
  fetch('/api/v1/auth/logout', { method: 'POST' }).finally(() => {
    window.location.href = 'login.html';
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

  if (response.ok) load();
};

// Load dashboard data only after a valid server-side session is confirmed.
requireSession().then((signedIn) => signedIn && load());
