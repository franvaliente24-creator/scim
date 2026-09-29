# System Overhaul — Version 3.4

This document describes a large coordinated update covering security, the QR/warehousing engine, template alignment, performance, and profile/admin features. It follows the requested format: prose only, no code blocks.

## Summary

The system now treats QR scanning as the central engine. Every scan writes an unalterable compliance log, updates the asset's real status/location, auto-registers unknown inbound items, and automatically raises a purchase requisition when a category drops below its minimum stock level.

## Security & Authentication

- Mandatory OTP for every account: the login endpoint now always sends a 6-digit email code. The old bypass where accounts without `mfa_enabled` went straight to the dashboard is gone.
- Faster sign-in: the API now returns the "requires 2FA" response immediately and sends the OTP email in the background, so users reach the code page without waiting for SMTP.
- Logout modal is enforced: competing direct-logout handlers were removed from the user-management and MFA pages, so the confirmation dialog in the shared layout script is the single path to signing out.
- Real TOTP: the optional authenticator-app verification was upgraded from a stub that accepted any 6-digit code to a proper RFC 6238 implementation with Base32-encoded secrets, so Google/Microsoft Authenticator codes actually work.
- RBAC hardening stays href-based and guarded: restricted pages render an "Access Restricted" screen and admin-only API routes still enforce server-side roles.
- User Management privacy: emails are masked in the accounts list (e.g., `fr•••@gmail.com`), and a new "Pending Requests" card shows password-reset requests for admins to resolve.

## QR / Smart Warehousing Engine

- Global Quick QR Scan: a floating scan button now appears on every page. It opens a modal with an action picker (Inventory Intake, Check-Out, Check-In, Assign to Staff, Move to Zone, PO Receipt), a live camera view, and a manual-entry field as fallback.
- Inbound automation: scanning an unknown QR code with the Intake action auto-registers the asset (named after the QR code) instead of erroring.
- Asset allocation scans: Assign to Staff records the assignee and date; Move to Zone updates the location coordinate.
- Automated procurement loop: when a Check-Out scan pushes a category below its threshold, a requisition titled "Auto-reorder: (category)" is created in Procurement with High priority. Duplicate open auto-requisitions are prevented.
- Compliance logging: every scan is appended to an immutable `scan_logs` table with the scanner's name, user ID, IP, action, and details — the feed is available via the API for BI/compliance mapping.

## Template Alignment & Layout

- Profile and Help pages rebuilt on the standard layout (sidebar + header + scroll area), fixing the broken DOM where the sidebar stacked above content.
- Login page: "Email Address" label, working eye toggle, and the Forgot Password link now asks "Would you like to notify the Administrator to update your credentials?" — confirming posts to a new reset-request endpoint, which emails all admin accounts and queues a visible request.
- Verification page: keeps the company logo and Back to Login link; six digit-box inputs with auto-advance and paste support.
- Dashboard: Export Report button produces a real CSV download; notification bell sits left of the profile dropdown and is fed by a new aggregated notifications endpoint (pending POs, submitted requisitions, unverified documents, admin reset requests, equipment requests).
- Profile dropdown now shows the signed-in user's real name and role.

## Performance & Infinite Loading Fixes

- The root cause of the stuck pages was stale element IDs: the module scripts referenced containers that no longer existed after the HTML redesign (e.g., `activeRequisitions`, `requisitionTable`, `searchDocuments`, `searchPOs`, `topSuppliers`, `assetCategories`). Every module script was rewritten or patched to match the real IDs, guard against missing elements, and show proper empty/error states.
- Login history is now paginated server-side (10 per page with Prev/Next controls and a total count) instead of one endless list.

## Profile & Admin Features

- Avatar upload: users can click the camera icon on My Profile to upload a photo (JPG/PNG/GIF/WebP, max 2 MB). Identity fields — name, email, role — are displayed read-only with lock icons.
- Account creation form now requires Confirm Password, with eye toggles on both password fields and a mismatch check before submit.

## Files Changed

Backend: `api/index.php` (mandatory OTP, fast response, notifications feed, admin request queue, avatar upload, paginated login history, enhanced scan engine, real TOTP, new `admin_notifications`, `scan_logs`, `stock_thresholds` tables, `users.avatar` column).

Frontend: `layout.js` (bell, quick-scan FAB, dynamic identity, logout modal), `login.js`/`login.html` (reset-request modal, eye toggle), `otp.html`/`otp.js`, `profile.html`/`profile.js` (rebuilt + avatar), `help.html` (rebuilt), `users.html`/`users.js` (confirm password, masking, request queue, pagination), `mfa-setup.html`/`mfa-setup.js` (simplified wizard), `procurement.js`, `documents.js`, `suppliers.js`, `purchase-orders.js`, `inventory.js` (ID fixes + null-safe rendering), and script version bumps on all pages.

## Testing Checklist

1. Sign in with any account — you must always land on the OTP page; the code email should arrive moments after the page loads.
2. Test Log Out — confirm the modal appears and nothing signs out until "Sign Out" is clicked.
3. Click the floating scan button on any page; try manual entry with an existing QR code and each action.
4. Scan an unknown QR with "Inventory Intake" — a new asset should appear in Inventory.
5. Check-out items until a category goes under 5 units — a new "Auto-reorder" requisition should appear in Procurement.
6. Open Procurement, Suppliers, Purchase Orders, Documents, Inventory — confirm stats and tables load with no infinite spinners.
7. On User Management: create an account (confirm passwords must match), check masked emails, resolve a pending reset request, page through login history.
8. On My Profile: upload a photo, confirm header/avatar update, confirm identity fields are locked.
9. Hard-refresh (`Ctrl+Shift+R`) after deployment to clear cached scripts.

## Deployment Notes

- New tables/columns auto-create on first request (migration runs on every connection).
- Avatar files save to `img/avatars/` — ensure the folder is writable on the server.
- No new secrets were added; SMTP stays in HostForge environment variables.
