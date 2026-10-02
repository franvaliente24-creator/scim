# System Enhancements V4.6 — Row-Level Tracking, Sidebar Utilities, On-Screen Receiving QR

## Row-level warehouse tracking

Assets previously tracked only their zone (the `location` field). The occupancy
grid could count assets per zone, but rows under each zone had no real data —
the seeded row counters were display-only. Assets now carry a `bin_row` field
(schema v5) that records which row inside the zone they occupy.

Zone inputs everywhere accept an optional row suffix — typing `B` targets zone B
generally, while `B-02` targets zone B row 2. Row numbers are validated against
the zone's real row map, so a typo can never invent a row that does not exist.
An invalid or missing row leaves the asset at zone level instead of assigning it
somewhere arbitrary.

Row occupancy is computed live from asset records, the same way zone occupancy
already is. Zones that contain assets with no row assignment show a separate
"Unassigned row" entry in the grid, so the zone total always adds up and the gap
is visible rather than silent.

This applies everywhere a location is set: the QR scanner's Move to Zone /
Check-In / Intake actions, the Add Asset form, and the edit paths. The zone
suggestion lists now offer both zone codes and zone-row combinations
("B" and "B-02", "B-03"…) with each row's current occupancy shown in the label.
Migration v5 also recovers row data embedded in older location strings like
"B-02" where the row exists.

## Sidebar utility icons

Archives and Fleet Requests are support utilities, not operational modules.
Both were removed from the main module list and now sit as small icon buttons
pinned to the bottom of the sidebar — a divider separates them from module
navigation so they can't be mistaken for part of the core workflow. Archives
remains Admin-only; Fleet Requests stays visible to all roles.

## Receiving QR without download

The "Generate QR PDF" action on received purchase orders pointed at a stub
endpoint that returned JSON, so the browser downloaded an unreadable file. The
download is removed entirely.

Instead, receiving a PO (or opening a received one) shows a modal with the PO's
QR code rendered on-screen alongside the PO number. Warehouse staff scan that
code in the scanner's PO Receipt mode — or simply type the PO number — to verify
the shipment. The stub endpoint was removed since nothing calls it anymore.

## Internal requisitions clarified

Requisitions remain internal department requests for items already in stock —
no purchase order is created from them. The lifecycle (department submits →
Admin approves/rejects) is unchanged, and the auto-reorder requisition that
fires when check-out drains a category below its minimum is likewise just a
restock request, not a supplier order.
