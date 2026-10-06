# V5.1 Standalone Approval Adjustment — SCIM Staff → SCIM Manager → Supply Chain

This note describes an incremental adjustment to the V5.1 department-approval
workflow so the complete supply-request lifecycle can be demonstrated on the
standalone SCIM system, without any HRIS or external department-manager
integration. No new request model was introduced and the Phase 0–2 transaction
spine is unchanged.

## The standalone workflow

SCIM Staff creates a supply request in the Supply Requests portal, filling in
the requester, employee ID, department, itemized quantities, purpose or
justification, priority, and needed-by date. On submission the request moves
through Submitted into Under Department Review, exactly as before.

Any account with the `Manager` role acts as the authorized approver for every
department. From the Supply Requests portal the manager sees the Department
Approvals card, can review business need and quantities, add remarks, and
approve or reject. Approval is enforced server-side: only the configured
department approvers — or, when a department has no approver mapping yet, any
user with the Manager role — may move a request out of Under Department
Review. Rejection still requires remarks; both decisions record the approver's
identity, remarks, and timestamp.

Once approved, the request appears under Inventory Management → Incoming
Requests, which remains the supply-chain processing queue. Requests still in
department review show only an "awaiting approval" chip there and expose no
supply-chain actions. Inventory staff then run inventory review, and the
request follows the existing branches: sufficient stock goes For Issuance →
Issued → Closed; insufficient stock goes In Procurement → Purchase Order →
receiving → inventory update → issuance → Closed.

## What changed technically

Approver resolution in the API kept the `department_approvers` table as the
authoritative source, but the fallback was relaxed: when a department has no
active approver mappings, any Manager — rather than only a Manager whose own
department matches — may approve that department's requests. The moment real
department approvers are mapped (for example, once HRIS integration is live),
the mapping again restricts approval to the listed approvers for that
department, so the integrated behavior returns without any redesign.

The department queue scope followed the same rule: a Manager with no mappings
sees all requests awaiting department decision instead of only their own
department's. Admin remains unable to approve department requests and stays
responsible for user and approver configuration through the approver registry
endpoints.

The Inventory "Requisitions" tab was renamed "Supply Requests" and is now
clearly a tracking view over the same `supply_requests` records — the create
button files a request on behalf of a department and still routes through
manager approval, so no parallel requisition workflow exists.

## Accounts and access

No demo or test accounts are created or required. The workflow runs entirely
on the existing users' RBAC roles:

- Any `Staff`-role account (or any authenticated user) creates, submits, and
  tracks requests through the Supply Requests portal — and nothing else.
- Any active `Manager`-role account sees the Department Approvals queue and
  may approve or reject requests for every department while no approver
  mappings exist.
- `Admin` cannot approve department requests and remains responsible for
  user, system, and approver configuration.

Because every login requires an emailed OTP and the standalone environment
has no mail transport, the API returns the code inline as a development hint
when — and only when — the server is reached on localhost AND no SMTP
credentials are configured. The OTP page displays the code as a "dev mode"
banner; on the hosted deployment with real SMTP settings the hint never
appears and the code is delivered by email as before.

The leftover QA/HR department-approver mappings created by earlier testing
were deactivated so the Manager fallback covers every department in demos;
the `department_approvers` architecture itself is untouched and remains the
integration point for future department-specific approvers.

## Validation

The complete standalone chain was exercised over HTTP with existing accounts:
staff login → request submitted to Under Department Review → invisible to the
supply-chain incoming queue → staff self-approval and Admin approval both
rejected server-side → Manager approval with remarks → request appears in
Incoming Requests as Approved. The V5.1 department workflow suite still
reports 25/25 and the Phase 0–2 regression suite 42/42.
