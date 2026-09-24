// ==========================================
// RBAC PERMISSION SYSTEM
// ==========================================

// Role Definitions
const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  WAREHOUSE_STAFF: 'Warehouse Staff'
};

// Permission Matrix
const PERMISSIONS = {
  // Dashboard Permissions
  DASHBOARD_VIEW: ['Admin', 'Manager', 'Warehouse Staff'],
  DASHBOARD_MANAGE: ['Admin', 'Manager'],
  
  // Smart Warehousing Permissions
  WAREHOUSE_VIEW: ['Admin', 'Manager', 'Warehouse Staff'],
  WAREHOUSE_ADD_ZONE: ['Admin', 'Manager'],
  WAREHOUSE_EDIT_ZONE: ['Admin', 'Manager'],
  WAREHOUSE_DELETE_ZONE: ['Admin'],
  WAREHOUSE_SCAN: ['Admin', 'Manager', 'Warehouse Staff'],
  
  // Inventory Management Permissions
  INVENTORY_VIEW: ['Admin', 'Manager', 'Warehouse Staff'],
  INVENTORY_ADD_ASSET: ['Admin', 'Manager'],
  INVENTORY_EDIT_ASSET: ['Admin', 'Manager'],
  INVENTORY_DELETE_ASSET: ['Admin'],
  INVENTORY_TRANSFER: ['Admin', 'Manager', 'Warehouse Staff'],
  
  // Procurement Permissions
  PROCUREMENT_VIEW: ['Admin', 'Manager'],
  PROCUREMENT_CREATE_REQ: ['Admin', 'Manager'],
  PROCUREMENT_APPROVE_REQ: ['Admin', 'Manager'],
  PROCUREMENT_DELETE_REQ: ['Admin'],
  
  // Supplier Management Permissions
  SUPPLIER_VIEW: ['Admin', 'Manager'],
  SUPPLIER_ADD: ['Admin', 'Manager'],
  SUPPLIER_EDIT: ['Admin', 'Manager'],
  SUPPLIER_DELETE: ['Admin'],
  
  // Purchase Order Permissions
  PO_VIEW: ['Admin', 'Manager'],
  PO_CREATE: ['Admin', 'Manager'],
  PO_APPROVE: ['Admin', 'Manager'],
  PO_REJECT: ['Admin', 'Manager'],
  PO_SEND_VENDOR: ['Admin', 'Manager'],
  PO_MARK_SHIPPED: ['Admin', 'Manager'],
  PO_RECEIVE: ['Admin', 'Manager', 'Warehouse Staff'],
  PO_QR_GENERATE: ['Admin', 'Manager', 'Warehouse Staff'],
  PO_DELETE: ['Admin'],
  
  // Document Management Permissions
  DOCUMENT_VIEW: ['Admin', 'Manager'],
  DOCUMENT_CREATE: ['Admin', 'Manager'],
  DOCUMENT_SIGN: ['Admin', 'Manager'],
  DOCUMENT_VERIFY: ['Admin', 'Manager'],
  DOCUMENT_DELETE: ['Admin'],
  
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
  // Hide user management for non-admins
  hideElementsByPermission('USER_VIEW', ['#usersLink', '.user-management-section']);
  
  // Hide system settings for non-admins
  hideElementsByPermission('SYSTEM_SETTINGS', ['.system-settings-section']);
  
  // Hide procurement for warehouse staff
  hideElementsByPermission('PROCUREMENT_VIEW', ['#procurementLink']);
  
  // Hide supplier management for warehouse staff
  hideElementsByPermission('SUPPLIER_VIEW', ['#suppliersLink']);
  
  // Hide document management for warehouse staff
  hideElementsByPermission('DOCUMENT_VIEW', ['#documentsLink']);
  
  // Hide add/edit/delete buttons based on permissions
  hideElementsByPermission('WAREHOUSE_ADD_ZONE', ['#addZoneBtn']);
  hideElementsByPermission('INVENTORY_ADD_ASSET', ['#addAssetBtn']);
  hideElementsByPermission('SUPPLIER_ADD', ['#addSupplierBtn']);
  hideElementsByPermission('PROCUREMENT_CREATE_REQ', ['#addRequisitionBtn']);
  hideElementsByPermission('PO_CREATE', ['#addPOBtn', '.po-create-section']);
  hideElementsByPermission('PO_APPROVE', ['.po-approve-section']);
  hideElementsByPermission('PO_REJECT', ['.po-reject-section']);
  
  // Hide user management link in dropdown for non-admins
  if (!hasPermission('USER_VIEW')) {
    const userManagementLinks = document.querySelectorAll('a[href="users.html"]');
    userManagementLinks.forEach(link => {
      link.style.display = 'none';
    });
  }
  
  // Hide MFA settings for warehouse staff
  if (!hasPermission('SECURITY_VIEW')) {
    const mfaLinks = document.querySelectorAll('a[href="mfa-setup.html"]');
    mfaLinks.forEach(link => {
      link.style.display = 'none';
    });
  }
  
  // Show warehouse staff specific elements
  if (currentUserRole === 'Warehouse Staff') {
    showElementsByPermission('WAREHOUSE_SCAN', ['#mobileBtn']);
    showElementsByPermission('PO_RECEIVE', ['.po-receive-section']);
    showElementsByPermission('PO_QR_GENERATE', ['.po-qr-section']);
  }
  
  // Show manager specific elements
  if (currentUserRole === 'Manager') {
    showElementsByPermission('PROCUREMENT_APPROVE_REQ', ['.procurement-approve-section']);
    showElementsByPermission('PO_APPROVE', ['.po-approve-section']);
    showElementsByPermission('PO_REJECT', ['.po-reject-section']);
  }
  
  // Show admin specific elements
  if (currentUserRole === 'Admin') {
    showElementsByPermission('USER_CHANGE_ROLE', ['.user-role-section']);
    showElementsByPermission('SYSTEM_SETTINGS', ['.system-settings-section']);
  }
}

// Get user-friendly role name
function getRoleDisplayName(role) {
  const roleNames = {
    'Admin': 'Administrator',
    'Manager': 'Manager',
    'Warehouse Staff': 'Warehouse Staff'
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