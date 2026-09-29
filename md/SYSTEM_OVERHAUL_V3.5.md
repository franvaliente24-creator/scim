# System Overhaul — Version 3.5

This document summarizes the changes delivered in the v3.5 overhaul. It covers security isolation, authentication hardening, the warehousing visual overhaul, interface polish, and the new filtering capabilities. It is written for non-technical review — file names are listed so changes can be traced without reading code.

---

## 1. Multi-Account Session Isolation (Critical)

The most serious defect fixed in this release was the session leak between concurrent logins. Previously, signing in as a Manager in one browser tab and an Admin in another caused both tabs to share the same identity — the Manager tab silently became the Admin. This happened because the browser sends the same session cookie for every tab.

The system now issues a dedicated identity token to each tab after OTP verification. The token is stored in tab-scoped browser storage and sent with every API request automatically. Two consequences follow:

- A Manager tab and an Admin tab in the same browser now keep their own identities permanently.
- Signing out in one tab ends only that tab's session.

Even the stage before login — the pending verification code — is now isolated per tab through a database-backed ticket, so two people can complete sign-in simultaneously on one machine without interference.

**Affected files:** api/index.php, token.js (new), login.js, otp.js, layout.js, inactivity.js, and every HTML page (all pages now load token.js).

## 2. Authentication & OTP Hardening

- The verification page now shows a live countdown timer that displays exactly how much time remains before the code expires.
- When the countdown reaches zero, the code is dead: the digit boxes lock, an expiry notice appears, and the user must request a new code through the resend link. Requesting a new code also issues a fresh ticket and resets the timer.
- Expired codes are rejected server-side as well — client and server enforce the same five-minute window.
- Successful verification now lands Warehouse Staff directly on the Smart Warehousing page, reflecting that module's role as the operational home of the system.

**Affected files:** otp.html, otp.js, api/index.php.

## 3. Error Handling & API Stability

- The profile avatar upload previously crashed with a raw server error page (`Unexpected token '<'`). The upload endpoint is now fully guarded: upload errors, oversized files, invalid image types, and storage failures all return clean error messages instead of HTML.
- A global safety net was added to the API so any unexpected fatal error anywhere returns a structured error the interface can display, rather than leaking server markup.

**Affected files:** api/index.php, profile.js.

## 4. Shared Header State

- The notification bell now checks for alerts automatically when any page loads and refreshes every minute — the unread badge is correct immediately after signing in, without opening the menu.
- The collapsed/expanded sidebar state is now remembered as you move between pages.

**Affected files:** layout.js.

## 5. Smart Warehousing as the Visual Centerpiece

- The duplicate "Mobile Scanner" button next to "Add Zone" was removed; the floating global scan button covers quick scanning on every page.
- A new full-width QR Operations Center hero panel now leads the warehousing page, with a large scanner launcher describing the four scan-driven flows (inbound intake, zone transfer, staff assignment, outbound).
- The scanner dialog itself was enlarged — a wider frame, a taller camera viewport, and bigger mode buttons — so it reads as the primary instrument on the page.
- The Occupancy Grid was completely redesigned: each zone is now a clean card showing a status chip (Available / Filling / Critical), a colored capacity bar with percentage, and per-row breakdown rows. A small color legend sits in the card header. Zones over 85% capacity are flagged red.
- A search box was added to the Recent QR Scans card.

**Affected files:** warehousing.html, warehousing.js, styles.css.

## 6. Interface Polish & Modal Cards

- Action buttons across all modules now carry semantic colors: blue for view, amber for edit/update, green for approve/receive, red for reject/delete, indigo for primary pipeline actions, light blue for shipping. The previous single gray style made every action look identical.
- All form dialogs were upgraded to match the template standard — heavier headings, rounded fields with focus highlighting, and full-width primary submit buttons.
- Documents module: View and Update actions now open dedicated card dialogs instead of browser pop-ups. The view card shows type, owner, status, related PO, signer, and description in a structured layout; the update card offers a styled status dropdown.
- User Management: Edit and Delete now open proper modal cards — the edit card is prefilled with the account's name, email, role, and active state; the delete card is a clear red confirmation dialog. The account list keeps masked email addresses for privacy.

**Affected files:** styles.css, documents.html, documents.js, users.html, users.js, purchase-orders.js, inventory.js.

## 7. Tables, Search & Filters

- A real-time search box is now present on every page with data tables, including the requisitions list (procurement) and recent scans (warehousing) which were the last two missing it.
- Login history gained multi-parameter filtering: search by user or email, filter by result (success/failed), and filter by date range — all wired to server-side query parameters, combined with the existing pagination.

**Affected files:** procurement.html, procurement.js, warehousing.html, warehousing.js, users.html, users.js, api/index.php.

## 8. Profile & Access Control

- Administrators can now edit their own display name directly on My Profile — the lock icon is replaced by an edit control for Admin accounts only, backed by a new profile-update endpoint that enforces the Admin role server-side.
- Email, role, and account status remain locked for everyone; standard users can still only change their avatar.
- Equipment Requests and MFA Setup were added to the role guard matrix — Warehouse Staff can no longer reach them directly by URL.
- Any protected page visited without a valid session now redirects to the login screen instead of showing an empty shell.

**Affected files:** profile.html, profile.js, api/index.php, permissions.js.

## 9. Testing Notes

- PHP syntax check passes on api/index.php.
- Structural checks pass on all modified JavaScript files (remaining warnings are false positives from the simple checker not parsing regular-expression literals).
- Manual browser verification recommended for: dual-account tab isolation, OTP countdown and resend, avatar upload, scanner hero launch, occupancy grid colors, document/user modal cards, and history filters.

## 10. Deployment Notes

- The deployment creates two new database tables automatically on first API call (session_tokens, otp_tickets) — no manual migration is needed.
- All changed scripts carry new version query parameters, so browsers fetch fresh code. Hard-refresh (Ctrl+Shift+R) once after deploy.
- Session tokens expire after eight hours; OTP tickets expire after five minutes and are consumed on use.
