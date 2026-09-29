# UI Alignment & Feature Enhancements — v3.3

**Date:** March 2026
**Commit:** `427f69a` — Align login/OTP/dashboard UI with template + logout modal
**Scope:** Login page, OTP verification page, dashboard header, global logout behavior

---

## 1. Executive Summary

This update aligns the live system with the approved design template (the localhost reference UI). Four areas were changed: the login page, the identity verification page, the dashboard header, and the sign-out experience. All changes are visual and behavioral — no database or API schema changes were required.

---

## 2. Login Page Changes

**File:** `login.html`, `auth.css`, `login.js`

- **Headline styling:** The "Sign In" title now uses a slightly smaller, heavier typeface matching the template (Inter, extra-bold, tightened letter spacing).
- **Field label:** The email field label was renamed from "Email" to "Email Address" to match the template copy.
- **Password visibility toggle:** The eye icon now actually swaps between the "show" and "hide" icons when clicked, and correctly switches the password field between masked and visible text.
- **Forgot password modal:** Instead of showing an inline message, the "Forgot password?" link now opens a centered dialog explaining that password resets must be authorized by an administrator, with a "Got it" button. It closes via the button, clicking outside, or pressing Escape.
- **Company logo kept:** The logo and company name remain exactly as before — only typography and behavior were aligned.

---

## 3. Verification Page Redesign

**File:** `otp.html`, `otp.js`, `auth.css`

The verification page now follows the template layout:

- **Title:** "Verify your identity" (previously "2FA Verification")
- **Subtitle:** "We've sent a 6-digit verification code to your email."
- **Six separate digit boxes** replace the single text field:
  - Typing a digit automatically moves to the next box
  - Backspace on an empty box moves back and clears the previous digit
  - Pasting a full 6-digit code fills all boxes at once
  - Left/right arrow keys move between boxes
- **Expiry notice:** A clock icon with "Code expires in 5 minutes" sits under the boxes (kept at 5 minutes to match the actual backend expiry).
- **Button:** Renamed to "Verify Code" with a disabled/verifying state during submission.
- **Resend link:** Now reads "Didn't receive the code? Resend code" inline, with a brief "Sending..." state to prevent double-clicks.
- **Kept as requested:** The company logo at the top and the "Back to Login" link remain unchanged. On a wrong code, the boxes clear automatically and focus returns to the first box.

---

## 4. Dashboard & Header Updates

**File:** `index.html`, `dashboard.js`, `layout.js`

### Export Report Button

- Added to the welcome header area, next to "New Asset", styled as an outlined button with a download icon matching the template.
- **Functionality:** Clicking it downloads a CSV file (`scim-report-YYYY-MM-DD.csv`) containing the dashboard summary (asset totals, inventory value, order counts), warehouse zone occupancy, the full purchase order list, supplier list, and recent scan activity. No server changes needed — it uses data already loaded for the page.

### Notification Bell

- A bell icon now appears in the top header **immediately left of the user profile dropdown** — on **every page** of the system, not just the dashboard.
- Clicking it opens a dropdown panel listing items needing attention:
  - Purchase orders awaiting approval (links to Purchase Orders)
  - Documents not yet verified (links to Documents & Logistics)
- A red badge shows the count; when there's nothing pending it shows "No new notifications."
- Implemented by injecting the control through `layout.js`, so all existing pages get it automatically without editing each HTML file.

---

## 5. Logout Confirmation Modal

**File:** `layout.js` (injected globally — applies to all pages)

- Clicking "Log Out" in the profile dropdown now opens a confirmation dialog instead of signing out immediately.
- The dialog matches the reference design: a centered card with the logout icon in a light indigo circle, the title "Sign Out of Session?", the message "Are you sure you want to log out of your current administration session?", an outlined **Cancel** button, and a solid red **Sign Out** button.
- Dismissible via Cancel, the × button, or clicking the dimmed background. Confirming calls the logout endpoint and returns to the sign-in page.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `auth.css` | Headline sizing, OTP box styles, auth modal styles |
| `login.html` | "Email Address" label, forgot-password modal markup |
| `login.js` | Working eye-icon toggle, modal open/close wiring |
| `otp.html` | Full redesign: six digit boxes, new copy |
| `otp.js` | Six-box input logic, paste support, resend improvements |
| `index.html` | Export Report button |
| `dashboard.js` | CSV export generation |
| `layout.js` | Notification bell injection, logout confirmation modal |

**Net change:** ~417 lines added, ~53 removed across 8 files. No API or database changes.

---

## 7. Testing Checklist

- [ ] Login page: "Sign In" headline matches template weight/size
- [ ] Login page: label reads "Email Address"
- [ ] Login page: eye icon toggles and swaps icon
- [ ] Login page: "Forgot password?" opens the modal; all three close methods work
- [ ] OTP page: six boxes accept digits, auto-advance, backspace, and paste
- [ ] OTP page: wrong code clears boxes; resend shows green confirmation
- [ ] Dashboard: Export Report downloads a CSV that opens in Excel correctly
- [ ] Every page: bell icon sits left of the profile avatar; dropdown shows pending items
- [ ] Every page: Log Out opens the confirmation modal; Cancel dismisses; Sign Out logs out
- [ ] Mobile: bell and modal still usable at small widths

---

## 8. Deployment Notes

Standard deploy — push to `main` is sufficient; no env vars or server files changed. Hard-refresh (`Ctrl + Shift + R`) after deploy to pull the new `layout.js` and `auth.css`.
