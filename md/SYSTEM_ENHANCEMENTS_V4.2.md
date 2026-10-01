# System Enhancement Release — v4.2

This release implements the follow-on enhancement ticket covering the dashboard overhaul, smart-warehousing refinements, inventory tooling, the multi-tier procurement workflow, supplier cleanup, document permissions, and the global archive/trash/activity framework.

## 1. Dashboard

- The dashboard overview gained a real analytics layer. Chart.js renders a zone-occupancy bar chart, an asset-status doughnut, and a 14-day inbound/outbound movement line chart fed by `GET /api/v1/dashboard/metrics`.
- A calendar widget maps expected PO deliveries onto the current month; days with arrivals show badges and clicking a day lists the expected orders.
- Supplier rating now renders as a five-star indicator beside the numeric score.
- Sidebar counters are data-driven: `GET /api/v1/nav-badges` returns pending adjustments, low-stock breaches, open requisitions, arrived POs, pending documents, and unread notices. Badges refresh every 60 seconds and re-render on each poll.

## 2. Smart Warehousing

- The Recent QR Scans card was removed from Layout Mapping; the view is purely the occupancy grid plus its stats.
- Zone management: zones now carry an assigned category (required on creation), a dedicated DISPOSAL zone is seeded for write-offs and cannot be deleted, and Administrators can delete empty zones from the grid via `DELETE /api/v1/warehouse/zones/{zone}`. Occupied zones are refused server-side.
- The Serial label was retired in favor of ID across warehousing tables, and generated serials were shortened to the compact `AST-<CATEGORY>-<seq>` format.
- Stock alerts: the per-asset threshold endpoint now returns name-grouped breach rows, the UI renders an Asset-Level Thresholds section, and pending/archived/binned rows can never raise alerts. A breach on an inventory update writes a deduplicated `low_stock` admin notification.
- The Generate Portal requires a destination zone (populated live from the zone map), unit value, purchase date, lifespan, and item specifications — all persisted on each generated row.
- Tracking gained pagination, and Cost Reports gained preset and custom date-range filters evaluated against acquisition dates.

## 3. Inventory Management

- The Recent Transactions card and the Total Value stat were removed from the Asset Inventory view.
- Batch delete: Administrators get row checkboxes and a select-all control with a bulk deletion bar that soft-deletes the selected records into the Trash Bin.
- Pending adjustments rows are individually discardable via `DELETE /api/v1/inventory/pending/{serial}` (Admin and Warehouse Staff — unscanned serials were never active stock, so they hard-delete).
- The Submit Requisition form moved out of Inventory entirely; the Requisitions tab is now history/visibility only.

## 4. Procurement & Sourcing

- Requisitions table widened to full width with explicit action buttons implementing the multi-tier workflow: manager forwards Submitted items to Inventory Review, the Administrator performs inventory approval or rejection, and the procurement manager performs final completion. Every gate is enforced server-side in `PUT /api/v1/procurement/requisitions/{id}` and each transition writes an immutable audit row.
- The sourcing pipeline stages are clickable cards that open a detail dialog, and a Completed Requisitions card now serves as the permanent history of approved work.
- The Purchase Orders tab gained a date-range filter on the Total Value stat, an inline order-tracking timeline expandable from each row's action column, and the Mark as Shipped step was replaced by Order Received, which routes straight into the receipt workflow.
- The standalone Order Tracking card was deleted from the receiving view; tracking lives in the PO action column instead.
- The lifecycle pipeline card was converted into a static PO History table plus the existing activity log.
- Creating a purchase order now auto-generates a receipt record that lands in Settlements as Awaiting Delivery and upgrades to Forwarded to AP on receipt.
- The RFP & Bids tab was removed; supplier quotes relocated to Supplier Management.

## 5. Supplier Management

- The Vendors Needing Attention card was removed — tier badges on the scorecard table already surface risk.
- Contact capture is strictly email and phone on both the create and edit dialogs; the address field was dropped.
- A dedicated Supplier Quotes table renders the relocated sourcing quotes with search.

## 6. Documents & Logistics

- Document actions are view-and-download only; the update-status control and modal were removed.
- Document rows carry an archive action for Administrators, and the Audit History tab gained a CSV export.

## 7. Global & System-Wide

- Archiving: `archived_at`/`deleted_at` columns exist on assets, purchase orders, requisitions, vendors, and documents. `GET /api/v1/archives` and `GET /api/v1/trash` power Admin-only Archive and Trash Bin tabs in the Inventory hub, with restore and retention-windowed permanent purge (30 days, auto-purged on read).
- Activity log: every meaningful mutation (scans, requisition transitions, zone deletes, archive/restore/purge, asset updates, batch generation) writes to `activity_log`. The feed is exposed under the profile dropdown at profile.html#activity — users see their own actions, Administrators can toggle the platform-wide feed.
- Auto-save: if the inactivity timer forces a logout mid-edit, open form and dialog field values persist to localStorage per page and silently restore on return.
- Excel export: `GET /api/v1/export/{dataset}` streams UTF-8 CSV for assets, transactions, requisitions, POs, settlements, scans, activity, documents, and suppliers with `from`/`to` date filtering. Export buttons appear on the history surfaces.
- Role-based tab guard: `switchModuleTab` refuses to activate a role-scoped hub section even if its hash is entered manually.
