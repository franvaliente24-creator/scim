// ==========================================
// RBAC PERMISSION SYSTEM
// ==========================================

// Role Definitions
const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  WAREHOUSE_STAFF: 'WarehouseStaff'
};

// Permission Matrix
const PERMISSIONS = {
  // Dashboard Permissions
  DASHBOARD_VIEW: ['Admin', 'Manager', 'WarehouseStaff'],
  DASHBOARD_MANAGE: ['Admin', 'Manager'],
  
  // Smart Warehousing Permissions
  // TRD §1: Warehouse Staff get full QR/scan access; the Procurement
  // Specialist (Manager) may view the layout but cannot physically scan.
  WAREHOUSE_VIEW: ['Admin', 'Manager', 'WarehouseStaff'],
  WAREHOUSE_ADD_ZONE: ['Admin', 'Manager'],
  WAREHOUSE_EDIT_ZONE: ['Admin', 'Manager'],
  WAREHOUSE_DELETE_ZONE: ['Admin'],
  WAREHOUSE_SCAN: ['Admin', 'WarehouseStaff'],
  
  // Inventory Management Permissions
  // TRD §1: Warehouse Staff hold read/write on asset updates & adjustments;
  // the Procurement Specialist is read-only on stock levels.
  INVENTORY_VIEW: ['Admin', 'Manager', 'WarehouseStaff'],
  INVENTORY_ADD_ASSET: ['Admin', 'WarehouseStaff'],
  INVENTORY_EDIT_ASSET: ['Admin', 'WarehouseStaff'],
  INVENTORY_DELETE_ASSET: ['Admin'],
  INVENTORY_TRANSFER: ['Admin', 'Manager', 'WarehouseStaff'],
  
  // Procurement Permissions
  // TRD §1: any operational role may submit a requisition; approve/reject
  // authority is exclusive to the System Administrator.
  PROCUREMENT_VIEW: ['Admin', 'Manager'],
  PROCUREMENT_CREATE_REQ: ['Admin', 'Manager', 'WarehouseStaff'],
  PROCUREMENT_APPROVE_REQ: ['Admin'],
  PROCUREMENT_DELETE_REQ: ['Admin'],
  
  // Supplier Management Permissions
  SUPPLIER_VIEW: ['Admin', 'Manager'],
  SUPPLIER_ADD: ['Admin', 'Manager'],
  SUPPLIER_EDIT: ['Admin', 'Manager'],
  SUPPLIER_DELETE: ['Admin'],
  
  // Purchase Order Permissions
  PO_VIEW: ['Admin', 'Manager'],
  PO_CREATE: ['Admin', 'Manager'],
  // TRD §1: workflow approval/rejection is exclusive to the Administrator.
  PO_APPROVE: ['Admin'],
  PO_REJECT: ['Admin'],
  PO_SEND_VENDOR: ['Admin', 'Manager'],
  PO_MARK_SHIPPED: ['Admin', 'Manager'],
  PO_RECEIVE: ['Admin', 'Manager', 'WarehouseStaff'],
  PO_QR_GENERATE: ['Admin', 'Manager', 'WarehouseStaff'],
  PO_DELETE: ['Admin'],
  
  // Document Management Permissions
  DOCUMENT_VIEW: ['Admin', 'Manager'],
  DOCUMENT_CREATE: ['Admin', 'Manager'],
  DOCUMENT_SIGN: ['Admin', 'Manager'],
  DOCUMENT_VERIFY: ['Admin', 'Manager'],
  DOCUMENT_DELETE: ['Admin'],
  
  // Equipment Request Permissions
  EQUIPMENT_VIEW: ['Admin', 'Manager'],
  EQUIPMENT_MANAGE: ['Admin', 'Manager'],
  
  // Archives — Admin-only read/restore of removed records
  ARCHIVE_VIEW: ['Admin'],

  // User Management Permissions
  USER_VIEW: ['Admin'],
  USER_ADD: ['Admin'],
  USER_EDIT: ['Admin'],
  USER_DELETE: ['Admin'],
  USER_CHANGE_ROLE: ['Admin'],
  
  // Security Permissions
  SECURITY_VIEW: ['Admin', 'Manager'],
  SECURITY_ENABLE_MFA: ['Admin', 'Manager'],
  SECURITY_DISABLE_MFA: ['Admin'],
  
  // System Settings
  SYSTEM_SETTINGS: ['Admin']
};

// Current user role (will be set from API)
let currentUserRole = null;
let currentUserPermissions = [];

// Initialize user permissions from API
async function initializePermissions() {
  try {
    const response = await fetch('/api/v1/auth/me');
    const data = await response.json();
    
    // Unauthenticated visitors on protected pages get bounced to login.
    // (login/otp pages are exempt — they load this script too.)
    const isAuthPage = /login\.html|otp\.html/i.test(window.location.pathname);
    if (!data.user && !isAuthPage) {
      window.location.href = 'login.html';
      return null;
    }
    
    if (data.user && data.user.role) {
      currentUserRole = data.user.role;
      currentUserPermissions = getPermissionsForRole(currentUserRole);
      
      // Apply RBAC to current page
      applyRBAC();
      
      return { role: currentUserRole, permissions: currentUserPermissions };
    }
    
    return null;
  } catch (error) {
    console.error('Error initializing permissions:', error);
    return null;
  }
}

// Get permissions for a specific role
function getPermissionsForRole(role) {
  const rolePermissions = [];
  
  Object.keys(PERMISSIONS).forEach(permission => {
    if (PERMISSIONS[permission].includes(role)) {
      rolePermissions.push(permission);
    }
  });
  
  return rolePermissions;
}

// Check if user has a specific permission
function hasPermission(permission) {
  return currentUserPermissions.includes(permission);
}

// Check if user has any of the specified permissions
function hasAnyPermission(permissions) {
  return permissions.some(perm => currentUserPermissions.includes(perm));
}

// Hide elements based on role
function hideElementsByRole(role, elementSelectors) {
  if (currentUserRole === role) {
    elementSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => el.style.display = 'none');
    });
  }
}

// Show elements based on role
function showElementsByRole(role, elementSelectors) {
  if (currentUserRole === role) {
    elementSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => el.style.display = '');
    });
  }
}

// Hide elements based on permission
function hideElementsByPermission(permission, elementSelectors) {
  if (!hasPermission(permission)) {
    elementSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => el.style.display = 'none');
    });
  }
}

// Show elements based on permission
function showElementsByPermission(permission, elementSelectors) {
  if (hasPermission(permission)) {
    elementSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => el.style.display = '');
    });
  }
}

// Apply RBAC to current page
function applyRBAC() {
  // Hide entire module links by href — works on every page regardless of IDs
  const modulePermissions = {
    'procurement.html': 'PROCUREMENT_VIEW',
    'suppliers.html': 'SUPPLIER_VIEW',
    'documents.html': 'DOCUMENT_VIEW',
    'users.html': 'USER_VIEW',
    'warehousing.html': 'WAREHOUSE_VIEW',
    'inventory.html': 'INVENTORY_VIEW',
    'equipment-requests.html': 'EQUIPMENT_VIEW',
    'mfa-setup.html': 'SECURITY_VIEW',
    'archives.html': 'ARCHIVE_VIEW',
  };

  Object.entries(modulePermissions).forEach(([href, permission]) => {
    if (!hasPermission(permission)) {
      document.querySelectorAll(`a[href="${href}"]`).forEach(link => {
        link.style.display = 'none';
      });
    }
  });
  
  // Hide MFA settings for warehouse staff
  if (!hasPermission('SECURITY_VIEW')) {
    document.querySelectorAll('a[href="mfa-setup.html"]').forEach(link => {
      link.style.display = 'none';
    });
  }
  
  // Hide system settings for non-admins
  if (!hasPermission('SYSTEM_SETTINGS')) {
    document.querySelectorAll('.system-settings-section').forEach(section => {
      section.style.display = 'none';
    });
  }
  
  // Block direct access to restricted pages (server enforces too)
  const pageFile = window.location.pathname.split('/').pop();
  const pageGuards = {
    'procurement.html': 'PROCUREMENT_VIEW',
    'suppliers.html': 'SUPPLIER_VIEW',
    'documents.html': 'DOCUMENT_VIEW',
    'users.html': 'USER_VIEW',
    'equipment-requests.html': 'EQUIPMENT_VIEW',
    'mfa-setup.html': 'SECURITY_VIEW',
    'archives.html': 'ARCHIVE_VIEW',
  };

  if (pageGuards[pageFile] && !hasPermission(pageGuards[pageFile])) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:Inter,sans-serif;">
        <div style="text-align:center;background:#fff;padding:48px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);max-width:420px;">
          <div style="font-size:48px;margin-bottom:16px;">🔒</div>
          <h1 style="font-size:22px;font-weight:700;color:#15233b;margin:0 0 8px;">Access Restricted</h1>
          <p style="color:#64748b;font-size:14px;margin:0 0 24px;">Your role does not have permission to view this module.</p>
          <a href="index.html" style="display:inline-block;background:#5046e5;color:#fff;padding:11px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Back to Dashboard</a>
        </div>
      </div>`;
    return;
  }
  
  // Hide add/edit/delete buttons based on permissions
  if (!hasPermission('WAREHOUSE_ADD_ZONE')) {
    document.querySelectorAll('#addZone').forEach(btn => btn.style.display = 'none');
  }

  if (!hasPermission('INVENTORY_ADD_ASSET')) {
    document.querySelectorAll('#addAssetBtn, #addAsset, #new-transaction').forEach(btn => btn.style.display = 'none');
  }

  if (!hasPermission('SUPPLIER_ADD')) {
    document.querySelectorAll('#addSupplier').forEach(btn => btn.style.display = 'none');
  }

  if (!hasPermission('PROCUREMENT_CREATE_REQ')) {
    document.querySelectorAll('#addRequisition').forEach(btn => btn.style.display = 'none');
  }

  if (!hasPermission('PO_CREATE')) {
    document.querySelectorAll('#createPO, #addPOBtn, .po-create-section').forEach(el => el.style.display = 'none');
  }

  if (!hasPermission('DOCUMENT_CREATE')) {
    document.querySelectorAll('#addDocument, #addDocumentBtn').forEach(btn => btn.style.display = 'none');
  }
  
  if (!hasPermission('PO_APPROVE')) {
    document.querySelectorAll('.po-approve-section').forEach(el => el.style.display = 'none');
  }
  
  if (!hasPermission('PO_REJECT')) {
    document.querySelectorAll('.po-reject-section').forEach(el => el.style.display = 'none');
  }
  
  // Generic role-scoped elements: <any data-requires-role="Admin">
  document.querySelectorAll('[data-requires-role]').forEach(el => {
    const allowed = el.getAttribute('data-requires-role').split(',').map(r => r.trim());
    if (!allowed.includes(currentUserRole)) el.style.display = 'none';
  });

  // Show elements granted by permission
  if (hasPermission('WAREHOUSE_SCAN')) {
    document.querySelectorAll('#heroScanBtn, #mobileBtn').forEach(btn => btn.style.display = '');
  }
  
  if (hasPermission('PO_RECEIVE')) {
    document.querySelectorAll('.po-receive-section').forEach(el => el.style.display = '');
  }
  
  if (hasPermission('PO_QR_GENERATE')) {
    document.querySelectorAll('.po-qr-section').forEach(el => el.style.display = '');
  }
  
  if (hasPermission('PROCUREMENT_APPROVE_REQ')) {
    document.querySelectorAll('.procurement-approve-section').forEach(el => el.style.display = '');
  }
  
  if (hasPermission('USER_CHANGE_ROLE')) {
    document.querySelectorAll('.user-role-section').forEach(el => el.style.display = '');
  }
  
  if (hasPermission('SYSTEM_SETTINGS')) {
    document.querySelectorAll('.system-settings-section').forEach(el => el.style.display = '');
  }

  // Collapse nav groups whose links were all hidden above
  if (typeof window.refreshNavGroups === 'function') window.refreshNavGroups();
}

// Get user-friendly role name
function getRoleDisplayName(role) {
  const roleNames = {
    'Admin': 'Administrator',
    'Manager': 'Manager',
    'WarehouseStaff': 'WarehouseStaff'
  };
  return roleNames[role] || role;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ROLES,
    PERMISSIONS,
    initializePermissions,
    hasPermission,
    hasAnyPermission,
    hideElementsByRole,
    showElementsByRole,
    hideElementsByPermission,
    showElementsByPermission,
    applyRBAC,
    getRoleDisplayName
  };
}