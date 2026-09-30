# NAV_CLEANUP_V4.0 — Flat Sidebar Standard & Icon Rail

This pass implements the sidebar optimization ticket: remove navigation redundancy, fix the collapsed icon-rail behavior, and enforce the rule that the sidebar only ever shows top-level parent modules while every child view lives inside its hub's tab bar.

## 1. Sidebar is now flat — top-level modules only

The previous collapsible nav-group accordion (injected by `layout.js` over the authored markup) is gone entirely. The sidebar on every page now renders exactly seven links:

- Dashboard
- Smart Warehousing
- Inventory Management
- Procurement & Sourcing
- Supplier Management
- Documents & Logistics
- Equipment Requests

The duplicate dashboard listing is removed — the "Dashboard & Real-Time Data Sync" group no longer exists, so the single standard Dashboard link is the only entry and highlights correctly. The redundant "Purchase Orders" sidebar link was also removed from all eleven pages, since orders are a tab inside the procurement hub.

Everything the old groups linked to — the Sync Engine, Low-Stock Analytics, the QR portal, requisitions, tracking, settlements, catalogs, clearance, audit history — is still one click away inside each hub's tab bar. Hash deep links still work if anyone bookmarks or hand-links a tab.

## 2. Dashboard adopts the hub-tab standard

The main dashboard now uses the same module tab bar as every other hub, with three views: Metrics Overview (stats, occupancy, deployment, activity), Sync Engine, and Analytics & Low-Stock. The old `#syncEngine` and `#lowStockAlerts` hashes are preserved as tab names, so any existing bookmarks still land correctly.

## 3. Collapsed icon rail fixed

Collapsing the sidebar now produces a proper 72px icon rail: text labels hide, icons stay centered and full-width, and tooltips appear on hover. The previous rules forced a 72px minimum link width inside a padded container, which would have clipped icons — padding is tightened and minimum widths removed so the rail renders cleanly. Collapse state still persists across pages via session storage, and mobile slide-out behavior is unchanged.

## 4. Cleanup removed

- All nav-group generation, toggle handlers, anchor-inheritance logic, and sub-link styling (JavaScript and CSS).
- Debug `console.log` statements left in the layout bootstrap.
- The `data-base` attribute machinery is no longer needed since there are no sidebar hash links.

## 5. Database cross-reference

The supplied database export was checked against the API schema: all tables in use are accounted for. Two observations for the team — `warehouse_shelves` exists in the database but no API route or interface currently reads it (the blueprint's aisle/rack/shelf/bin mapping only exercises zones and rows so far), and `document_logs` is a legacy table that the migrator still consumes to seed the `documents` table. Neither was dropped; they were left in place deliberately.

## 6. RBAC unchanged in behavior

Role-based hiding still operates on the flat links by page href, so unauthorized modules stay hidden and direct page access is still blocked server-side. The `refreshNavGroups` hook remains as a no-op stub so `permissions.js` keeps working without edits.
