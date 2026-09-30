# BLUEPRINT_ALIGNMENT_V3.9 — Exact Schema Enforcement & Workspace Cleanup

This pass aligns the navigation tree with the capstone blueprint's exact Section 2 sidebar specification and removes every file that is not necessary for the running system.

## 1. Sidebar schema — exact blueprint match

The sidebar now mirrors the blueprint hierarchy verbatim — five parents, no more:

- **Dashboard & Real-Time Data Sync** — Real-Time Metrics Overview, System Synchronization Engine, Analytics & Low-Stock Alerts (all resolve inside the main dashboard page).
- **Smart Warehousing & Inventory Management** — Warehouse Layout Mapping (the occupancy grid on the warehousing hub), Consumable Stock Ledger (the inventory ledger), Asset Tracking & Assignment (the Core 2 equipment-request provisioning queue), and the QR Code Scan & Generate Portal (the warehousing generate tab).
- **Procurement & Sourcing Logistics** — Purchase Requisitions, Purchase Orders, Inbound Delivery Simulation, and Procurement Cost Settlement (all tabs inside the procurement hub).
- **Supplier & Vendor Management** — Vendor Profile Directory and Supplier Item Catalogs.
- **Document Tracking & Records** — Live Document Tracking, Compliance Asset Clearance, and Immutable Audit History.

The wider tab sets inside each hub (tracking, returns, approvals, valuations, and so on) remain fully reachable through each hub's own tab bar — only sidebar noise was removed. Blueprint boundary labels are preserved: Asset Tracking & Assignment is the Core 2 inbound stream, Procurement Cost Settlement is the outbound finance stream, and Compliance Asset Clearance is the outbound Core 3 stream.

## 2. Removed files

Deleted after verifying zero live references:

- `admin.css` — orphaned stylesheet; no page loads it.
- `extract_content.ps1`, `read_docx.ps1`, `extracted_content.txt` — Word-document scraping utilities left over from an audit on a different machine.
- `scim_db-2026-09-27-185644.sql` — dated database dump; schema is authoritative in the API's `migrate()` routine and `init.sql` / `migration_integration.sql` remain for manual installs.
- `img/profile2.jpg`, `img/logo-placeholder.txt` — unreferenced assets (real avatars are stored under `img/avatars/`).
- The Warranty tab on the warehousing hub — a pure placeholder; no warranty field exists in the asset schema, so it could only ever show an empty state. The same orphaned `warranty_until` field was dropped from the inventory QR-lookup detail view.

## 3. Blueprint compliance recheck

- **Section 1 boundaries** — no applicant or recruitment routes exist anywhere in the API; inbound requests flow only through the Core 2 equipment-request channel; exit clearance tokens dispatch to the Core 3 stream on full asset return.
- **Sections 3–5** — the inbound assignment stream, outbound settlement feed, clearance tokens, digital-twin delivery simulation, serialized `AGENCY-ASSET-*` QR generation, print sheets, and the camera scanning pipeline are all preserved inside the hub tabs.
- **Section 6** — collision detection on repeat scans and the immutable audit ledger remain intact.

## 4. Validation

All JavaScript files pass structural checks, `api/index.php` lints clean, every sidebar entry resolves to an existing page and tab, and no deleted file is referenced anywhere in the codebase.
