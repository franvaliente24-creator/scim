# Department Validation Stage — Supply Request Workflow (V5.1)

Date: 2026-10-06
Scope: Adds an authorized department-approval stage between request submission and supply-chain processing, plus a staff request portal.

## The workflow now

Requesting staff creates a supply request — as a Draft or submitted directly — carrying requester, employee ID, department, itemized items/quantities, purpose/justification, priority, and a needed-by date. The request then enters **Under Department Review**: an authorized approver for that specific department validates the business need and quantity, and approves or rejects with recorded remarks. Only after department approval does the request appear in the supply-chain queue, where Inventory Review decides between For Issuance (stock sufficient) and In Procurement (stock short). Procurement, goods receipt, issuance, stock movements, and request closure work exactly as before.

The status model is: Draft → Submitted → Under Department Review → Approved → Inventory Review → For Issuance / In Procurement → Partially Issued → Issued → Closed, with Rejected and Cancelled as terminal states. Every transition is enforced server-side and each step checks *who* is allowed to perform it.

## Authorization model

- **Requester** can submit, route to review, and cancel their own requests.
- **Department approver** — a user listed in the new `department_approvers` mapping table for that department — can approve or reject. Approver authorization is data-driven (a department can have several approvers), not role-driven, so HRIS can own the mapping once integrated. A Manager whose own `department` matches acts as a fallback when a department has no mapped approver.
- **Supply-chain staff** (Admin, Manager, WarehouseStaff) perform inventory review, release for issuance, send to procurement, issue stock, and close.
- **System Administrator no longer approves business need** — admin manages the approver registry instead (assign/remove approvers per department) and keeps system/user administration.

## New pieces

- `department_approvers` table + `users.department` column (schema v7). `supply_requests` gained `dept_approver_id`, `dept_remarks`, `submitted_at`.
- Approver registry endpoints: list (Admin/Manager see all; everyone sees only their own assignments), assign, deactivate — Admin only for writes.
- Request list scopes: `?scope=mine` (requester view), `?scope=dept` (an approver's department queue), `?scope=incoming` (the supply-chain queue — approved requests onward).
- **requests.html + requests.js** — the staff portal: create draft or submit, track own requests, and a Department Approvals card that appears for authorized approvers with approve/reject + remarks. It is linked at the top of every page's sidebar via layout.js. This is the temporary request-entry point until HRIS/Facilities/Administrative submit through the `source` field on the existing POST endpoint.
- Inventory's Approvals tab became **Incoming Requests** — the supply-chain queue showing Approved → Inventory Review → For Issuance / In Procurement → issued pipeline with the appropriate actions per status. Department-stage requests display an "Awaiting dept approval" chip — supply chain cannot act on them.
- The inventory "New Requisition" form now records requests *on behalf of* a department (with employee ID) that still go through department validation.
- `scimConfirm` supports optional remarks input.

## Bug found and fixed during validation

`logActivity()`'s details parameter is a non-nullable string; passing `null` for absent remarks caused a fatal *after* the status update had applied. Also added Under Department Review → Cancelled (withdrawal) to the transition map.

## Validation

25-check workflow battery (`_test_v51.php`): staff submit, draft lifecycle, self-approval denial, wrong-role/Admin denial, dept approver approve/reject with remarks enforcement, incoming/dept/mine scoping, approver registry authorization — all pass. The full 42-check Phase 0–2 battery (`_test_v50.php`) was re-run against the new statuses — all pass. Test users seeded: `qa.staff@test.local` (Staff, QA), `qa.head@test.local` (Manager, QA approver), `hr.staff@test.local` (Staff, HR).

## Notes

- Existing in-flight requests map onto the new statuses cleanly; old rows can still complete their lifecycle.
- No destructive changes; Phase 3–5 legacy convergence still untouched.
- Departments are free-text for now — consistent with the current request model; HRIS integration will provide the canonical department list later.
