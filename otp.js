// ==========================================
// OTP VERIFICATION LOGIC (Six-Box Input + Live Countdown)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  const otpForm = document.getElementById('otpForm');
  const boxes = Array.from(document.querySelectorAll('#otpBoxes input'));
  const otpError = document.getElementById('otpError');
  const countdownEl = document.getElementById('otpCountdown');
  const resendButton = document.querySelector('.resend-otp');

  // Per-tab MFA ticket issued by the login endpoint
  let ticket = window.scimGetTicket ? scimGetTicket() : null;
  if (!ticket) {
    window.location.href = 'login.html';
    return;
  }

  // Dev/demo hint: when the API returned the code inline (no SMTP
  // configured, localhost only), show it so the login flow is demonstrable.
  const devHint = document.getElementById('otpDevHint');
  function showDevHint(code) {
    if (!devHint) return;
    if (code) {
      devHint.style.display = '';
      devHint.textContent = 'Dev mode — no email configured. Your code is: ' + code;
    } else {
      devHint.style.display = 'none';
      devHint.textContent = '';
    }
  }
  showDevHint(sessionStorage.getItem('dev_otp'));

  // ---- Real-time 5-minute countdown -------------------------------------
  // Driven by the timestamp captured at login so a page refresh can't
  // reset the window. When it hits zero the code is dead server-side too.
  const OTP_TTL_MS = 5 * 60 * 1000;
  let issuedAt = parseInt(sessionStorage.getItem('otp_issued_at') || '0', 10) || Date.now();
  let expired = false;
  let countdownTimer = null;

  function tickCountdown() {
    const remaining = OTP_TTL_MS - (Date.now() - issuedAt);
    if (remaining <= 0) {
      expired = true;
      if (countdownEl) countdownEl.textContent = '0:00';
      clearInterval(countdownTimer);
      countdownTimer = null;
      boxes.forEach((b) => { b.disabled = true; });
      otpError.style.color = '#dc2626';
      otpError.textContent = 'Your code has expired. Please request a new one below.';
      return;
    }
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    if (countdownEl) {
      countdownEl.textContent = m + ':' + String(s).padStart(2, '0');
      countdownEl.style.color = remaining < 60000 ? '#dc2626' : '';
    }
  }
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 1000);

  // ---- Six-box input behavior --------------------------------------------
  boxes[0]?.focus();
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

  // ---- Verify ------------------------------------------------------------
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (expired) {
      otpError.style.color = '#dc2626';
      otpError.textContent = 'Your code has expired. Please request a new one below.';
      return;
    }

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
        body: JSON.stringify({ code: otp, ticket }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        if (window.scimSetToken) scimSetToken(data.token);
        if (window.scimClearTicket) scimClearTicket();
        sessionStorage.removeItem('otp_issued_at');
        sessionStorage.removeItem('dev_otp');
        // Operations roles land on the warehouse — the system's main stage;
        // requester-only accounts go straight to the supply-request portal
        const role = data.user?.role || '';
        window.location.href = role === 'Warehouse Staff' ? 'warehousing.html'
          : role === 'Staff' ? 'requests.html' : 'index.html';
        return;
      }

      if (data.expired) {
        expired = true;
        if (countdownEl) countdownEl.textContent = '0:00';
        boxes.forEach((b) => { b.disabled = true; });
      }
      otpError.style.color = '#dc2626';
      otpError.textContent = data.error || 'Invalid code. Please try again.';
      boxes.forEach((b) => { b.value = ''; });
      boxes[0].focus();
    } catch (error) {
      console.error('OTP verification error:', error);
      otpError.textContent = 'An error occurred. Please try again.';
    }

    button.disabled = false;
    button.textContent = 'Verify Code';
  });

  // ---- Resend -------------------------------------------------------------
  if (resendButton) {
    resendButton.addEventListener('click', async (e) => {
      e.preventDefault();
      otpError.textContent = '';
      resendButton.style.pointerEvents = 'none';
      resendButton.textContent = 'Sending...';

      try {
        const response = await fetch('/api/v1/mfa/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket }),
        });
        const data = await response.json();

        if (response.ok && data.ok) {
          // Fresh ticket + reset the countdown window
          ticket = data.ticket;
          if (window.scimSetTicket) scimSetTicket(ticket);
          issuedAt = Date.now();
          sessionStorage.setItem('otp_issued_at', String(issuedAt));
          expired = false;
          boxes.forEach((b) => { b.disabled = false; b.value = ''; });
          boxes[0].focus();
          if (!countdownTimer) countdownTimer = setInterval(tickCountdown, 1000);
          tickCountdown();

          if (data.dev_otp) {
            sessionStorage.setItem('dev_otp', data.dev_otp);
            showDevHint(data.dev_otp);
          }
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
