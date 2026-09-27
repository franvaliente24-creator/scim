# SCIM System Flow and Usage Guide

## Overview
This guide explains how the main modules work together in the SCIM application, including the add flows, the scanner workflow, and the expected data flow from the page UI to the backend API.

## Primary User Flow

### 1. User logs in
The application starts from the login screen and authenticates the user through the auth endpoints in the backend API.

After login, the user receives a session and is redirected to the main dashboard.

### 2. Dashboard loads system overview
The main dashboard reads summary information and statistics from the API, including asset counts, transaction information, and operational data.

### 3. User navigates by module
The user can open the following main modules:

- Smart Warehousing
- Inventory Management
- Procurement & Sourcing
- Supplier Management
- Purchase Orders
- Documents & Logistics

Each module page loads its own data through the module-specific API route.

---

## Module Flow Details

### Inventory Flow
1. The inventory page loads assets from the backend.
2. The table renders asset data, statuses, values, and locations.
3. The user can scan a QR code using the mobile scanner.
4. The scanner posts the QR to the scan endpoint.
5. The backend validates the asset and records an asset transaction.
6. The page refreshes to show updated inventory state.

### Procurement Flow
1. The procurement page loads requisitions and quote data.
2. The user clicks New Requisition.
3. The user fills out the form and submits it.
4. The backend inserts a requisition record and generates a requisition number.
5. The requisition appears in the procurement list after refresh.

### Supplier Flow
1. The supplier page loads vendor data and performance scores.
2. The user clicks Add Supplier.
3. The form submits vendor details to the supplier creation endpoint.
4. The backend inserts the supplier record.
5. The supplier is shown in the supplier list and metrics summary.

### Purchase Order Flow
1. The purchase order page loads all purchase orders and status data.
2. The user clicks Create PO.
3. The form submits vendor, items, total, and delivery details.
4. The backend creates the purchase order and assigns a PO number.
5. The new PO appears in the PO list and can be approved, rejected, shipped, or received.

### Documents Flow
1. The documents page loads all tracked records.
2. The user clicks Add Document.
3. The form creates a new document with metadata and reference number.
4. The backend stores the record and logs an activity entry.
5. The document can then be signed or status updated.

---

## Mobile Scanner Flow

### Scanner behavior
The scanner is opened from the Mobile Scanner button on each module page.

When the scanner opens:
1. The page checks for browser camera support.
2. It requests access to the device camera.
3. It starts a live video stream.
4. It checks for QR code content repeatedly from the camera feed.
5. When a QR is detected, the code is inserted into the QR input field.
6. The user can then click Record Scan.

### Scan submission
When the user clicks Record Scan:
1. The QR value is sent to the backend scan endpoint.
2. The backend checks whether the QR corresponds to an asset.
3. The backend records the action and transaction.
4. The UI refreshes relevant data.

### Scanner implementation note
The scanner uses the browser camera API and the jsQR library when available. This gives the app a practical mobile scanning workflow without requiring a heavy external service.

---

## API Data Flow Pattern

The application follows a consistent pattern across modules:

1. Page loads and calls a GET endpoint.
2. The backend reads data from MySQL tables.
3. The frontend renders the data to tables and cards.
4. The user submits a form or action.
5. The frontend sends JSON to a POST, PUT, or other API route.
6. The backend updates the database.
7. The page reloads or refreshes relevant content.

This pattern is used for:
- creating records
- updating records
- scanning assets
- updating document status
- changing purchase order status

---

## Important Functional Notes

### In-module add forms
Creation forms open as modal dialogs within the relevant module pages. Procurement, suppliers, purchase orders, and documents use in-page forms rather than navigating to separate add pages. Inventory asset creation and editing also use in-page dialogs.

### Fixed broken button flow
The missing add page navigations and scanner placeholder code were corrected. The modules now route to real forms and the mobile scanner uses actual camera-driven QR detection logic.

### Backend consistency
The backend update routes remain aligned with the frontend using PUT requests for edit/update actions. This keeps the API consistent and predictable.

---

## Suggested QA Flow

A practical QA flow for this app is:

1. Log in successfully.
2. Open a module.
3. Click Add and submit a valid record.
4. Confirm the record appears in the list.
5. Open the mobile scanner and scan a valid QR code.
6. Verify the transaction is logged.
7. Update status and confirm it changes correctly.
8. Refresh the page and verify data persistence.

---

## Current Status
The app now has a working add-page flow for the major missing user entry points, the scanner has been upgraded from a placeholder to a real camera-based QR detection flow, and the module pages have a coherent user journey from list to create to action to refresh.
