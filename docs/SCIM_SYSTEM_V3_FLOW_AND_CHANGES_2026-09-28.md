# SCIM System Version 3: Flow and Change Guide

**Guide date:** September 28, 2026  
**System version:** Version 3  
**Scope:** Main SCIM workflows, recent functional changes, database dependencies, and verification checklist

## Purpose

This guide describes how the SCIM application is intended to work after the Version 3 changes recorded through September 28, 2026. The application uses static HTML pages with vanilla JavaScript, a PHP API, and a MariaDB/MySQL database. Module pages send requests to `/api/v1/...`; the API checks the session and permissions, reads or writes database records, and returns JSON for the page to display.

## Main Application Flow

1. A user signs in from the login page.
2. The PHP API verifies the credentials and establishes the `scim_session` session cookie.
3. The user opens a module from the dashboard or sidebar.
4. The module JavaScript requests its data from the API and renders the page.
5. Create and edit actions open forms within the module. The page submits JSON to the API.
6. The API checks authentication and role permissions, validates the request, and reads or updates the database.
7. After success, the page reloads the relevant list or summary. Errors are shown in the form or page.

## Module Workflows

### Inventory Management

- **Load:** `GET /api/v1/inventory/assets` returns assets for the inventory table and summary counts.
- **Add:** The Add Asset button opens an in-page dialog. Submit sends `POST /api/v1/inventory/assets`; a successful response refreshes inventory.
- **View:** View requests the selected asset using its QR code and displays its details in a dialog.
- **Edit:** Edit loads the asset into the in-page form. Submit sends `PUT /api/v1/inventory/assets/{current_qr_code}`. The `qr_code` field can be changed; the API keeps the original code as the lookup key, enforces the 50-character database limit, and rejects a duplicate code. Any matching `equipment_request_items.assigned_qr_code` values are synchronized.
- **Transactions:** Status updates and scanner actions are recorded in `asset_transactions` and shown in recent activity.

### Smart Warehousing

- **Load:** `GET /api/v1/warehouse/zones` returns zones and their row capacities/occupancy. `GET /api/v1/warehouse/scans` returns recent scan activity.
- **Add zone:** Add Zone opens an in-page dialog. Submit sends `POST /api/v1/warehouse/zones` with a zone name, total capacity, and row count. The API creates the zone and its rows in one database transaction. A duplicate zone name returns a conflict instead of silently replacing a zone.
- **Scan:** The Mobile Scanner opens the camera dialog. When a QR is detected, its text is placed in the QR field. Record Scan sends `POST /api/v1/assets/scan` with the QR code and selected action. If the asset exists, the API records a row in `asset_transactions` and the page refreshes scan data.

### Procurement and Sourcing

- **Load:** Requisitions and quotes are requested from procurement API routes.
- **Create requisition:** New Requisition opens a dialog on the procurement page and submits to `POST /api/v1/procurement/requisitions`. The API generates the requisition number and stores the request.
- **Edit requisition:** The requisition update route is `PUT /api/v1/procurement/requisitions/{id_or_req_number}`.
- Requisition creation and editing stay inside the module; they do not require a separate add page.

### Supplier Management

- **Load:** Supplier records and performance summaries come from the suppliers API.
- **Add supplier:** Add Supplier opens a dialog on the suppliers page and submits to `POST /api/v1/suppliers`.
- Supplier creation stays inside the module; it does not require a separate add page.

### Purchase Orders

- **Load:** Purchase-order data is read from the purchase-order API routes.
- **Create:** Create PO opens a dialog within the purchase-orders module and submits to `POST /api/v1/pos`.
- **Update status:** Status actions use the corresponding purchase-order status API route.

### Documents and Logistics

- **Load:** Document records are read from the documents API.
- **Add:** Add Document opens a dialog in the documents module and submits to `POST /api/v1/documents`.
- Document status changes use the document status update route.

## Version 3 Changes Through September 28

- Replaced several create-page redirects with in-module modal forms, including inventory asset creation and editing, procurement requisitions, suppliers, purchase orders, and documents.
- Removed the obsolete standalone procurement and supplier add pages from the current workspace.
- Added Smart Warehousing zone creation through an in-module form and a database-backed API route that creates rows transactionally.
- Made inventory QR codes editable. Updates retain the original QR code as the record lookup, check the new value for validity and uniqueness, and keep assigned request-item QR references synchronized.
- Replaced the Smart Warehousing camera-decoder placeholder with QR decoding. Inventory's scanner also has a decoder path.
- Added browser-native `BarcodeDetector` support where available and a `jsQR` fallback for browsers that need it.
- Added camera playback/permission handling and user-visible messages for missing camera access or decoder support.
- Corrected duplicate script loading and refreshed cache-busted script/style URLs for changed module assets.

## Database Dependencies

The provided `scim_db-2026-09-27-185644.sql` dump contains the tables used by the workflows in this guide:

- `assets`: asset records; `qr_code` is unique and limited to 50 characters.
- `asset_transactions`: records scans and status changes, linked to `assets` by `asset_id`.
- `warehouse_zones`: unique zone names, capacity, and occupied count.
- `warehouse_rows`: per-zone row capacity and occupancy, linked to `warehouse_zones.zone`.
- `equipment_request_items`: includes `assigned_asset_id` and `assigned_qr_code` for assigned assets.

Therefore, the scanner is not blocked by a missing transaction table in the supplied dump. It needs camera access, a supported QR decoder, a reachable API, a valid session, and a QR code that belongs to an asset. Note that the live hosted database must be checked separately; a local dump cannot prove the remote database has the same schema.

## Scanner Requirements and Troubleshooting

- The deployed site must use HTTPS (or a browser-trusted localhost origin) for camera access.
- The user must grant camera permission and the device must have a working camera.
- The browser uses native `BarcodeDetector` when available. Otherwise, it needs the `jsQR` script to load from its CDN. If neither decoder is available, manual QR entry remains possible and the page reports that automatic decoding is unavailable.
- The QR value must match an `assets.qr_code` value. Unknown codes return an API error and do not create a scan transaction.
- A successfully decoded QR only fills the input. The user must press Record Scan to save the transaction.
- If the scanner opens but does not show live video, check HTTPS, browser permissions, camera use by another application, and browser console errors.
- If video appears but no QR is detected, check whether `jsQR` loaded, try the device's supported browser, improve lighting/focus, or enter the code manually.

## Permissions

The API enforces a logged-in session. Asset and zone create/update operations are restricted to the `Admin` and `Manager` roles in the current handlers. Read and scan endpoints require an authenticated user. Confirm role behavior against the deployed app's permission configuration before rollout.

## Verification Checklist

1. Deploy the Version 3 files to the same host as the live API and database.
2. Sign in as an Admin or Manager and open Inventory Management.
3. Add an asset, confirm it appears, edit its name and QR code, then confirm both are retained after refresh.
4. Try changing the asset QR code to a code already used by another asset; confirm the form reports a duplicate without changing either record.
5. Open Smart Warehousing, create a new zone with valid capacity/row settings, and confirm the zone and rows appear after refresh.
6. Open Mobile Scanner over HTTPS, grant camera access, scan a known asset QR, press Record Scan, and confirm the transaction appears in Recent QR Scans.
7. Try an unknown QR code and confirm the API reports it without logging a successful scan.
8. Test the create dialogs for procurement, suppliers, purchase orders, and documents, and confirm each saved record appears in its module.
9. Repeat relevant tests using the actual deployed account roles and database.

## Verification Status and Deployment Note

Workspace editor diagnostics reported no issues in the edited PHP, JavaScript, HTML, and CSS files at the time this guide was prepared. The live API, deployed PHP runtime, remote database, CDN availability, and physical camera flow have not been exercised from the workspace. Changes in the local project do not update the hosted site until the changed files are deployed. Re-run the checklist against the deployed site after deployment.
