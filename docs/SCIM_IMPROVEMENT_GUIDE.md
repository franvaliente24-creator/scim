# SCIM Improvement Guide

## Summary
This document tracks the changes made to the SCIM application and lists the remaining areas that still need attention.

## Improvements Already Applied

### 1) Missing Edit/Update API routes were added
The main issue was that the application had read and create endpoints for assets, requisitions, and suppliers, but no matching update handlers for edit actions.

The following routes were added in [api/index.php](../api/index.php):

- PUT /api/v1/assets/:qr_code
- PUT /api/v1/procurement/requisitions/:id_or_req_number
- PUT /api/v1/suppliers/:id
- PUT /api/v1/vendors/:id

These routes update only the fields delivered in the request body, which is the safest pattern for edit forms.

### 2) Consistency with existing update patterns
The new handlers follow the same structure as the existing user update endpoint so the API remains predictable and easier to maintain.

### 3) Frontend intent is now aligned with backend capability
The existing UI has Edit buttons for assets, requisitions, and suppliers. The backend now supports those operations.

---

## Verified Status
The route implementations are present in the backend file and match the application’s existing API conventions.

Evidence:
- [api/index.php](../api/index.php#L643-L681)
- [api/index.php](../api/index.php#L971-L1057)
- [api/index.php](../api/index.php#L1099-L1183)

> Note: a PHP syntax validation was attempted, but the current environment does not have PHP installed, so runtime linting could not be completed here.

---

## Areas That Still Need Improvement

### 1) Frontend edit forms not yet fully implemented
Although the backend supports updates, the edit modal or form logic may still need to be connected to the new routes.

Recommended checks:
- confirm the edit button triggers a PUT request
- confirm the payload structure matches the backend field names
- validate the response handling and UI refresh flow

### 2) Missing DELETE routes for some entities
Some management areas may still be incomplete if items are intended to be removable from the UI.

Consider adding:
- DELETE /api/v1/assets/:qr_code
- DELETE /api/v1/procurement/requisitions/:id
- DELETE /api/v1/suppliers/:id

### 3) Input validation and error handling
The API should validate:
- required fields
- numeric values for amounts and rates
- valid dates for needed_by / expected_delivery
- duplicate supplier name or duplicate QR code scenarios

### 4) Authorization checks
Some routes may benefit from stricter role enforcement depending on the business rules.

Review:
- whether managers and admins are the correct actors for edits
- whether specific departments should see or edit only their own records

### 5) Audit trail logging
The system already logs some transactions, but update actions should capture:
- who changed a record
- what was changed
- when it changed

This helps with compliance and troubleshooting.

### 6) Better response payloads
The API currently responds with minimal success payloads, such as {"ok": true}. For maintainability, it may help to return:
- updated record id
- record identifier
- changed field names
- message text

---

## Recommended Next Tasks

1. Check each edit form in the frontend and confirm it calls the correct PUT endpoint.
2. Add validation to reject bad request payloads early.
3. Add delete endpoints if they are required by the workflow.
4. Improve audit logging for edits.
5. Run actual end-to-end tests in a PHP-enabled environment.

---

## Quick Status Snapshot

### Fixed
- Missing update routes for assets
- Missing update routes for requisitions
- Missing update routes for suppliers/vendors

### Still pending
- End-to-end frontend-to-API verification
- Input validation hardening
- Delete support
- Audit log improvements
- Test coverage

---

## Suggested Follow-up
Once the edit screens are tested in the browser, the next step should be to create a more formal QA checklist covering:
- create
- read
- edit
- delete
- permissions
- validation
- error messages
