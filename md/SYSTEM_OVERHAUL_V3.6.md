# SCIM System Overhaul — Version 3.6

## Overview

Version 3.6 delivers the second wave of the Master Development Blueprint. This release focuses on the business-process architecture diagram: inbound scans now verify against Purchase Order records, staff assignments validate against the employee directory, destructive operations push structured entries into the compliance audit path, and the sidebar is reorganized into grouped sub-menus that mirror the system's architectural boundaries.

All changes are additive to v3.5 (per-tab token authentication, OTP countdown, and the warehousing visual overhaul).

---

## What Was Fixed and Added

### 1. Supplier Deletion Restored

Supplier removal was silently broken — the table rendered no action buttons and the API had no delete route.

- New `DELETE /api/v1/suppliers/{id}` endpoint with Admin and Manager authorization.
- Foreign-key-safe behavior: a supplier that is referenced by purchase orders cannot be hard-deleted; the API returns a clear error instead of a database crash.
- Supplier rows now include Edit and Delete buttons. Edit opens a prefilled modal card; Delete routes through the global confirmation modal.

Files touched: `api/index.php`, `suppliers.html`, `suppliers.js`.

### 2. Cross-Boundary Scan Validation (Phase 3 Architecture)

The QR scan engine now enforces the business-process boundaries described in the architecture diagram:

- **Inbound (Warehouse ← Purchase Order Mgmt.)** — A "PO Receipt" scan requires a valid external PO reference. The backend verifies the PO exists and is in a receivable state before inventory is injected. Invalid or missing references are rejected with a specific error.
- **Asset Accountability (Inventory ← Employee Info)** — "Assign to Staff" scans validate the assignee against the user/employee directory. Unknown or inactive staff names are rejected before the asset leaves the warehouse grid.
- **Automated Reordering (Warehouse → Procurement)** — Check-outs that drop a category below its minimum threshold auto-create a high-priority "Auto-reorder" requisition, deduplicated against open requests (carried over from v3.4, verified).

File touched: `api/index.php` (`POST /api/v1/assets/scan`).

### 3. Compliance Audit Push

- New `DELETE /api/v1/assets/{qr_code}` route (Admin/Manager only). Every deletion writes a structured entry to `scan_logs` — actor, IP address, QR code, action, and details — before the record is removed.
- High-value asset movements through the scan endpoint are also pushed to the same audit queue, satisfying the DTRS / Legal & Compliance pathway in the diagram.

Files touched: `api/index.php`, `inventory.js` (Admin-only Delete button + confirmation).

### 4. Global Confirmation Modal

A shared `window.scimConfirm()` helper lives in `layout.js` and is available on every authenticated page. It renders a styled confirmation card (icon, title, message, Cancel/Confirm buttons, Escape and backdrop dismissal) and returns a promise.

Wired into:

- Supplier deletion
- Asset deletion (Admin)
- Purchase Order lifecycle actions — Submit for Approval, Approve, Reject, Ship, Receive
- Logout (existing modal retained)

All user-supplied strings passed to the modal are HTML-escaped.

Files touched: `layout.js`, `purchase-orders.js`, `suppliers.js`, `inventory.js`.

### 5. Table Layout Fixes

- Table containers now scroll horizontally (`overflow-x`) so wide tables — the requisition table in particular — no longer clip columns off-screen.
- Document rows gained a Download button that instantly exports the document record as a text file, satisfying the "download icon hooks" requirement for locally hosted records.

Files touched: `styles.css`, `documents.js`.

### 6. Sidebar Sub-Menu Groups (Phase 7)

The sidebar is now organized programmatically by `layout.js` into collapsible groups matching the architectural boundaries:

- **Smart Warehousing & QR** — Live Dashboard, QR Scanner Core, Occupancy Grid, Aisle & Zone Config
- **Procurement & Sourcing** — Requests, Sourcing & Bidding, supplier quote pipeline
- **Purchase Order Mgmt.** — Active POs, disbursement attention queue
- **Supplier/Vendor Mgmt.** — Vendor Directory, performance view
- **Document & Logistics** — File repository, tracking log anchors
- Ungrouped pages (Dashboard, Inventory, User Management, etc.) remain as top-level links.

Behavior:

- Groups auto-expand when the current page is inside them.
- If role-based hiding removes every link in a group, the group header is hidden too — so non-privileged users never see empty menus.
- `warehousing.html#scan` deep-links directly into the QR scanner; `#zones` opens the zone-configuration dialog.

Files touched: `layout.js`, `permissions.js`, `warehousing.js`.

---

## Security Notes

- Supplier and asset deletion are authorized server-side; the Admin-only Delete button in the UI is a convenience, not the enforcement layer.
- PO receipt scans cannot inject inventory without a verified external PO — this closes a path where arbitrary QR codes could inflate stock.
- The confirmation modal escapes all injected text to prevent markup injection through PO numbers or supplier names.

## Verification

- `php -l api/index.php` — no syntax errors.
- Brace/paren balance checked across all modified JavaScript files.
- Cache-busting bumped to `?v=8` for changed scripts (`layout`, `permissions`, `suppliers`, `purchase-orders`, `inventory`, `warehousing`, `documents`) and `styles.css?v=6` so deployed clients pick up the new code on next load.

## Known Limitations

- The Document Download exports the tracked record metadata; full binary file storage for document attachments remains a future scope item (the schema has no file column yet).
- Sidebar sub-links use in-page anchors (`#warehouseGrid`, `#poPipeline`, etc.) where the sub-function lives inside an existing page rather than a dedicated route.
- Phase 1–2 items (OTP enforcement, per-tab tokens, avatar crash, notification polling) shipped in v3.4/v3.5 and should be regression-tested alongside this release.
