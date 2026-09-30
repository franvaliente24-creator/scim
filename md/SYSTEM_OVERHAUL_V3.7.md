# SCIM System Overhaul — Version 3.7

## Overview

Version 3.7 implements the formal Capstone Architecture Blueprint — the document that defines the subsystem's boundaries, data streams, and defense narrative. The headline additions are the serialized QR generation pipeline, the Inbound Delivery Simulation (Digital Twin), the outbound exit-clearance token stream to Core 3, the accounts-payable settlement stream, duplicate-scan collision detection, and a sidebar rebuilt to the blueprint's exact navigation hierarchy.

---

## What Was Added

### 1. Sidebar — Exact Blueprint Hierarchy (Section 2)

The sidebar was rebuilt around the five architectural parents:

- **Dashboard & Data Sync** — Real-Time Metrics Overview, System Sync Engine, Analytics & Low-Stock Alerts
- **Smart Warehousing & Inventory** — Warehouse Layout Mapping, Consumable Stock Ledger, Asset Tracking & Assignment, QR Scan & Generate Portal
- **Procurement & Sourcing** — Purchase Requisitions, Purchase Orders, Inbound Delivery Simulation, Procurement Cost Settlement
- **Supplier & Vendor Mgmt.** — Vendor Profile Directory, Supplier Item Catalogs
- **Document Tracking & Records (DTRS)** — Live Document Tracking, Compliance Asset Clearance, Immutable Audit History

Anchor sub-links inherit the visibility of their base page, so role-based hiding still collapses whole groups for unauthorized roles.

### 2. Serialized QR Engine (Section 5)

- New serial format: `AGENCY-ASSET-<CATEGORY>-<sequence>` (e.g., `AGENCY-ASSET-LAPTOP-000001`), generated atomically by the backend so sequences never collide.
- New `POST /api/v1/assets/generate-batch` endpoint stages placeholder assets in `Awaiting Print` status.
- The warehousing page now hosts the **QR Scan & Generate Portal** card: enter an item name, category, and quantity to produce a batch, rendered as live QR images (QRious) plus a print-ready label sheet opened in a new window for print-to-PDF.

### 3. Inbound Delivery Simulation (Section 4 — Digital Twin)

- New `POST /api/v1/pos/{id}/simulate-arrival` endpoint. It is only valid while a PO is `Sent to Vendor`, `Ordered`, or `Shipped`.
- On arrival, the PO becomes `Arrived`, receives an `arrived_at` timestamp, and each ordered line item generates a serialized placeholder asset at `Inbound/Receiving` / `Receiving Dock`.
- The Purchase Orders page has a new **Inbound Delivery Simulation** card listing in-transit orders with a Simulate Arrival action and a separate list of arrived orders.

### 4. Outbound Expense Settlement Stream (Section 3.2)

- New `finance_settlements` table records `po_number`, vendor, invoice amount, and verification timestamp.
- A settlement row is forwarded automatically the moment a PO reaches `Received` or `Fulfilled` — whether through a QR PO-Receipt scan or the status pipeline — and logged to `integration_audit_log` targeting Financial Management.
- The Purchase Orders page has a new **Procurement Cost Settlement** card showing the forwarded ledger.

### 5. Exit Clearance Stream to Core 3 (Section 3.3)

- New `clearance_tokens` table. When a Check-In scan brings an employee's deployed-asset count to zero, the backend issues a `CLR-` token, writes an `integration_audit_log` entry addressed to Core 3, and raises an admin notification.
- The Documents page has a new **Compliance Asset Clearance** card with two views: a pending checklist of employees holding unreturned assets, and the issued-token ledger.

### 6. Duplicate & Collision Detection (Section 6.1)

The scan engine now blocks duplicate ledger writes:

- Check-Out on an already-deployed or still-receiving asset is rejected.
- Check-In on an asset that is not deployed is rejected.
- An identical action scanned twice in a row on the same serial is rejected.
- Every rejected attempt is still written to `scan_logs` with a collision flag, so the audit trail shows the duplicate try. Collision rows render highlighted in red on the audit view.

Also, scanning an `Inbound/Receiving` or `Awaiting Print` placeholder with Inventory Intake mutates it into `In Warehouse` stock.

### 7. Immutable Audit History (DTRS)

The Documents page has a new **Immutable Audit History** card backed by `/api/v1/scan-logs` — paginated, searchable, and flagging collision entries.

### 8. Dashboard Telemetry Cards

Two new cards on the main dashboard:

- **System Synchronization Engine** — a live console listing every cross-boundary stream (Core 2 inbound, Core 3 outbound, Finance outbound, BI audit, internal scan engine) with event counts and last-activity timestamps, backed by `GET /api/v1/sync-status`.
- **Analytics & Low-Stock Alerts** — per-category on-hand vs. minimum threshold bars, backed by `GET /api/v1/stock-alerts`.

### 9. Supplier Item Catalogs

The Suppliers page has a new catalog card indexing sourcing quotes — requisition, approved seller, quoted price, and status — with live search.

---

## Files Changed

- `api/index.php` — new tables (`clearance_tokens`, `finance_settlements`), new columns (`arrived_at`, `collision`), helper functions (serial generation, finance forwarding, clearance issuance), six new endpoints, scan-engine collision and lifecycle updates.
- `layout.js` — sidebar rebuilt to the blueprint hierarchy with anchor-visibility propagation.
- `index.html`, `dashboard.js` — sync engine and low-stock alert cards.
- `warehousing.html`, `warehousing.js` — QR Scan & Generate Portal, QRious label rendering, print sheet.
- `purchase-orders.html`, `purchase-orders.js` — delivery simulation and settlement panels.
- `suppliers.html`, `suppliers.js` — item catalog card.
- `documents.html`, `documents.js` — clearance and audit-history panels.

## Verification

- `php -l api/index.php` — clean.
- Brace/paren balance verified on every modified script.
- Script cache versions bumped to `?v=9` for changed modules and `?v=2` for `dashboard.js`.

## Known Limitations

- The QR label sheet prints through the browser's print dialog rather than a server-rendered PDF; the visual result is the same for capstone demonstration.
- Clearance tokens fire on "all items returned" for any employee — there is no employee-separation flag yet, so a token simply means the employee currently owes zero assets.
- Equipment Requests remains the Core 2 inbound provisioning queue; the sidebar routes Asset Tracking & Assignment there.
- Supplier Item Catalogs index sourcing quotes; a dedicated per-vendor product master table is future scope.
