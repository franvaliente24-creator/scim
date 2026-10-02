# System Enhancements V4.3 — Security, Workflow & Module Refinements

This release applies the latest enhancement specification across Login & Security, Dashboard, Smart Warehousing, Inventory, Procurement, Supplier Management, Documents, and global system behavior. Where this spec conflicted with V4.2, the newer instructions won (for example, the QR generation form was slimmed down again, and requisitions moved fully into Inventory Management).

## 1. Login & Security

Password rules are now enforced on the server for every path that can set a password — creating users and updating credentials through User Management. A password must be 8–15 characters and contain uppercase, lowercase, a number, and a special character. Weak passwords are rejected with a clear error.

Sessions now expire after five minutes of inactivity. The warning dialog appears two minutes in, announcing that three minutes remain before the session ends. When a timeout forces a logout while the user is editing, the page auto-saves the draft first, so work is not lost.

Administrator accounts are limited to a single active login device. When an Admin completes OTP verification, every other live session token for that account is revoked — an older device is logged out immediately.

## 2. Dashboard

The dashboard leads with a high-visibility low-stock notice strip at the very top — relocated from Smart Warehousing — showing only categories and items that are actually below minimum.

Below it sit the Live Performance Metrics: an Inventory Performance panel (stock value, turnover, days sales of inventory, stockout rate, threshold alerts, dead stock) and a Fulfillment & Suppliers panel (on-time delivery, order cycle time, return rate, supplier rating with stars, supplier OTD, logistics spend).

A rolling Supplier Scorecard reports three separate tracked metrics with target comparison and red highlighting when a target is missed: OTIF Rate (target 95%), Quality Acceptance Rate (target 99.5%), and SLA Compliance (deliveries inside the 14-day window).

Zone metrics render as a line graph of per-zone scan activity over the last fourteen days. The dashboard polls every sixty seconds for real-time synchronization; chart instances are destroyed and recreated cleanly each refresh, and the calendar's month navigation no longer stacks duplicate listeners.

## 3. Smart Warehousing

Zone records carry a required category, and the category-to-zone mapping is enforced by the API — Zone A IT Equipment, Zone B Laptops, Zone C Monitors, Zone D Peripherals, Zone E Office Supplies, Zone F Disposal. A dedicated DISPOSAL zone exists and cannot be deleted.

The QR Generate Portal now asks only for item name, category, quantity, and an optional low-stock threshold. Destination zone, purchase date, and asset lifespan are auto-populated the moment the batch is generated, using the category mapping — these fields no longer appear on the form. Generated IDs stay pending (Awaiting Print) until physically scanned, each carrying fixed static attributes including its unique short Asset ID such as AST-000012.

Returning an asset now requires a reason: a checkbox set (damage, upgrade, resignation, end of life, other) plus a free-text box — required when Other is chosen. The reason is written into the scan log.

History was renamed to Activity Log everywhere, and each entry shows the operator's name and user ID. The tracking view gained pagination, and the registration and cost report tabs were removed entirely.

## 4. Inventory Management

Asset Inventory remains the searchable, paginated, server-filtered ledger. Item names are free text while ID tags are system-generated and unique, so they can never collide. The ledger polls live — scans in Smart Warehousing appear without a manual refresh. Valuation shows clearer labeled cards.

The requisition workflow moved fully into Inventory Management. The Requisitions tab hosts the submission form (title, department, purpose via checkboxes plus a custom Other text box, priority, estimated cost, needed-by date, description). The Approvals tab presents clear Approve and Reject buttons — Approve is open to Admins and Managers, while Reject remains Admin-exclusive per the standing authority model, enforced server-side. The Requisition Log tab sits last and holds the full decided history.

Archiving a record now asks for a reason (required) behind a warning prompt, and the API records the actor's name, user ID, timestamp, and reason in the immutable activity log. Admins and Managers can archive; the centralized Archive folder and Trash Bin remain Admin-only for review, restore, and purge.

A new Fleet Requests page lets inventory submit transport requests to Fleet & Vehicle Management — item, quantity, origin, destination, notes — with status tracking from Submitted through Delivered, and it is linked in every sidebar.

## 5. Procurement & Sourcing

The Sourcing tab, pipeline view, and requisition table were removed — that workflow lives in Inventory now. The Delivery & Receiving tab was removed; arrival simulation remains available in the API for testing but has no page.

The hub now has three tabs: Purchase Orders, PO History, and Settlements. PO creation uses a vendor dropdown populated live from the Vendor Directory — selecting a pre-cleared supplier auto-approves the order straight to the vendor.

PO History has day/week/month/year range filtering, pagination, and a per-row Activity Log icon that drills into that order's audit trail. Receiver identity (name and user ID) is captured in the PO activity whenever an order is marked arrived or received.

A settlement receipt is generated automatically at PO creation and upgrades to a Financial Management hand-off once the order is verified and arrived — the same settlement row, never a duplicate.

## 6. Supplier Management

The item catalog was removed. The Vendor Directory shows an Active/Inactive indicator, a performance tier badge (Strategic Partner, Tier 1 Supplier, Preferred Vendor, Probationary), a compliance summary, and a PRE-CLEARED flag for auto-PO suppliers.

Each row opens a comprehensive profile dialog covering tier, status, contact, rating, on-time and defect rates, contract reference, certifications, COI expiry, tax compliance, and anti-bribery clearance. Expired COIs and missing clearances are flagged in red/amber directly in the table. Editing a supplier exposes the compliance fields and the Auto-PO Approval toggle (Admin only). Deletion was replaced by archiving with a required reason.

## 7. Documents & Logistics

The file repository is organized into exactly four operational categories rendered as cards: Inbound Logistics & Receiving (ASN, Bill of Lading, packing slips/manifests, MRR, GR notes), Quality Control & Compliance (CoA/CoC, NCR with photo attachments, customs clearances), Inventory Control & Warehousing (cycle count logs, stock transfer orders, MSDS/SDS), and Outbound Logistics & Distribution (pick lists, waybills/shipping labels, proofs of delivery). The Add Document dialog now offers the new type taxonomy grouped by category, and the repository re-syncs every 45 seconds.

Permissions are view/download only — no edit, sign, or delete actions. The registry table gained pagination on top of its search and status filter.

## 8. Global & System-Wide

Sidebar navigation badges that overlapped the side panels were removed; the notification bell in the top bar remains and polls every minute. Delete buttons were removed from sidebar pages — records now flow through archive (with reason) into the centralized Archive folder, then optionally into the Trash Bin.

The Trash Bin retains deleted records for 30 days with a visible days-left counter; permanent purge is available and both folders are strictly Admin-only. Auto-save runs before any session-timeout logout. The Activity Log link sits inside the profile dropdown on every page and opens the full feed (Admins see all users; others see their own). Excel-compatible CSV exports with date-range parameters are available on historical surfaces, and every table ships with pagination, search, and day/week/month/year filtering where dates are meaningful.

## Migration Notes

The API's self-migration adds the new columns (asset specs/quantity/threshold/lifecycle fields, vendor compliance fields, zone categories, archive timestamps, requisitions purpose) and the fleet_requests and activity_log tables on first API hit after deploy. Hard-refresh to pick up the bumped script versions (dashboard v12, procurement v12, suppliers v12, documents v12, inventory v12, warehousing v12, inactivity v3).
