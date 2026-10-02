# System Enhancements V4.4 — Frontend Alignment for Extended Data Model

This release connects the expanded backend fields (asset static attributes, supplier onboarding
metadata, fleet request detail, document record linkage, and archive audit fields) to the actual
screens, and finishes the remaining table-control and cleanup items from the enhancement spec.

## QR / Asset Information (Inventory)

- The Add/Edit Asset form now captures the static/fixed attributes introduced in the schema:
  Manufacturer, Model, Manufacturer Serial Number, Warranty Expiry, and a free-text
  Specifications field. These are distinct from the system-generated Asset ID (QR code), so item
  names and ID tags can never collide.
- The Asset Profile dialog (opened by scanning a QR or clicking View) is reorganized into two
  groups per the spec: "Identity & Static Attributes" (Asset ID, name, category, manufacturer,
  model, serial number, specs, value, purchase date, warranty, lifespan) and "Dynamic Attributes"
  (status, zone/location, assigned user, quantity, threshold). The QR itself still encodes only
  the Asset ID; the profile is the full digital record.

## Archive & Activity Display

- The centralized Archive table now renders three previously-captured-but-hidden columns: the
  name and user ID of the person who archived the record, the archive timestamp, and the
  mandatory archive reason.
- The inventory Activity Log gained a day / week / month / year range selector plus pagination.
  The warehousing Activity Log (scan ledger) gained the same controls.

## Requisitions

- The Open Requisitions table now leads with Purpose (per spec) rather than Title, and carries a
  proper Actions column: Approve is offered to Admins and Managers, while Reject remains
  Admin-only and is enforced server-side regardless of what the UI shows. Both actions run
  through a confirmation dialog and refresh all three requisition surfaces (open list,
  approvals, log).
- The table gained search, a day/week/month/year range filter, and pagination; the Requisition
  Log gained the same range filter and pagination.

## Fleet Requests (Internal Logistics)

- The transport-request form now covers the full spec field set: Asset ID, Item Name, Quantity,
  Pickup Location, Delivery Location, Recipient Name, Recipient Department, Requested Delivery
  Date, Priority, and Special Instructions.
- The request table renders all of these plus requester identity, and now supports search, a
  day/week/month/year range filter, pagination, and a 30-second live refresh so status changes
  from the fleet side arrive without a manual reload.

## Supplier Management

- The supplier table adds a Verification column showing the supplier's verification status and
  current onboarding stage, plus the unique Vendor ID under each name. Pagination was added.
- The Supplier Profile dialog is now the comprehensive profile required by the spec: Vendor ID,
  classification tier, Active/Inactive status, verification status, Auto-PO pre-clearance, a
  seven-stage Supplier Qualification / Onboarding progress tracker (Supplier Intake through
  Ongoing Monitoring), contract reference/status/expiry, compliance and certification details,
  insurance (COI) status with expiry flagging, and a performance block covering OTIF, quality
  acceptance, average lead time, PO count, late deliveries, and returns/discrepancies — all
  computed live from purchase-order records.
- The Edit Supplier dialog (Admin) exposes the new fields: Verification Status, Onboarding
  Stage, Contract Expiration Date, and average delivery lead time.

## Documents & Logistics

- The document type taxonomy was completed to the full spec list — Damage and Discrepancy
  Reports, Duty/Tax documents, Physical Inventory Logs, Inventory Adjustment and Warehouse
  Transfer records, outbound Packing Slips, Shipping Labels, Fleet Transport Requests, and
  Delivery Receipts — with a longest-match classifier so similar type names land in the correct
  of the four categories.
- The Add Document form gained a "Record Linkage" section carrying every required metadata
  field: PO number, batch/lot, SKU/item code, asset ID, STO reference, transport request,
  carrier/tracking ID, warehouse/zone, and expiration date. The backend stores all of it and
  stamps the creator as last-updated-by.
- The View dialog renders the linkage metadata as a dedicated section, and the record download
  now includes the full metadata set.

## Cleanup

- Removed the dead delivery-simulation block from procurement.js — the receiving tab it served
  was removed in V4.3, so nothing referenced it.
- All changed scripts were cache-bumped (v=13 / fleet v=2) so a normal refresh picks up the new
  code.

## Validation

- `php -l` clean on api/index.php.
- All 18 JavaScript files pass a real `node --check` parse (Electron's bundled Node runtime).

## Deploy Notes

The new columns are added by the API's migrate() routine on the first request after deploy —
no manual SQL needed. Hard-refresh once to pick up the bumped scripts.
