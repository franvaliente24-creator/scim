# SCIM — Architectural & Business-Workflow Audit (V5.0)

Audit of the repository before major restructuring. No code was changed.

----------------------------------------------------------------------

## 1. Current architecture

Monolith SPA-style multi-page app: 13 HTML pages sharing `layout.js`,
`permissions.js`, `styles.css`/`auth.css`; each page duplicates the sidebar
markup (13 copies, synchronized only by convention). Backend is a single
`api/index.php` (~4,100 lines, 99 routes) on PHP/PDO/MariaDB, dispatched by
manual `preg_match` routing. Auth = per-tab bearer token (`session_tokens`)
with PHP-session fallback; mandatory email OTP at login; optional TOTP MFA;
client-side inactivity timeout. QR scanning via jsQR/BarcodeDetector;
QR generation via QRious CDN. Deployment: Apache + .htaccess rewrite or
Docker (php:8.2-apache). Schema is created/altered by `migrate()` gated on
a `schema_migrations` version (currently v5), also runnable via CLI.

## 2. Current modules

| Page | Module | Notes |
|---|---|---|
| index.html | Dashboard | consolidated `/dashboard/summary` |
| warehousing.html | Smart Warehousing | zones/rows grid, scanner, serial generation, returns, activity |
| inventory.html | Inventory | asset ledger, requisitions, approvals, log, valuation |
| procurement.html | Procurement & Sourcing | POs + settlements; requisitions moved out |
| suppliers.html | Supplier/Vendor | directory, scorecards, quotes (read-only), onboarding |
| documents.html | Documents & Logistics | repository, tracking, clearance, audit |
| fleet.html | Fleet Requests | internal transport requests |
| equipment-requests.html | Equipment Requests | external-system boundary UI — NOT in sidebar nav (orphan page) |
| archives.html | Archives | Admin-only restore |
| users/mfa/profile/help/otp/login | Auth & admin | — |

The six official modules map reasonably; Fleet Requests is a utility page,
equipment-requests.html is reachable only by direct URL.

## 3. Current database entities (36 tables)

Core: `users`, `roles` (unused for FK — role is varchar), `session_tokens`,
`otp_tickets`, `login_history`, `activity_log`, `admin_notifications`.

Inventory/warehouse: `assets` (serialized unit + bulk `quantity` conflated),
`asset_transactions` (action/zone only — no qty, no actor, no reference doc),
`scan_logs` (richer: actor, IP, collision flag, but no FK), `warehouse_zones`,
`warehouse_rows`, `warehouse_shelves` (orphan — exists in prod, absent from
migrate(), unused), `stock_thresholds`.

Procurement: `requisitions` (header only — no item table, no approver fields,
no fulfillment link), `purchase_orders` (items as free text; `po_number` NOT
unique), `purchase_order_items` (exists with FK — **never written**),
`po_activity`, `supplier_quotes` (FK'd to requisitions+vendors — **no write
endpoints exist**), `vendors` (rich: compliance, onboarding, metrics fields).

Documents: `documents` (free-text linkage: `related_po` AND `po_number` —
duplicate columns — plus asset_ref, carrier_tracking, sto_ref, zone),
`document_activity`, `document_signatures`, `document_logs` (legacy orphan,
only read by a guarded migration branch).

Integration/boundary: `equipment_requests` (+ `_items` with `assigned_asset_id`
FK, + `_activity`) — the well-formed request model, wired to the *external*
ISMERS boundary; `finance_settlements` (AP outbox, idempotent upsert);
`clearance_tokens` (Core-3 exit clearance); `fleet_requests`; `webhooks` +
`webhook_logs` (registry exists; **no outbound dispatch code** — dead feature);
`system_integrations` (plaintext api_key/api_secret); `external_references`
(generic xref map, unused); `integration_audit_log`; `integration_config`.

## 4. Current API structure

~99 flat routes in one file. Auth via `auth([roles])` per route — correctly
enforced server-side on mutations. External boundary via `integrationAuth()`
(HMAC api_key+secret against `system_integrations`). No OpenAPI spec; several
route pairs duplicate behavior (`/assets` vs `/inventory/assets`).

## 5. Current workflows (as built)

- **Serial lifecycle:** generate-batch → 'Awaiting Print' (pending, invisible)
  → Intake scan → 'In Warehouse' + zone(+row). Good pending-commit pattern.
- **Scan actions:** Intake, Check-Out, Check-In (with reason), Assign to Staff
  (validated against users), Move to Zone/Asset Transfer (zone+row), PO Receipt
  (verifies PO in receivable state). Each writes `asset_transactions` +
  `scan_logs` + `activity_log`. Collision detection on repeat scans.
- **Requisition:** dept submits (title/dept/purpose/cost) → Admin
  approves/rejects → **dead end** — no stock check, no issuance, no link to PO.
- **PO:** create (vendor dropdown + free-text items) → status flips (no
  transition graph; Admin/Manager can write arbitrary status values) →
  simulate-arrival stages serialized placeholders → 'Received' via status flip
  with free-text notes → settlement forwarded to AP outbox. Receipt QR now
  shown on-screen.
- **Equipment requests (external):** HMAC systems push structured requests →
  approve → fulfill assigns asset serials per item → activity trail. This is
  the strongest transaction model in the codebase.
- **Documents:** standalone registry with free-text cross-reference fields;
  signatures, verification status, activity log.
- **Fleet:** internal transport request records (req number, origin,
  destination, asset_ref).
- **Finance:** settlement row staged at PO creation, upgraded to 'Forwarded
  to AP' on Arrived/Received — an outbox table, not a live API call.
- **Clearance:** check-in zeroes an employee's deployed count → clearance
  token + admin notification (Core-3 boundary).

## 6. Major loopholes / problems

1. **Receiving is not a transaction.** PUT `/pos/{id}/status` 'Received' just
   flips status with a notes string. No item-level quantities, no partial
   receiving, no over-receive guard, no link from created assets to the PO.
   The 'Arrived'→placeholder-assets bridge exists only via `simulate-arrival`.
2. **`purchase_order_items` is dead** — POs store items as free text;
   the normalized table is never inserted into.
3. **`requisitions` has no items, no requester, no fulfillment** — the
   internal-supply-request flow (request → stock check → issue-or-procure)
   is not implemented; approval is a status flip that goes nowhere.
4. **`assets.quantity` is broken for bulk stock** — a serialized-asset model
   with a quantity field glued on. Check-out flips the whole row to Deployed
   regardless of qty=20; scans never adjust quantity; low-stock math mixes
   `COUNT(*)` and `SUM(quantity)` inconsistently.
5. **No PO state machine** — `PUT /pos/{id}/status` accepts arbitrary strings
   for Admin/Manager; Draft→Received skips approval; statuses in data:
   Draft/Pending Approval/Sent to Vendor/Shipped/Arrived/Received — no
   'Partially Received', no Completed, transitions unenforced.
6. **`supplier_quotes` is a dead table** — display-only; no POST endpoint, no
   accept-quote→PO trigger (the Quote→PO workflow the user described is absent).
7. **Two parallel request models** — `requisitions` (internal, weak) vs
   `equipment_requests` (external, strong: item rows, asset assignment,
   activity). The internal model needs the external one's structure.
8. **Documents are detached** — no transaction auto-creates a Delivery
   Receipt/Receiving Report; linkage columns are unvalidated free text and
   duplicated (`related_po` vs `po_number`).
9. **Scan covers intake/issue/move but not the rest** — no put-away
   transaction distinct from intake, no picking list, no damaged/return-to-
   vendor flow, no stock transfer doc, no cycle count.
10. **`equipment-requests.html` is orphaned** (no sidebar link) — the page for
    the external request boundary is invisible in the app.
11. **QR 'PO Receipt' accepts only 'Sent to Vendor'/'Shipped'/'Received'** —
    'Arrived' (set by simulate-arrival) is rejected, breaking the
    arrive→scan-receive chain the UI implies.

## 7. Security / authorization issues

1. **CRITICAL: `scim_db-2026-10-05-114116.sql` is committed to git and sits in
   the webroot unprotected** (.htaccess denies only `config.php`/`init.sql`).
   It contains bcrypt hashes and a live TOTP `mfa_secret`. Must be removed from
   the webroot/repo history, .htaccess extended, and the exposed MFA secret +
   credentials rotated.
2. `system_integrations` stores `api_secret` in plaintext (required for HMAC
   verify, but should at least be flagged/rotatable; consider hashing where a
   lookup by key id is used).
3. Rate-limit config keys exist but **no enforcement code**.
4. OTP tickets and tokens handled well; session cookie httponly+Lax; bearer
   tokens are per-tab. Admin single-device enforcement was not observed —
   `session_tokens` accumulates; no per-user session cap.
5. `PUT /users/{id}` and role changes are Admin-gated — good; `PUT
   /pos/{id}/status` lets WarehouseStaff mark 'Shipped'/'Arrived' (vendor-side
   events staff shouldn't assert).
6. Frontend guards hide buttons but every mutation is also server-gated —
   generally sound; gaps are semantic (arbitrary status values) not bypasses.
7. Password complexity enforced on change; login rate-throttling absent
   (login_history logs failures but nothing locks out).

## 8. Data-integrity issues

- **Missing FKs:** `purchase_orders.vendor_id`, `scan_logs.asset_id`,
  `finance_settlements.po_id/vendor_id`, `fleet_requests.*`,
  `documents.related_po/po_number/asset_ref`, `assets.location/bin_row` →
  zones/rows (varchar matching only), `users.role` → `roles` (unused table).
- **Duplicate columns:** `documents.related_po` + `po_number`;
  `supplier/vendor` dual naming; `warehouse_shelves` duplicates rows concept.
- **Free-text structured data:** `purchase_orders.items`, `requisitions`
  description-as-items, `equipment_requests.equipment_needed`.
- **No stock ledger:** `asset_transactions` lacks quantity delta, actor,
  and source-document reference — can't reconstruct "RECEIVING +50".
- **Racy numbering:** `COUNT(*)+1` for po_number (no UNIQUE constraint →
  duplicates possible); req_number has UNIQUE but same racy generator.
- **Zone naming inconsistency:** 'Zone F' stored verbatim vs canonical 'A'–'E';
  `occupied` columns retained though now computed live (schema redundancy).
- **Burned auto-increments** (roles=32865, integration_config=80067) — residue
  of the old per-request migrate() INSERT IGNORE churn.
- **Category casing inconsistent** in prod data ('IT Equipment' vs
  'IT equipment') — free-text category on assets.
- **Equipment-request fulfill doesn't check asset status** — an already-
  Deployed serial can be double-assigned.
- mysqldump lacks `--routines` — the stored procedures
  (`generate_equipment_request_number`, `log_equipment_request_activity`)
  are absent from the SQL dump; restores would silently break fulfillment.

## 9. Integration issues

Real boundaries exist: HMAC inbound (equipment-requests, PO budget-status,
asset assign/lookup), outbound tables (finance_settlements→AP,
clearance_tokens→Core 3, fleet_requests→Fleet), export feeds for BI
(`/integration/export/*`), audit log, xref map. Gaps:

- HRIS/employee identity is approximated by the local `users` table — fine
  for staff, but requisitions have no employee/department master fields.
- No outbound push exists for webhooks (registry only) — integrations are
  pull/poll from the other systems' side.
- equipment_requests (external) and requisitions (internal) should converge on
  one supply-request model with a `source` discriminator.
- Finance sees only a flat settlement row — no item-level invoice detail.

## 10. Proposed target architecture

Same stack (PHP/PDO/MariaDB, flat JS) — the problem is transaction shape, not
framework. Introduce a **document-oriented transaction spine**:

- `supply_requests` + `supply_request_items` (unify requisitions +
  equipment_requests; `source` = INTERNAL | EXTERNAL:<system>).
- `purchase_orders` + real `purchase_order_items` (+ `qty_received`).
- `goods_receipts` + `goods_receipt_items` — each receipt row links PO line,
  qty, condition, receiver, and the asset serial(s) created/committed.
- `issuances` + `issuance_items` — request fulfillment; links request item →
  asset serial → recipient/department.
- `stock_movements` — the auditable ledger: (ref_type, ref_id, item/asset,
  qty_delta, from_loc, to_loc, actor, reason). Every mutation writes here.
- `warehouses` table (multi-warehouse future-proofing; zones → warehouse).
- Documents gain typed FK columns (`receipt_id`, `po_id`, `request_id`,
  `issuance_id`) replacing free-text duality.

QR flow becomes: scan → resolve asset → choose transaction context
(receipt against PO / issuance against request / transfer / return /
damage) → write movement + update status/qty + audit — one path.

## 11. Proposed database changes (migration strategy §14)

- Add: `supply_request_items`, `goods_receipts`, `goods_receipt_items`,
  `issuances`, `issuance_items`, `stock_movements`, `warehouses`,
  `requisition`-level requester fields (employee_id, department_code).
- Alter: `assets` add `po_id`/`receipt_id` provenance + `uom`;
  `purchase_orders.po_number` → UNIQUE; `purchase_order_items` add
  `quantity_received`; `requisitions` add `approved_by/approved_at/
  fulfillment_status`; deprecate `related_po` (keep `po_number` → FK);
  `asset_transactions` add `qty_delta`, `actor_id`, `ref_type`, `ref_id`.
- FKs: vendor_id, asset refs, doc links, users.role→roles.
- Drop (after archive): `warehouse_shelves`, `document_logs`.

## 12. Proposed API changes

- `POST /pos/{id}/receive` — structured `{items:[{po_item_id, qty, condition,
  serials[]}]}`; computes Partial/Fully Received; writes goods_receipt +
  stock_movements + creates/links assets; blocks over-receipt.
- `POST /supply-requests` (+items), `POST /supply-requests/{id}/fulfill`
  ({assignments}) — issues stock, writes issuance + movements.
- `POST /quotes`, `POST /quotes/{id}/accept` → auto-creates Draft PO from
  quote lines.
- `PUT /pos/{id}/status` → whitelist + transition map enforced server-side.
- `POST /assets/scan` gains `context` (receipt/issuance/transfer/return/
  damage) + `ref` parameters; deprecate free-form actions where a transaction
  type exists.
- Keep all existing read endpoints stable; add `/stock-movements`,
  `/goods-receipts`, `/issuances` list endpoints.

## 13. Proposed workflow / state transitions

Requisition: Submitted → Inventory Review → (Stock OK → Issued → Closed |
Insufficient → Procurement Review → Sourcing → Ordered → Closed).
PO: Draft → Pending Approval → Approved → Sent to Vendor → Shipped →
Arrived → (Partially Received)* → Fully Received → Completed; Rejected /
Cancelled terminal. Receiving = item-level records, never a bare status flip.

## 14. Migration strategy

Non-destructive, versioned via existing `schema_migrations` (next: v6..v8):

1. v6 additive only — create new tables, add columns, backfill: explode
   `purchase_orders.items` text into `purchase_order_items`; copy
   `requisitions` into new request shape; synthesize `stock_movements`
   history from `asset_transactions`+`scan_logs`; set `assets.po_id` from
   PO-name correlation where deterministic.
2. v7 constraints — add FKs after orphan cleanup; UNIQUE po_number after
   dedupe check.
3. v8 deprecation — drop `warehouse_shelves`, `document_logs`,
  `documents.related_po` (data copied to `po_number` first).
Rollback: each step is additive/column-preserving; drops deferred to a later
version once reads are verified. Backup prod dump BEFORE v6 (and store it
outside the webroot).

## 15. Implementation phases

- **Phase 0 (safety):** remove SQL dump from repo+webroot, .htaccess deny
  `*.sql`, rotate exposed MFA secret & credentials, fix 'Arrived' gap in
  PO Receipt scan. Small, immediate.
- **Phase 1 (transaction spine):** stock_movements + goods_receipts +
  structured receiving + PO state machine + po_number UNIQUE. Biggest
  business-value win; touches scan receive + procurement UI.
- **Phase 2 (requests):** supply_request_items, issuance flow, stock
  check → procure/issue branch, equipment_requests convergence.
- **Phase 3 (supplier chain):** quotes write path + accept→PO, supplier
  performance from real receipt data.
- **Phase 4 (documents+integration):** auto-generated receiving/issuance
  documents, typed doc links, webhook dispatch or removal.
- **Phase 5 (hygiene):** schema drops, warehouse entity, UOM, role expansion
  (RequestingStaff/Finance), rate limiting, login lockout.

Awaiting approval before any destructive or structural change.
