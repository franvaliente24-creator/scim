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
      const response = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
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
  
  // Resend OTP (optional functionality)
  const resendButton = document.querySelector('.resend-otp');
  if (resendButton) {
    resendButton.addEventListener('click', async (e) => {
      e.preventDefault();
      
      try {
        const response = await fetch('/api/v1/auth/resend-otp', {
          method: 'POST',
        });
        
        if (response.ok) {
          alert('A new OTP has been sent to your email.');
        } else {
          alert('Failed to resend OTP. Please try again.');
        }
      } catch (error) {
        console.error('Resend OTP error:', error);
        alert('An error occurred. Please try again.');
      }
    });
  }
});