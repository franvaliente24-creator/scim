// ==========================================
// INACTIVITY TIMEOUT HANDLER
// ==========================================

class InactivityTimer {
  constructor(timeoutMinutes = 30, warningMinutes = 3) {
    this.timeoutMinutes = timeoutMinutes;
    this.warningMinutes = warningMinutes;
    this.timeoutMs = timeoutMinutes * 60 * 1000;
    this.warningMs = (timeoutMinutes - warningMinutes) * 60 * 1000;
    this.timer = null;
    this.warningTimer = null;
    this.inactivityModal = null;
    this.warningModal = null;
    this.isLocked = false;
  }

  start() {
    this.reset();
    this.setupEventListeners();
    this.createModals();
  }

  reset() {
    if (this.isLocked) return;
    
    clearTimeout(this.timer);
    clearTimeout(this.warningTimer);
    
    // Set warning timer
    this.warningTimer = setTimeout(() => {
      this.showWarning();
    }, this.warningMs);
    
    // Set timeout timer
    this.timer = setTimeout(() => {
      this.logout();
    }, this.timeoutMs);
  }

  setupEventListeners() {
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'
    ];
    
    events.forEach(event => {
      document.addEventListener(event, () => this.reset(), true);
    });
  }

  createModals() {
    // Create warning modal
    const warningModal = document.createElement('div');
    warningModal.id = 'inactivityWarning';
    warningModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    warningModal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; text-align: center; box-shadow: 0 20px 55px rgba(0,0,0,0.3);">
        <div style="font-size: 48px; margin-bottom: 16px;">⏰</div>
        <h2 style="margin: 0 0 12px; color: #172033;">Session Expiring Soon</h2>
        <p style="margin: 0 0 20px; color: #64748b;">
          Your session will expire in ${this.warningMinutes} minutes due to inactivity.
        </p>
        <button id="extendSession" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%;">
          Extend Session
        </button>
      </div>
    `;
    
    document.body.appendChild(warningModal);
    this.warningModal = warningModal;
    
    // Create lockout modal
    const lockoutModal = document.createElement('div');
    lockoutModal.id = 'inactivityLockout';
    lockoutModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;
    
    lockoutModal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; text-align: center; box-shadow: 0 20px 55px rgba(0,0,0,0.3);">
        <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
        <h2 style="margin: 0 0 12px; color: #172033;">Session Expired</h2>
        <p style="margin: 0 0 20px; color: #64748b;">
          Your session has expired due to inactivity. Please log in again.
        </p>
        <button id="relogin" style="background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%;">
          Return to Login
        </button>
      </div>
    `;
    
    document.body.appendChild(lockoutModal);
    this.inactivityModal = lockoutModal;
    
    // Event listeners for modals
    document.getElementById('extendSession').addEventListener('click', () => {
      this.hideWarning();
      this.reset();
    });
    
    document.getElementById('relogin').addEventListener('click', () => {
      window.location.href = 'login.html';
    });
  }

  showWarning() {
    if (this.warningModal) {
      this.warningModal.style.display = 'flex';
    }
  }

  hideWarning() {
    if (this.warningModal) {
      this.warningModal.style.display = 'none';
    }
  }

  logout() {
    this.isLocked = true;
    this.hideWarning();
    
    // Server-side logout
    fetch('/api/v1/auth/logout', { method: 'POST' })
      .finally(() => {
        if (this.inactivityModal) {
          this.inactivityModal.style.display = 'flex';
        }
      });
  }
}

// Initialize inactivity timer on page load
document.addEventListener('DOMContentLoaded', () => {
  // Only start on authenticated pages (not login page)
  if (!window.location.pathname.includes('login.html')) {
    const inactivityTimer = new InactivityTimer(30, 3); // 30 min timeout, 3 min warning
    inactivityTimer.start();
  }
});