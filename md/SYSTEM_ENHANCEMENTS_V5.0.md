# SYSTEM ENHANCEMENTS V5.0 — Transaction Spine (Phases 0–2)

This release implements the audited transaction spine: structured goods
receipts, an authoritative stock-movement ledger, the internal
supply-request workflow, and an enforced PO state machine — plus the Phase 0
safety fixes. Everything is additive: no legacy tables were dropped and no
existing data was destroyed.

## Phase 0 — Safety

- **SQL dump secured.** `scim_db-2026-10-05-114116.sql` (which contained
  password hashes and an MFA secret) was untracked from git and moved out of
  the webroot to `C:\xampp\backups\`. `.htaccess` now denies all `.sql`/`.bak`/
  `.dump` downloads, and `.gitignore` blocks future dumps from being
  committed. The exposed MFA secret should still be rotated — the old dump
  remains readable in the repo's git history.
- **PO Receipt 'Arrived' fix.** The scan handler previously rejected POs in
  'Arrived' status even though the arrival simulator produces exactly that
  state. Scan-receipt now accepts Arrived orders.
- **Pre-change database backup** saved to `C:\xampp\backups\`
  (with stored routines).

## Phase 1 — Transaction Spine

### New tables (schema v6, all additive)

- `stock_movements` — the authoritative ledger. Every quantity-affecting
  event writes a row: movement type (RECEIPT / ISSUE / RETURN / TRANSFER /
  DAMAGE / ADJUST), the document it belongs to (PO, receipt, issuance), the
  asset/serial, quantity delta, source and destination zone+row, actor, and
  reason. Existing `asset_transactions` history is backfilled into it on
  migration.
- `goods_receipts` + `goods_receipt_items` — one receipt header per delivery
  event (GR-YYYY-### number, PO reference, receiver identity, notes) and one
  row per received line (PO line reference, quantity, condition, put-away
  zone/row, serials).
- `purchase_order_items.quantity_received` — cumulative per-line progress.
- `assets.po_id` / `assets.receipt_id` — provenance linking each received
  serial to the contract and receipt event that brought it in.
- `purchase_orders.supply_request_id` — links a PO back to the internal
  request that triggered it.
- `asset_transactions` gains `qty_delta`, `actor_name`, `ref_label`.
- `purchase_orders.po_number` gets a UNIQUE constraint (only when no
  duplicates exist).

### Goods receipt endpoint — `POST /api/v1/pos/{id}/receive`

Receiving is now a real transaction, not a status flip:

- Accepts item-level lines: PO line reference, quantity, condition, put-away
  zone/row, and scanned serials.
- Over-receiving is blocked per line — you cannot receive more than the
  contracted quantity remaining.
- Each scanned serial becomes stock (`In Warehouse`) with PO/receipt
  provenance; unscanned bulk quantities still write a ledger movement.
- The PO status is recomputed from line progress: **Partially Received** or
  **Fully Received**. Fully-received POs forward the settlement to Accounts
  Payable and re-open the linked supply request for issuance.
- Everything runs inside a DB transaction — a failed line rolls back cleanly.

### Enforced PO state machine

`PUT /pos/{id}/status` now validates every transition server-side:

Draft → Pending Approval → Approved → Sent to Vendor → Shipped → Arrived →
(Partially Received →) Fully Received → Completed, with Rejected/Cancelled as
terminal states. Invalid jumps (e.g. Draft → Received) return a 409 naming
the allowed next steps. Receiving states cannot be set manually at all —
they only come from a goods receipt. Legacy statuses (Ordered, Received,
Fulfilled, Order Received) keep a forward path to Completed.

### Scan actions → movements

Every scan now writes a `stock_movements` row: intake and PO receipt write
RECEIPT, check-out/assignment write ISSUE, check-in writes RETURN, zone moves
write TRANSFER, and the new **Report Damage** mode writes DAMAGE and routes
the unit to DISPOSAL holding.

## Phase 2 — Internal Supply Requests

### New tables

- `supply_requests` — request number (SR-YYYY-###), requesting employee,
  employee ID, department, purpose, priority, needed-by, status, approval
  fields, and a `source` column marking INTERNAL vs future EXTERNAL systems.
- `supply_request_items` — item-level rows with quantity, quantity issued,
  per-line status, and an optional PO link.
- `issuances` + `issuance_items` — one header per warehouse-issue event
  (ISS-YYYY-###, recipient, department, issuer) plus the serials that left.

### Endpoints

- `POST /api/v1/supply-requests` — itemized request submission.
- `GET /api/v1/supply-requests[/id]` — list/detail with item rows.
- `PUT /api/v1/supply-requests/{id}/status` — enforced state machine:
  Submitted → Approved → Inventory Review → (issue) or In Procurement →
  (PO received → back to Approved) → Issued → Closed. Approve/reject is
  Admin-only.
- `GET /api/v1/supply-requests/{id}/stock-check` — per-line availability
  against live warehouse stock.
- `POST /api/v1/supply-requests/{id}/issue` — assign real QR serials to a
  request line; marks assets Deployed to the requester, writes ISSUE
  movements and an issuance record, and recomputes fulfillment (Partially
  Issued / Issued).
- `GET /api/v1/stock-movements` — the ledger view.

### The business loop now closes

Request → Approve → Inventory Review → (a) stock sufficient → issue serials
→ Issued → Closed, or (b) stock short → In Procurement → raise a linked PO →
goods receipt → request auto-returns to Approved → issue → Closed. Every hop
is traceable: request ↔ PO ↔ receipts ↔ issuances ↔ stock movements ↔ scan
logs ↔ activity log.

### Frontend

- **Inventory > Requisitions** now uses the structured model: itemized
  request form (add/remove item rows), status-aware action buttons (approve,
  review, issue, send-to-procurement), a stock-check preview, and an issue
  modal that takes QR serials per line. The Approvals tab shows submitted
  requests. The Log merges new requests with legacy requisition history so
  nothing is lost.
- **Procurement** — the receive form is item-level (per-line qty + condition,
  over-receipt blocked); PO create gains an optional "Linked Supply Request"
  dropdown that pre-fills item lines; the status timeline reflects the full
  lifecycle; the view-PO dialog shows line items with received progress and
  receipts.
- **Warehousing** — new Report Damage scan mode; the scan details field bug
  that hid inputs for non-Move modes is fixed.

## Verification performed

- `php -l` clean; v6 migration applied idempotently on the local DB.
- End-to-end tested: request → approve → review → procure → PO lifecycle
  (Draft→…→Arrived) → partial receipt (2/5) → over-receipt blocked →
  completing receipt → Fully Received + AP settlement → request auto-returned
  → issue serials → Issued → Closed. Scan-receipt and Report Damage verified.
  State machines reject invalid transitions with named allowed steps.

## Preserved / deferred

Legacy `requisitions`, `equipment_requests`, `warehouse_shelves`, and
`document_logs` are untouched and still functional. Supplier-quote → PO
conversion, document auto-generation, webhook dispatch, role expansion, and
rate limiting remain for Phases 3–5.
