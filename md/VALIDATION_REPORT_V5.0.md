# Phase 0–2 Validation Report — Pre-Defense Pass

Date: 2026-10-05
Scope: Final stability validation of the Phase 0–2 transaction spine before the pre-defense demonstration.

## What changed since the last report

- **Bulk vs serialized issuance.** The issue endpoint now accepts either QR serials (serialized stock, one unit each) or a plain quantity (bulk/consumable stock — paper, cables, consumables). Bulk issues draw down `assets.quantity` from matching in-stock rows and write a single ISSUE movement with the full negative delta. The issue modal now shows both inputs per request line.
- **Bulk receiving lands in stock.** A PO receipt without serials now increments a matching bulk asset row or creates one (with a generated `BULK-*` code so it can still carry a bin/box label for scanning). Previously the quantity only appeared in the ledger without touching inventory.
- **Stock-check counts units, not rows.** Request stock-check now sums `assets.quantity`, so one bulk row of 500 reams correctly satisfies a request for 20.
- **Receipt revives returned serials.** Re-receiving a serial that was soft-deleted or archived now clears the tombstone — previously the asset stayed invisible to issuance.
- **Transfers no longer inflate stock.** `Move to Zone` / `Asset Transfer` scans write a TRANSFER movement with quantity delta 0 (a relocation, not a quantity change) in both the new ledger and the legacy transaction log.
- **Receive endpoint accepts `quantity_received`** as a line field alias.
- Test token used for validation was revoked after the run; test helper scripts are git-ignored.

## Test battery results (42 automated checks, all passing)

### Stock-sufficient branch (serialized)
Request created → Approved → Inventory Review → stock-check sufficient → serials `VTEST-LAP1/2` issued → 2 ISSUE movements with actor, source location, and issuance reference → assets marked Deployed → request Closed. No PO was created.

### Bulk issuance
`Bond Paper A4` bulk row (500 reams) → request for 20 → stock-check sufficient → issued by quantity only, no serials → quantity 500 → 480 → ISSUE movement of −20 with actor and zone → issuance item row qty 20 → request Issued/Closed.

### Stock-shortage → procurement branch (full lifecycle)
Request for 5 conference mics + 3 USB hubs → invalid transition rejected → Approved → Inventory Review → stock-check insufficient → In Procurement → linked PO created with 2 structured line items → Draft → Shipped rejected → Pending Approval → Approved → direct "Fully Received" flip blocked → Sent to Vendor → Shipped → Arrived → over-receipt of 99 blocked → GR-1 partial (3 mics by serial + 1 hub bulk) → **Partially Received** → GR-2 final (2 mics + 2 hubs) → **Fully Received** → line `quantity_received` = 5/5 and 3/3 → assets created and linked to PO + receipt → finance settlement forwarded → request auto-returned to issuable state → mixed issue (5 serials + 3 bulk) → Issued → Closed.

### Damage, return, transfer
Report Damage scan → asset `Damaged`, routed to `DISPOSAL`, DAMAGE movement with operator reason and actor. Check-In scan → RETURN movement. Move to Zone scan → TRANSFER movement with zero delta and both locations. Repeat-scan collision detection still blocks duplicate identical scans.

## Deliverable checklist

| Check | Result |
|---|---|
| Stock-sufficient scenario | PASS |
| Stock-shortage/procurement scenario | PASS |
| Partial receiving | PASS |
| Full receiving | PASS |
| Over-receiving prevention | PASS |
| Bulk inventory issuance | PASS |
| Serialized QR issuance | PASS |
| Stock movement audit (RECEIPT/ISSUE/RETURN/TRANSFER/DAMAGE) | PASS |
| Invalid PO transition prevention | PASS |
| Request closure | PASS |

## Remaining notes for the pre-defense

- QR scanning is transaction-context driven (intake, PO receipt, issue, return, transfer, damage) — every scan writes to the ledger with actor and reference.
- Legacy `requisitions`, `equipment_requests`, `warehouse_shelves`, `document_logs` remain untouched per the incremental migration plan.
- Test artifacts (`SR-2026-*`, `PO-2026-*`, `GR-2026-*`, `ISS-2026-*`, `VMIC-*`, `VTEST-*`, `BULK-PAPER-TEST1`) remain in the local database and can be shown live during the defense, or cleaned on request.
- Operational follow-up unchanged: rotate the credentials/MFA secret that were in the old committed SQL dump, since git history retains it.
