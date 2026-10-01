# System Update — Technical Requirements Document Implementation (v4.1)

This release implements the full Inventory & Supply Chain Management
Technical Requirements Document: the RBAC matrix, the executive dashboard
metrics, the pending-first QR workflow, the Asset Inventory redesign,
the requisition approval lifecycle, order tracking, supplier performance
tiering, sidebar consolidation, and the icon-only data-grid standard.

## Roles and Permissions

The platform's existing role strings are mapped to the specification as
follows: `Admin` is the System Administrator, `WarehouseStaff` is the
Warehouse Staff / Operator, and `Manager` serves as the Procurement /
Sourcing Specialist. No new role was introduced; the mapping is documented
here and in `permissions.js` so a rename later is a single change.

- Administrators keep full read/write/delete access and now hold the
  *exclusive* authority to approve or reject requisitions and purchase
  orders — enforced in the API, not only in the interface.
- Warehouse Staff can scan, generate serial batches, and write asset
  updates and adjustments. They can submit requisitions but can never
  approve them, and they cannot touch supplier records or delete history.
- Procurement Specialists retain full Procurement and Supplier Management
  access, keep read-only visibility of inventory levels, and are now
  excluded from physical scanning endpoints on both the client and the
  server.

A latent bug was fixed along the way: the frontend matrix previously
spelled the warehouse role with a space while the database stores it
without one, which meant warehouse staff permissions never resolved. All
role references are now normalized to the stored value.

## Dashboard

The overview now renders an executive KPI grid fed by the new metrics
endpoint. Inventory performance covers total stock value, turnover, days
sales of inventory, stockout rate, custom threshold breaches, and dead
stock. Fulfillment covers on-time delivery, order cycle time, return
rate, supplier scorecard averages, and in-transit logistics spend.
Metrics are computed from the live transaction, purchase-order, and
vendor ledgers; turnover and DSI are calibrated on a ninety-day movement
window, and figures without sufficient history render an honest dash
rather than a misleading zero.

## Smart Warehousing

The redundant overview page is gone. The hub now opens on a Layout
Mapping tab containing the zone occupancy grid and recent scan feed —
the operational content that was unique to the old view. The scanner and
generate tabs are hidden from procurement specialists, matching the
server-side restrictions.

The generate portal follows the pending-first workflow end to end:
entering item details and generating serials only stages them. The
records stay invisible to the active Asset Inventory and surface under
Inventory → Pending Adjustments until each physical QR tag is scanned at
intake, at which point the item commits to the ledger automatically.

## Inventory Management

The Stock Ledger is renamed Asset Inventory and the table is now the
hub of the module. It performs server-side search and filtering by
category and status, renders rows grouped by product taxonomy with
per-category counts and subtotals, paginates cleanly, and exposes
quantity, low-stock threshold, purchase date, and lifespan both in the
columns and the add/edit form. Items below their custom threshold are
flagged inline.

The embedded dashboard, standalone asset search, QR lookup, reorder
points, and data sync tabs have been removed; their useful behavior is
absorbed into the ledger filters, the pending-adjustments queue, and the
main dashboard.

Pending Stock Adjustments renders each generated-but-unscanned serial
with its live QR code so labels can be re-printed or scanned directly
from the screen.

Requisitions gained a complete in-module workflow: a submission form for
any operational role, a history table with real lifecycle states, and an
Approvals queue where administrators — and only administrators — see
Approve and Reject controls. Every status transition is written to the
immutable integration audit log with the acting user.

## Procurement and Sourcing

The sourcing tables were already lean after the hub consolidation; the
purchase-order table shed its redundant created column and now uses
icon-only row actions. The Delivery and Receiving tab is renamed Order
Tracking and opens with a visual fulfillment stepper that charts each
purchase order from draft through received, with declined orders grouped
separately. All state is read straight from the purchase-order table, so
the stepper reflects the database the moment the tab activates.

## Supplier Management

Vendor rows now carry a computed performance tier — Strategic,
Preferred, Approved, or Probationary — derived live from the rating,
on-time, and defect scorecards rather than a stored label. Row actions
are icon-only.

## Navigation

The Equipment Requests sidebar entry is removed from every page; asset
allocations route exclusively through the Inventory requisition
workflow. The underlying Core 2 inbound queue remains reachable by
direct URL for integration diagnostics.

## Caveats

Real-time sync is polling-based refresh on tab activation rather than
push sockets — sufficient at this scale, and the single biggest upgrade
candidate if live dashboards are ever required. Turnover, DSI, and
return rate are movement-based proxies because the system tracks asset
events rather than point-of-sale lines; the metric names in the response
document the window used.

## Files Changed

`api/index.php`, `permissions.js`, `dashboard.js`, `index.html`,
`warehousing.html`, `warehousing.js`, `inventory.html`, `inventory.js`,
`procurement.html`, `procurement.js`, `suppliers.js`, `documents.js`,
and the sidebar block of every remaining page. Cache versions were
bumped for all changed scripts.
