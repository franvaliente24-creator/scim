# SYSTEM_OVERHAUL_V3.8 — SPA Master-Hub Consolidation

This release restructures the entire front-end from a multi-page module layout into consolidated single-page dashboard hubs. Every functional domain now lives in exactly one HTML canvas backed by one centralized script, with internal tabs replacing page-to-page navigation.

## 1. Repository audit outcome

The audit cross-referenced all files against the Supply Chain Architecture Blueprint and found three tiers of module content:

- **Production hubs** that already carried real logic: the dashboard, warehousing, inventory, procurement, suppliers, and documents pages.
- **Three fragment pages with genuine features**: the standalone warehouse QR scanner, warehouse asset list, and warehouse tracking page. Their behavior was extracted into the warehousing hub.
- **Twenty-plus scaffold pages** shipped by the remote module push (inventory dashboards, search, QR lookup, adjustments, requisition approvals, reorder, valuation, sync, history, procurement dashboard, RFP, PO receiving, and the warehouse reporting set). These were placeholder views with "under development" content and no backend wiring — the refactor replaced them with real, API-driven tab sections rather than migrating dead markup.

## 2. Master hubs

- `warehousing.html` + `warehousing.js` — Smart Warehousing & QR hub with tabs for Overview, Scanner, QR Generate Portal, Asset Registration, Tracking, Low Stock, Returns, History, Costs, and Warranty. The scanner is now a first-class tab instead of a modal; the camera stream initializes when the tab opens and is stopped automatically when leaving the tab.
- `inventory.html` + `inventory.js` — Inventory hub with tabs for the Stock Ledger, Dashboard, Asset Search, QR Lookup, Adjustments, Requisitions, Approvals, Reorder Points, Valuation, Data Sync, and History. Every new tab is backed by live API data — search filters across all asset fields, QR lookup resolves any serial to a full record, and reorder/valuation/sync views render real thresholds, book values, and integration health.
- `procurement.html` + `procurement.js` — Procurement hub absorbing all of Purchase Order Management. Tabs: Sourcing (requisitions, quotes, pipeline), Purchase Orders (stats, table, all six lifecycle dialogs), Lifecycle & Activity, Delivery & Receiving (inbound simulation + arrival queue), Settlements (accounts-payable feed), and RFP & Bids (per-requisition quote comparison). The entire `purchase-orders.js` implementation was merged into `procurement.js` with deduplicated helpers.
- `suppliers.html` + `suppliers.js` — two tabs: Vendor Directory (stats, scorecards, attention list) and Item Catalogs.
- `documents.html` + `documents.js` — four tabs: File Repository, Logistics Tracking, Asset Clearance, and Audit History.

## 3. Tab architecture

A shared tab system in `layout.js` drives every hub. Each hub page calls `initHubTabs(defaultTab)` once; buttons carry `data-tab-target` and sections carry `data-tab`. Switching tabs updates the URL hash via history state (no reload), dispatches a `hub:tab` event that module scripts use for lazy loading, and scrolls to the top. Deep links such as `warehousing.html#scanner` open the correct tab on page load. Module scripts keep a per-tab loaded flag so expensive data (tracking, audit, history) is fetched only on first activation.

## 4. Sidebar consolidation

The sidebar group definitions now point exclusively at hub paths plus hash fragments (for example `procurement.html#orders`). A click interceptor in `layout.js` detects sidebar links whose base file is the current page and routes them through `window.switchModuleTab()` instead of navigating — instant tab switches with no reload. From other pages the browser loads the hub once and the hash activates the right tab. Anchor links inherit the RBAC visibility of their base page through the `data-base` attribute.

## 5. RBAC impact

`permissions.js` no longer lists the twenty removed fragment pages — the map now contains only the six hubs plus equipment-requests, users, and MFA setup. Because `PO_VIEW` and `PROCUREMENT_VIEW` grant to the identical role set (Admin and Manager), folding the purchase-order module into the procurement hub changes no effective access. Page-level guards still block direct hits on restricted hubs.

## 6. Files removed

Twenty-seven files deleted after verification: thirteen warehouse fragment pages, eleven inventory fragment pages, two procurement scaffold pages, the PO receiving page, the standalone purchase-orders page and its add-form, its script, the three warehouse fragment scripts, and the unreferenced add-document form. No remaining live page references any deleted file — the API notification link and all static sidebar links were repointed to `procurement.html#orders`.

## 7. Preserved behavior

All existing operational features survive: QR camera lifecycle, manual entry, batch serial generation with print sheet, PO-verified inbound scanning, staff validation, collision rejection, occupancy grid, zone management, delivery simulation, finance settlement feed, Core 3 clearance tokens, supplier edit/delete with confirmations, document view/update/download modals, the immutable audit ledger, login/OTP/session behavior, and the global `scimConfirm` dialog.

## 8. Testing performed

- PHP lint on `api/index.php` — clean.
- Structural balance checks (braces, parentheses, template literals) on every changed script — all clean.
- Selector audit: every ID queried by `warehousing.js` exists in the hub markup; no duplicate IDs in any hub page.
- Sidebar hash targets verified one-to-one against real `data-tab` names on all five hubs.
- Cache-busting versions normalized — all pages now load `styles.css?v=9`, `permissions.js?v=9`, and the bumped module scripts so a hard refresh picks up the refactor.

## 9. Known limitations

- The Warranty tab presents an honest empty state: no warranty field exists on the asset schema yet, so the tab explains the dependency rather than fabricating data.
- Index/dashboard anchor links (`index.html#syncEngine`) remain scroll anchors rather than tabs, since the main dashboard is a landing page, not a tabbed hub.
- Equipment Requests remains a standalone single-view module — it has no fragmented children to consolidate.
