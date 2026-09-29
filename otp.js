// ==========================================
// OTP VERIFICATION LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const otpForm = document.getElementById('otpForm');
  const otpInput = document.getElementById('otp');
  const otpError = document.getElementById('otpError');
  
  // Auto-format OTP input (6 digits)
  otpInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    e.target.value = value.substring(0, 6);
  });
  
  // Handle OTP verification
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const otp = otpInput.value.trim();
    
    if (otp.length !== 6) {
      otpError.textContent = 'Please enter a valid 6-digit code';
      return;
    }
    
    otpError.textContent = '';
    
    try {
      const response = await fetch('/api/v1/mfa/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.ok) {
        // OTP verified, redirect to dashboard
        window.location.href = 'index.html';
      } else {
        otpError.textContent = data.error || 'Invalid OTP. Please try again.';
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      otpError.textContent = 'An error occurred. Please try again.';
    }
  });
  
  // Resend OTP
  const resendButton = document.querySelector('.resend-otp');
  if (resendButton) {
    resendButton.addEventListener('click', async (e) => {
      e.preventDefault();
      otpError.textContent = '';
      
      try {
        const response = await fetch('/api/v1/mfa/resend-otp', {
          method: 'POST',
        });
        
        const data = await response.json();
        
        if (response.ok && data.ok) {
          otpError.style.color = '#059669';
          otpError.textContent = 'A new code has been sent to your email.';
          setTimeout(() => { otpError.textContent = ''; otpError.style.color = ''; }, 5000);
        } else {
          otpError.style.color = '#dc2626';
          otpError.textContent = data.error || 'Failed to resend code.';
        }
      } catch (error) {
        console.error('Resend OTP error:', error);
        otpError.textContent = 'An error occurred. Please try again.';
      }
    });
  }
  
  // Back to login link
  const backToLogin = document.querySelector('.back-to-login');
  if (backToLogin) {
    backToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'login.html';
    });
  }
});