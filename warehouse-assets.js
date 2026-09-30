// ==========================================
// WAREHOUSE ASSET REGISTRATION PAGE LOGIC
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
  loadRecentAssets();
});

// ==========================================
// ASSET REGISTRATION FORM
// ==========================================
const assetForm = $('#assetForm');
const formError = $('#formError');

if (assetForm) {
  assetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;

    try {
      const formData = new FormData(assetForm);
      const data = Object.fromEntries(formData.entries());
      
      const response = await fetch('/api/v1/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        formError.textContent = result.error || 'Unable to register asset.';
        formError.hidden = false;
        return;
      }

      // Success
      assetForm.reset();
      await loadRecentAssets();
      
      // Show success message
      formError.textContent = 'Asset registered successfully!';
      formError.classList.remove('text-red-600');
      formError.classList.add('text-emerald-600');
      formError.hidden = false;
      
      setTimeout(() => {
        formError.hidden = true;
        formError.classList.remove('text-emerald-600');
        formError.classList.add('text-red-600');
      }, 3000);
      
    } catch (error) {
      console.error('Error registering asset:', error);
      formError.textContent = 'Unable to reach the server. Please try again.';
      formError.hidden = false;
    }
  });
}

// ==========================================
// RECENT ASSETS
// ==========================================
async function loadRecentAssets() {
  try {
    const response = await api('assets');
    const assets = response.assets || response;
    const recentAssets = Array.isArray(assets) ? assets.slice(0, 10) : [];
    renderRecentAssets(recentAssets);
  } catch (error) {
    console.error('Error loading recent assets:', error);
  }
}

function renderRecentAssets(assets) {
  const recentAssetsEl = $('#recentAssets');
  if (!recentAssetsEl) return;

  if (!assets.length) {
    recentAssetsEl.innerHTML = '<p class="text-on-surface-variant text-sm">No assets registered yet</p>';
    return;
  }

  const assetsHTML = assets.map(asset => `
    <div class="row">
      <div>
        <b>${asset.name}</b><br>
        <small>${asset.category} · ${asset.qr_code}</small>
      </div>
      <span class="tag ${getStatusClass(asset.status)}">${asset.status}</span>
    </div>
  `).join('');

  recentAssetsEl.innerHTML = assetsHTML;
}

function getStatusClass(status) {
  const statusMap = {
    'In Warehouse': 'tag-success',
    'Deployed': 'tag-info',
    'In Maintenance': 'tag-warning',
  };
  return statusMap[status] || 'tag-default';
}

const refreshAssetsBtn = $('#refreshAssets');
if (refreshAssetsBtn) {
  refreshAssetsBtn.onclick = () => {
    loadRecentAssets();
  };
}
