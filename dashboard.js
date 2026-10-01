// ==========================================
// DASHBOARD PAGE LOGIC
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

let lastDashboardData = null;

// Initialize permissions on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializePermissions();
  await requireSession().then((signedIn) => signedIn && load());
});

async function requireSession() {
  const response = await fetch('/api/v1/auth/me');
  const data = await response.json();
  if (!data.user) {
    window.location.replace('login.html');
    return false;
  }
  
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
  try {
    const [dash, pos, vendors, docs, sync, stockAlerts, kpi] = await Promise.all([
      api('dashboard'),
      api('pos'),
      api('suppliers'),
      api('documents'),
      api('sync-status'),
      api('stock-alerts'),
      api('dashboard/metrics'),
    ]);

    const stats = dash.stats || {};
    const purchaseOrders = Array.isArray(pos.pos) ? pos.pos : [];
    const vendorList = Array.isArray(vendors.suppliers) ? vendors.suppliers : [];
    const documentList = Array.isArray(docs.documents) ? docs.documents : [];
    const zones = Array.isArray(dash.zones) ? dash.zones : [];
    const scans = Array.isArray(dash.scans) ? dash.scans : [];
    
    // Store for export
    lastDashboardData = { stats, purchaseOrders, vendorList, documentList, zones, scans };

    // Render Stats - Show 0 if no data
    const statsEl = $('#stats');
    if (statsEl) {
      const totalAssets = stats.total || 0;
      const deployed = stats.deployed || 0;
      const totalValue = stats.value || 0;
      
      statsEl.innerHTML = [
        ['Total inventory value', money(totalValue), `Across ${totalAssets} tracked assets`],
        ['Asset deployment mix', `${deployed} deployed`, totalAssets > 0 ? `${Math.round((deployed / totalAssets) * 100)}% of inventory` : 'No assets'],
        ['Active purchase orders', purchaseOrders.filter((x) => x.status !== 'Received').length, 'In the approval pipeline'],
        ['Compliance alerts', documentList.filter((x) => x.status !== 'Verified').length, 'Items need attention'],
      ]
        .map(
          ([title, value, subtitle]) => `
            <div class="bg-white shadow-sm border border-slate-200 p-6 rounded-xl">
              <p class="text-slate-600 text-sm mb-2">${title}</p>
              <strong class="text-2xl font-bold text-slate-900">${value}</strong>
              <small class="text-slate-500 text-xs">${subtitle}</small>
            </div>
          `
        )
        .join('');
    }

    // Executive KPI grid (TRD §2) — inventory + fulfillment metrics
    const m = kpi.metrics || {};
    const kpiCell = (label, value, hint, warn) => `
      <div class="p-4 rounded-xl border ${warn ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}">
        <p class="text-[11px] font-semibold uppercase tracking-wide ${warn ? 'text-red-600' : 'text-on-surface-variant'}">${label}</p>
        <strong class="text-xl font-headline font-bold ${warn ? 'text-red-700' : 'text-on-surface'}">${value}</strong>
        <p class="text-[11px] ${warn ? 'text-red-500' : 'text-on-surface-variant'} mt-0.5">${hint}</p>
      </div>`;
    const na = '—';
    const invEl = $('#kpiInventory');
    if (invEl) {
      invEl.innerHTML = [
        ['Total Stock Value', money(m.carrying_value || 0), `${m.units_on_hand || 0} units on hand`],
        ['Inventory Turnover', m.turnover_90d != null ? `${m.turnover_90d}×` : na, 'outbound vs. on-hand, 90d'],
        ['Days Sales of Inv.', m.dsi_days != null ? `${m.dsi_days}d` : na, 'avg days to convert stock'],
        ['Stockout Rate', `${m.stockout_rate ?? 0}%`, `${m.deficit_categories || 0} categories below min`, (m.stockout_rate || 0) > 0],
        ['Threshold Alerts', m.asset_threshold_alerts || 0, 'assets under custom min', (m.asset_threshold_alerts || 0) > 0],
        ['Dead Stock', m.dead_stock || 0, 'no movement in 90+ days', (m.dead_stock || 0) > 0],
      ].map(([l, v, h, w]) => kpiCell(l, v, h, w)).join('');
    }
    const fulEl = $('#kpiFulfillment');
    if (fulEl) {
      fulEl.innerHTML = [
        ['On-Time Delivery', m.on_time_delivery != null ? `${m.on_time_delivery}%` : na, 'POs received by deadline'],
        ['Order Cycle Time', m.cycle_days != null ? `${m.cycle_days}d` : na, 'order → delivery, avg'],
        ['Return Rate', `${m.return_rate ?? 0}%`, 'check-ins vs check-outs, 90d'],
        ['Supplier Rating', m.supplier_rating != null
          ? `<span class="inline-flex items-center gap-0.5">${[1,2,3,4,5].map(i => `<span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1;color:${i <= Math.round(m.supplier_rating) ? '#f59e0b' : '#e2e8f0'}">star</span>`).join('')}</span> <small>${m.supplier_rating}/5</small>`
          : na, 'vendor scorecard average'],
        ['Supplier OTD', m.supplier_otd != null ? `${m.supplier_otd}%` : na, 'vendor on-time average'],
        ['Logistics Spend', money(m.logistics_value || 0), 'in-transit + received POs'],
      ].map(([l, v, h]) => kpiCell(l, v, h, false)).join('');
    }

    // ---- Charts (Chart.js) + calendar widget (TRD §1) ----
    const series = kpi.series || {};
    const CHART_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];

    if (window.Chart) {
      Chart.defaults.font.family = 'Inter, sans-serif';
      const zonesData = zones.map(z => ({ label: `Zone ${z.zone}`, pct: z.pct || 0 }));
      const zc = $('#chartZones');
      if (zc) new Chart(zc, {
        type: 'bar',
        data: { labels: zonesData.map(z => z.label), datasets: [{ label: 'Occupancy %', data: zonesData.map(z => z.pct),
          backgroundColor: zonesData.map(z => z.pct > 85 ? '#ef4444' : z.pct >= 60 ? '#f59e0b' : '#10b981'), borderRadius: 8 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { max: 100, ticks: { callback: v => v + '%' } } } },
      });

      const dist = series.status_dist || [];
      const sc = $('#chartStatus');
      if (sc && dist.length) new Chart(sc, {
        type: 'doughnut',
        data: { labels: dist.map(d => d.status), datasets: [{ data: dist.map(d => +d.n), backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#fff' }] },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, cutout: '62%' },
      });

      const mv = series.movement_14d || [];
      const days = [...new Set(mv.map(r => r.d))].sort();
      const mc = $('#chartMovement');
      if (mc) new Chart(mc, {
        type: 'line',
        data: { labels: days.map(d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })),
          datasets: [
            { label: 'Inbound', data: days.map(d => +(mv.find(r => r.d === d)?.inbound || 0)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.12)', fill: true, tension: .35 },
            { label: 'Outbound', data: days.map(d => +(mv.find(r => r.d === d)?.outbound || 0)), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.10)', fill: true, tension: .35 },
          ] },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
    }

    // Calendar widget — marks expected PO delivery dates from live records.
    const calEvents = {};
    (series.calendar || []).forEach(p => { if (p.expected_delivery) (calEvents[p.expected_delivery] = calEvents[p.expected_delivery] || []).push(p); });
    let calCursor = new Date(); calCursor.setDate(1);
    window.renderDashCalendar = () => {
      const grid = $('#calendarGrid'), lbl = $('#calLabel');
      if (!grid || !lbl) return;
      const y = calCursor.getFullYear(), mo = calCursor.getMonth();
      lbl.textContent = calCursor.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
      const first = new Date(y, mo, 1).getDay();
      const dim = new Date(y, mo + 1, 0).getDate();
      const today = new Date().toDateString();
      let html = '<div class="grid grid-cols-7 gap-1 text-center">' +
        ['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<span class="text-[10px] font-bold text-on-surface-variant uppercase py-1">${d}</span>`).join('');
      for (let i = 0; i < first; i++) html += '<span></span>';
      for (let day = 1; day <= dim; day++) {
        const date = new Date(y, mo, day);
        const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const evs = calEvents[iso] || [];
        const isToday = date.toDateString() === today;
        html += `<div class="relative py-1.5 rounded-lg text-xs ${isToday ? 'bg-primary text-white font-bold' : 'text-on-surface hover:bg-slate-100'} ${evs.length ? 'cursor-pointer' : ''}"
          title="${evs.map(p => p.po_number + ' — ' + (p.vendor || '')).join('\n')}">
          ${day}${evs.length ? `<span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isToday ? 'bg-white' : 'bg-amber-500'}"></span>` : ''}</div>`;
      }
      grid.innerHTML = html + '</div>';
    };
    $('#calPrev')?.addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() - 1); renderDashCalendar(); });
    $('#calNext')?.addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth() + 1); renderDashCalendar(); });
    renderDashCalendar();

    // Render Zones - Show message if no data
    const zonesEl = $('#zones');
    if (zonesEl) {
      if (zones.length === 0) {
        zonesEl.innerHTML = '<p class="text-slate-500 text-center py-8">No warehouse zones configured</p>';
      } else {
        zonesEl.innerHTML = zones
          .map((z) => {
            const alertClass = z.pct > 85 ? 'border-red-500 bg-red-50' : z.pct >= 60 ? 'border-yellow-500 bg-yellow-50' : 'border-green-500 bg-green-50';
            const textClass = z.pct > 85 ? 'text-red-600' : z.pct >= 60 ? 'text-yellow-600' : 'text-green-600';
            const barClass = z.pct > 85 ? 'bg-red-500' : z.pct >= 60 ? 'bg-yellow-500' : 'bg-green-500';
            
            return `
              <div class="border-l-4 ${alertClass} p-4 rounded-lg mb-3">
                <div class="flex justify-between items-center mb-2">
                  <b class="text-lg">Zone ${z.zone}</b>
                  <span class="text-sm ${textClass} font-medium">${z.occupied}/${z.capacity} bins</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="${barClass} h-2 rounded-full transition-all duration-300" style="width: ${z.pct}%"></div>
                </div>
                <p class="text-xs text-gray-500 mt-1">${z.pct}% occupied</p>
              </div>
            `;
          })
          .join('');
      }
    }

    // Render Deployment - Show 0 if no data
    const deploymentEl = $('#deployment');
    if (deploymentEl) {
      const total = stats.total || 0;
      const deployed = stats.deployed || 0;
      
      if (total === 0) {
        deploymentEl.innerHTML = '<p class="text-slate-500 text-center py-8">No assets to display</p>';
      } else {
        deploymentEl.innerHTML = `
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-600">Deployed</span>
              <span class="font-semibold text-slate-900">${deployed} (${Math.round((deployed / total) * 100)}%)</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-3">
              <div class="bg-indigo-600 h-3 rounded-full transition-all duration-300" style="width: ${Math.round((deployed / total) * 100)}%"></div>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-slate-600">In Warehouse</span>
              <span class="font-semibold text-slate-900">${total - deployed} (${Math.round(((total - deployed) / total) * 100)}%)</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-3">
              <div class="bg-teal-600 h-3 rounded-full transition-all duration-300" style="width: ${Math.round(((total - deployed) / total) * 100)}%"></div>
            </div>
          </div>
        `;
      }
    }

    // Render Purchase Orders - Show message if no data
    const recentPOsEl = $('#recentPOs');
    if (recentPOsEl) {
      if (purchaseOrders.length === 0) {
        recentPOsEl.innerHTML = '<p class="text-slate-500 text-center py-8">No purchase orders</p>';
      } else {
        recentPOsEl.innerHTML = purchaseOrders.slice(0, 5).map((po) => {
          const statusClass = po.status === 'Received' ? 'bg-green-100 text-green-800' : 
                             po.status === 'Sent to Vendor' ? 'bg-blue-100 text-blue-800' :
                             po.status === 'Pending Approval' ? 'bg-yellow-100 text-yellow-800' :
                             'bg-gray-100 text-gray-800';
          
          return `
            <div class="flex justify-between items-center p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
              <div>
                <b class="text-sm font-medium text-slate-900">${po.po_number}</b><br>
                <small class="text-xs text-slate-500">${po.vendor_name || po.vendor}</small>
              </div>
              <span class="px-2 py-1 rounded-full text-xs font-medium ${statusClass}">${po.status}</span>
            </div>
          `;
        }).join('');
      }
    }

    // Render System Synchronization Engine — cross-boundary stream status
    const syncEl = $('#syncStreams');
    if (syncEl) {
      const streams = Array.isArray(sync.streams) ? sync.streams : [];
      const dirClass = { Inbound: 'bg-blue-100 text-blue-700', Outbound: 'bg-violet-100 text-violet-700', Internal: 'bg-slate-100 text-slate-600' };
      syncEl.innerHTML = streams.map((s) => `
        <div class="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
          <div class="flex items-center gap-3 min-w-0">
            <span class="h-2.5 w-2.5 rounded-full ${s.last_activity ? 'bg-emerald-500' : 'bg-slate-300'} shrink-0"></span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-800 truncate">${s.system}</p>
              <p class="text-xs text-slate-500">${s.last_activity ? 'Last activity ' + new Date(s.last_activity).toLocaleString() : 'No traffic yet'}</p>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${dirClass[s.direction] || dirClass.Internal}">${s.direction}</span>
            <p class="text-xs text-slate-500 mt-1">${s.total} events${s.pending ? ` · ${s.pending} pending` : ''}</p>
          </div>
        </div>`).join('');
    }

    // Render Analytics & Low-Stock Alerts
    const alertsEl = $('#stockAlertsList');
    if (alertsEl) {
      const items = Array.isArray(stockAlerts.items) ? stockAlerts.items : [];
      const deficits = items.filter((i) => i.deficit);
      const badge = $('#lowStockCount');
      if (badge) {
        badge.textContent = `${deficits.length} deficit${deficits.length === 1 ? '' : 's'}`;
        badge.classList.toggle('hidden', deficits.length === 0);
      }
      alertsEl.innerHTML = items.length === 0
        ? '<p class="text-slate-500 text-center py-8">No threshold categories configured</p>'
        : items.map((i) => {
            const pct = i.min_quantity > 0 ? Math.min(100, Math.round((i.on_hand / i.min_quantity) * 100)) : 100;
            return `
              <div class="p-3.5 rounded-xl border ${i.deficit ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50/50'}">
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-semibold text-slate-800">${i.category}</span>
                  <span class="text-xs font-bold ${i.deficit ? 'text-red-600' : 'text-slate-500'}">${i.on_hand} / ${i.min_quantity} min</span>
                </div>
                <div class="w-full bg-slate-200 rounded-full h-2">
                  <div class="${i.deficit ? 'bg-red-500' : 'bg-emerald-500'} h-2 rounded-full transition-all" style="width:${pct}%"></div>
                </div>
                ${i.deficit ? '<p class="text-[11px] text-red-600 font-medium mt-1.5">Below safety threshold — auto-requisition fires on next check-out</p>' : ''}
              </div>`;
          }).join('');
    }

    // Render Recent Activity - Show message if no data
    const recentActivityEl = $('#recentActivity');
    if (recentActivityEl) {
      if (scans.length === 0) {
        recentActivityEl.innerHTML = '<p class="text-slate-500 text-center py-8">No recent activity</p>';
      } else {
        recentActivityEl.innerHTML = `
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200">
                <th class="text-left py-2 px-3 font-medium text-slate-600">Action</th>
                <th class="text-left py-2 px-3 font-medium text-slate-600">Asset</th>
                <th class="text-left py-2 px-3 font-medium text-slate-600">Time</th>
              </tr>
            </thead>
            <tbody>
              ${scans.map((scan) => `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="py-2 px-3"><b class="text-slate-900">${scan.action}</b></td>
                  <td class="py-2 px-3 text-slate-600">${scan.name} (${scan.qr_code})</td>
                  <td class="py-2 px-3 text-slate-500 text-xs">${new Date(scan.created_at).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    const statsEl = $('#stats');
    if (statsEl) {
      statsEl.innerHTML = '<p class="text-red-500 text-center py-8">Error loading data. Please try again.</p>';
    }
  }
}

// ==========================================
// EVENT LISTENERS & INTERACTION
// ==========================================

// Sidebar Toggle (using layout.js)
// Note: Sidebar toggle is handled by layout.js, not here

// Profile Dropdown (using layout.js)  
// Note: Profile dropdown is handled by layout.js, not here

// New Asset Button
const newAssetBtn = $('#new-transaction');
if (newAssetBtn) {
  newAssetBtn.onclick = () => {
    window.location.href = 'inventory.html';
  };
}

// Export Report Button — downloads dashboard data as CSV
const exportBtn = $('#export-report');
if (exportBtn) {
  exportBtn.onclick = () => {
    const d = lastDashboardData;
    if (!d) {
      alert('Data is still loading. Please try again in a moment.');
      return;
    }
    
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['SCIM Dashboard Report', new Date().toLocaleString()], []];
    
    rows.push(['== Summary =='], ['Total Assets', d.stats.total || 0],
      ['Deployed Assets', d.stats.deployed || 0],
      ['Total Inventory Value', d.stats.value || 0],
      ['Active Purchase Orders', d.purchaseOrders.filter((x) => x.status !== 'Received').length],
      ['Compliance Alerts', d.documentList.filter((x) => x.status !== 'Verified').length], []);
    
    rows.push(['== Warehouse Zones =='], ['Zone', 'Occupied', 'Capacity', 'Percent']);
    d.zones.forEach((z) => rows.push([z.zone, z.occupied, z.capacity, `${z.pct}%`]));
    rows.push([]);
    
    rows.push(['== Purchase Orders =='], ['PO Number', 'Vendor', 'Status', 'Updated']);
    d.purchaseOrders.forEach((p) => rows.push([p.po_number, p.vendor_name || p.vendor, p.status, p.updated_at || '']));
    rows.push([]);
    
    rows.push(['== Suppliers =='], ['Name', 'Email', 'Status']);
    d.vendorList.forEach((s) => rows.push([s.name, s.email || '', s.status || '']));
    rows.push([]);
    
    rows.push(['== Recent Activity =='], ['Action', 'Asset', 'QR Code', 'Time']);
    d.scans.forEach((s) => rows.push([s.action, s.name, s.qr_code, s.created_at]));
    
    const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `scim-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
}


if (window.initHubTabs) initHubTabs('overview');
