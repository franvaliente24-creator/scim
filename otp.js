// ==========================================
// OTP VERIFICATION LOGIC (Six-Box Input)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const otpForm = document.getElementById('otpForm');
  const boxes = Array.from(document.querySelectorAll('#otpBoxes input'));
  const otpError = document.getElementById('otpError');
  
  // Focus first box on load
  boxes[0]?.focus();
  
  // Six-box behavior: digits only, auto-advance, backspace, paste
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
    });
    
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        boxes[i - 1].focus();
        boxes[i - 1].value = '';
      }
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });
    
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      digits.split('').forEach((d, j) => { if (boxes[j]) boxes[j].value = d; });
      boxes[Math.min(digits.length, 5)].focus();
    });
  });
  
  const getCode = () => boxes.map((b) => b.value).join('');
  
  // Handle OTP verification
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const otp = getCode();
    
    if (otp.length !== 6) {
      otpError.textContent = 'Please enter all 6 digits';
      return;
    }
    
    otpError.textContent = '';
    const button = otpForm.querySelector('[type=submit]');
    button.disabled = true;
    button.textContent = 'Verifying...';
    
    try {
      const response = await fetch('/api/v1/mfa/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.ok) {
        window.location.href = 'index.html';
      } else {
        otpError.style.color = '';
        otpError.textContent = data.error || 'Invalid code. Please try again.';
        boxes.forEach((b) => { b.value = ''; });
        boxes[0].focus();
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      otpError.textContent = 'An error occurred. Please try again.';
    }
    
    button.disabled = false;
    button.textContent = 'Verify Code';
  });
  
  // Resend OTP
  const resendButton = document.querySelector('.resend-otp');
  if (resendButton) {
    resendButton.addEventListener('click', async (e) => {
      e.preventDefault();
      otpError.textContent = '';
      resendButton.style.pointerEvents = 'none';
      resendButton.textContent = 'Sending...';
      
      try {
        const response = await fetch('/api/v1/mfa/resend-otp', { method: 'POST' });
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
      
      resendButton.style.pointerEvents = '';
      resendButton.textContent = 'Resend code';
    });
  }
});
