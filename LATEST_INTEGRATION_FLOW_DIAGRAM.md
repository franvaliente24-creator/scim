# Latest SCIM System Integration Flow Diagram

## Enhanced System Architecture with Integration Capabilities

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    GREAT SOLOMON SCIM - ENHANCED INTEGRATION ARCHITECTURE                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐    │
│  │ EXTERNAL SYSTEMS │         │   SCIM SYSTEM    │         │   INTEGRATION    │         │   DATABASE       │    │
│  │ (HRIS, Finance,  │         │   (Core)         │         │   LAYER          │         │   (MariaDB)      │    │
│  │  ERP, etc.)      │         │                  │         │                  │         │                  │    │
│  └──────────────────┘         └──────────────────┘         └──────────────────┘         └──────────────────┘    │
│           │                            │                            │                            │                      │
│           │ REST API                   │ Internal API               │ Integration Logic          │ SQL                   │
│           │ JSON                       │                            │                            │                      │
│           ▼                            ▼                            ▼                            ▼                      │
│  ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐    │
│  │ External APIs    │────────▶│ api/index.php    │────────▶│ Integration     │────────▶│ Database Tables  │    │
│  │ - HR System      │         │ - Core Endpoints │         │ Functions       │         │ - Core Tables    │    │
│  │ - Finance System │         │ - Integration    │         │ - Auth          │         │ - Integration    │    │
│  │ - ERP Systems    │         │   Endpoints      │         │ - Validation    │         │   Tables         │    │
│  └──────────────────┘         └──────────────────┘         └──────────────────┘         └──────────────────┘    │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Complete Integration Architecture Overview

### 1. External System Integration Points

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SYSTEM INTEGRATION POINTS                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          HR INFORMATION SYSTEM (HRIS)                                                       │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │  • Employee Onboarding → Equipment Requests                                                                │  │
│  │  • Employee Data Sync → Asset Assignment                                                                   │  │
│  │  • Department Changes → Cost Center Updates                                                               │  │
│  │  • Employee Termination → Asset Recovery Workflow                                                          │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          FINANCIAL SYSTEM                                                                   │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │  • Budget Approval → Purchase Order Authorization                                                          │  │
│  │  • Cost Center Validation → Equipment Request Approval                                                      │  │
│  │  • Invoice Processing → Payment Status Updates                                                             │  │
│  │  • Financial Reporting → Asset Valuation Data Export                                                       │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          ERP SYSTEMS                                                                        │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │  • Inventory Sync → Real-time Stock Levels                                                                  │  │
│  │  • Procurement Data → Purchase Order Integration                                                            │  │
│  │  • Asset Tracking → Cross-system Asset Registry                                                             │  │
│  │  • Reporting → Unified Business Intelligence                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Integration Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                            INTEGRATION LAYER COMPONENTS                                                        │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          INTEGRATION AUTHENTICATION                                                         │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │  • API Key Validation (HTTP_X_API_KEY)                                                                      │  │
│  │  • HMAC Signature Verification (HTTP_X_API_SIGNATURE)                                                        │  │
│  │  • System Identification (HTTP_X_SYSTEM_ID)                                                               │  │
│  │  • Timestamp Validation (HTTP_X_TIMESTAMP)                                                                  │  │
│  │  • Integration Status Check (Active/Inactive)                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          INTEGRATION ENDPOINTS                                                              │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  EQUIPMENT REQUEST ENDPOINTS:                                                                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ POST   /api/v1/integration/equipment-requests                          Create equipment request       │  │  │
│  │  │ GET    /api/v1/integration/equipment-requests/{id}                    Get equipment request details   │  │  │
│  │  │ PUT    /api/v1/integration/equipment-requests/{id}/status              Update request status          │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ASSET INTEGRATION ENDPOINTS:                                                                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/integration/assets/{qr_code}                           Get asset by QR code           │  │  │
│  │  │ POST   /api/v1/integration/assets/{qr_code}/assign                    Assign asset to employee      │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  PURCHASE ORDER INTEGRATION ENDPOINTS:                                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/integration/purchase-orders/{po_number}                 Get PO details                │  │  │
│  │  │ PUT    /api/v1/integration/purchase-orders/{po_number}/budget-status   Update budget status          │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  DATA EXPORT ENDPOINTS:                                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/integration/export/inventory                           Export inventory data          │  │  │
│  │  │ GET    /api/v1/integration/export/audit-trail                          Export audit trail             │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  WEBHOOK MANAGEMENT ENDPOINTS:                                                                            │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ POST   /api/v1/integration/webhooks                                  Create webhook                 │  │  │
│  │  │ GET    /api/v1/integration/webhooks                                  List webhooks                  │  │  │
│  │  │ DELETE /api/v1/integration/webhooks/{id}                              Deactivate webhook             │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  SYSTEM ENDPOINTS:                                                                                         │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/integration/health                                    Health check                  │  │  │
│  │  │ GET    /api/v1/integration/config                                     Get integration config        │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Enhanced Database Schema for Integration

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION DATABASE SCHEMA                                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          INTEGRATION MANAGEMENT TABLES                                                       │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ system_integrations (External system connections)                                                     │  │  │
│  │  │ - id, system_name, system_type, api_endpoint, api_key, api_secret, status,                           │  │  │
│  │  │   contact_email, last_sync, created_at, updated_at                                                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ external_references (Cross-system entity mapping)                                                     │  │  │
│  │  │ - id, scim_entity_type, scim_entity_id, external_system, external_reference_id,                     │  │  │
│  │  │   reference_type, sync_status, last_synced, created_at, updated_at                                  │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ webhooks (Event-driven integration)                                                                   │  │  │
│  │  │ - id, webhook_id, system_integration_id, event_types, target_url, webhook_secret,                   │  │  │
│  │  │   active, retry_policy, max_retries, last_triggered, success_count, failure_count                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ webhook_logs (Webhook delivery tracking)                                                              │  │  │
│  │  │ - id, webhook_id, event_id, event_type, payload, response_code, response_body,                     │  │  │
│  │  │   delivery_status, attempt_number, next_retry_at, sent_at, created_at                               │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          EQUIPMENT REQUEST MANAGEMENT TABLES                                               │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ equipment_requests (Cross-system equipment requests)                                                  │  │  │
│  │  │ - id, request_number, external_request_id, requesting_system, employee_name,                       │  │  │
│  │  │   employee_id, department, equipment_needed, needed_by, business_justification,                    │  │  │
│  │  │   cost_center, priority, status, estimated_cost, actual_cost, rejection_reason,                       │  │  │
│  │  │   requested_date, approved_by, approved_date, fulfilled_date, created_at, updated_at                 │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ equipment_request_items (Detailed line items)                                                        │  │  │
│  │  │ - id, request_id, category, specifications, quantity, priority, assigned_asset_id,                   │  │  │
│  │  │   assigned_qr_code, unit_cost, total_cost, fulfillment_status, fulfilled_date, created_at          │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ equipment_request_activity (Activity audit trail)                                                     │  │  │
│  │  │ - id, request_id, action, details, performed_by, performed_by_system, created_at                     │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          DATA EXPORT & SYNC TABLES                                                          │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ scheduled_exports (Automated data export jobs)                                                        │  │  │
│  │  │ - id, export_id, system_integration_id, export_type, export_format, frequency,                     │  │  │
│  │  │   schedule_time, last_run, next_run, delivery_method, target_url, active, created_at, updated_at      │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ export_history (Export execution history)                                                             │  │  │
│  │  │ - id, export_id, export_type, record_count, file_size, file_path, status, error_message,             │  │  │
│  │  │   export_start, export_end, created_at                                                               │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          AUDIT & CONFIGURATION TABLES                                                       │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ integration_audit_log (Complete integration audit trail)                                                │  │  │
│  │  │ - id, system_integration_id, external_system, action, entity_type, entity_id,                         │  │  │
│  │  │   request_data, response_data, status, error_message, ip_address, user_agent, created_at              │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ integration_config (Runtime configuration)                                                             │  │  │
│  │  │ - id, config_key, config_value, config_type, description, is_encrypted, created_at, updated_at     │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ api_rate_limits (API rate limiting and throttling)                                                     │  │  │
│  │  │ - id, system_integration_id, external_system, endpoint, request_count, window_start,                │  │  │
│  │  │   window_end, blocked_until, created_at, updated_at                                                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          ENHANCED CORE TABLES                                                              │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ assets (Enhanced with integration columns)                                                             │  │  │
│  │  │ [Original columns] + assigned_to_system, external_employee_id, external_employee_name,                │  │  │
│  │  │ assignment_date, assignment_notes, cost_center                                                         │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │ purchase_orders (Enhanced with integration columns)                                                  │  │  │
│  │  │ [Original columns] + budget_code, budget_status, budget_approved_by, budget_approved_date,             │  │  │
│  │  │ external_po_reference, requesting_system                                                               │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Latest System Flow Diagrams

### 1. Cross-System Equipment Request Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   HR System      │     │ SCIM API         │     │ SCIM Database    │     │ SCIM UI          │
│   (External)     │     │ (Integration)    │     │                  │     │ (equipment-      │
│                  │     │                  │     │                  │     │  requests.html)  │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
       │                     │                     │                     │
       │ 1. New employee     │                     │                     │
       │    onboarding       │                     │                     │
       │    triggers         │                     │                     │
       │    equipment        │                     │                     │
       │    request          │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. POST /api/v1/   │                     │
                             │    integration/    │                     │
                             │    equipment-       │                     │
                             │    requests         │                     │
                             │    + Auth headers   │                     │
                             │    (API Key,       │                     │
                             │     Signature)     │                     │
                             │                     │                     │
                             │ 3. Validate auth   │                     │
                             │    via integration  │                     │
                             │    Auth()           │                     │
                             │                     │                     │
                             │ 4. Generate request │                     │
                             │    number (stored   │                     │
                             │    procedure)       │                     │
                             │                     │                     │
                             │ 5. Calculate       │                     │
                             │    estimated cost   │                     │
                             │                     │                     │
                             │ 6. Insert into     │                     │
                             │    equipment_       │                     │
                             │    requests         │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 7. Insert request  │
                                                   │    with external    │
                                                   │    system reference │
                                                   │                     │
                                                   │ 8. Log activity    │
                                                   │    via stored      │
                                                   │    procedure       │
                                                   │                     │
                                                   │ 9. Trigger webhook │
                                                   │    (if configured) │
                                                   │◀────────────────────│
                             │                     │
                             │ 10. Return success  │
                             │     with request    │
                             │     number          │
                             │◀────────────────────│
       │                     │                     │
       │ 11. Receive SCIM    │                     │
       │     request number  │                     │
       │     for tracking    │                     │
       │◀────────────────────│                     │
       │                     │                     │
       │                     │                     │ 12. Manager sees    │
       │                     │                     │     new request in  │
       │                     │                     │     equipment-      │
       │                     │                     │     requests.html   │
       │                     │                     │     (via GET /api/  │
       │                     │                     │     v1/equipment-    │
       │                     │                     │     requests)      │
       │                     │                     └────────────────────▶│
       │                     │                     │                     │
       │                     │                     │ 13. Display request │
       │                     │                     │     with system     │
       │                     │                     │     source info     │
       │                     │                     │◀────────────────────│
       │                     │                     │                     │
       │ 14. Manager         │                     │                     │
       │     approves/       │                     │                     │
       │     rejects request │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 15. PUT /api/v1/   │                     │
                             │     equipment-      │                     │
                             │     requests/{id}/  │                     │
                             │     status          │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 16. Update status  │
                                                   │     + approval     │
                                                   │     details         │
                                                   │                     │
                                                   │ 17. Log activity   │
                                                   │     + trigger      │
                                                   │     webhook         │
                                                   │                     │
                                                   │ 18. Return success │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 19. Notify HR      │                     │
                             │     system via      │                     │
                             │     webhook         │                     │
                             │     (if configured) │                     │
                             └────────────────────│                     │
       │                     │                     │                     │
       │ 20. HR system       │                     │                     │
       │     receives       │                     │                     │
       │     status update  │                     │                     │
       │◀────────────────────│                     │                     │
```

### 2. Asset Assignment Integration Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   HR System      │     │ SCIM API         │     │ SCIM Database    │     │ SCIM Warehouse  │
│   (External)     │     │ (Integration)    │     │                  │     │ Operations      │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
       │                     │                     │                     │
       │ 1. Employee needs  │                     │                     │
       │    asset           │                     │                     │
       │    assignment      │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. POST /api/v1/   │                     │
                             │    integration/    │                     │
                             │    assets/{qr_code}│                     │
                             │    /assign         │                     │
                             │    + Auth headers  │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 3. Validate asset  │
                                                   │    exists by QR     │
                                                   │    code             │
                                                   │                     │
                                                   │ 4. Update asset    │
                                                   │    with employee   │
                                                   │    details:        │
                                                   │    - assigned_to_  │
                                                   │      system        │
                                                   │    - external_     │
                                                   │      employee_id   │
                                                   │    - external_     │
                                                   │      employee_name │
                                                   │    - cost_center   │
                                                   │                     │
                                                   │ 5. Create external │
                                                   │    reference       │
                                                   │    mapping         │
                                                   │                     │
                                                   │ 6. Log assignment  │
                                                   │    in asset_       │
                                                   │    transactions    │
                                                   │                     │
                                                   │ 7. Trigger webhook │
                                                   │    for asset.      │
                                                   │    assigned event  │
                                                   │◀────────────────────│
                             │                     │
                             │ 8. Return success  │
                             │    with asset      │
                             │    details         │
                             │◀────────────────────│
       │                     │                     │
       │ 9. HR system       │                     │
       │    receives asset  │                     │
       │    assignment      │                     │
       │    confirmation    │                     │
       │◀────────────────────│                     │
                             │                     │                     │
                             │                     │ 10. Warehouse sees │
                             │                     │     asset status    │
                             │                     │     change in      │
                             │                     │     inventory       │
                             │                     │     management      │
                             │                     └────────────────────▶│
                                                   │                     │
                                                   │ 11. Asset shows    │
                                                   │     as "Deployed"   │
                                                   │     with employee   │
                                                   │     assignment     │
                                                   │     details        │
                                                   │◀────────────────────│
```

### 3. Purchase Order Budget Integration Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Finance System   │     │ SCIM API         │     │ SCIM Database    │     │ SCIM Procurement│
│ (External)       │     │ (Integration)    │     │                  │     │ Module          │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
       │                     │                     │                     │
       │ 1. PO created for  │                     │                     │
       │    budget          │                     │                     │
       │    approval        │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. POST /api/v1/   │                     │
                             │    pos (standard)   │                     │
                             │    or integration   │                     │
                             │    endpoint        │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 3. Create PO with  │
                                                   │    budget columns:  │
                                                   │    - budget_code   │
                                                   │    - budget_status │
                                                   │    - external_po_  │
                                                   │      reference    │
                                                   │                     │
                                                   │ 4. Log PO activity │
                                                   │                     │
                                                   │ 5. Trigger webhook │
                                                   │    for po.created  │
                                                   │◀────────────────────│
                             │                     │
                             │ 6. Return PO with  │
                             │    budget status   │
                             │◀────────────────────│
       │                     │                     │
       │ 7. Finance system  │                     │
       │    reviews PO      │                     │
       │    against budget  │                     │
       │◀────────────────────│                     │
       │                     │                     │
       │ 8. Finance approves │                     │
       │    budget          │                     │
       └────────────────────▶│                     │
                             │                     │                     │
                             │ 9. PUT /api/v1/    │                     │
                             │    integration/    │                     │
                             │    purchase-orders/ │                     │
                             │    {id}/budget-    │                     │
                             │    status          │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 10. Update budget  │
                                                   │     status +       │
                                                   │     approval       │
                                                   │     details        │
                                                   │                     │
                                                   │ 11. Log activity   │
                                                   │     + trigger      │
                                                   │     webhook        │
                                                   │                     │
                                                   │ 12. Return success │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 13. Notify SCIM    │                     │
                             │     procurement     │                     │
                             │     team via        │                     │
                             │     webhook         │                     │
                             └────────────────────│                     │
                             │                     │                     │
                             │                     │ 14. Procurement    │
                             │                     │     team sees PO    │
                             │                     │     budget approved │
                             │                     │     and can proceed │
                             │                     └────────────────────▶│
                                                   │                     │
                                                   │ 15. PO shows as     │
                                                   │     "Budget        │
                                                   │     Approved"      │
                                                   │     in procurement  │
                                                   │     module         │
                                                   │◀────────────────────│
```

### 4. Webhook Event Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ SCIM System      │     │ Webhook System   │     │ External System  │     │ Webhook Logs     │
│ (Event Trigger)  │     │ (Processing)     │     │ (Consumer)       │     │ (Audit Trail)    │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
       │                     │                     │                     │
       │ 1. Event occurs    │                     │                     │
       │    (e.g., asset    │                     │                     │
       │     assigned,      │                     │                     │
       │     request        │                     │                     │
       │     fulfilled)     │                     │                     │
       │                     │                     │                     │
       │ 2. Check for       │                     │                     │
       │    webhooks for    │                     │                     │
       │    this event type │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 3. Find matching    │                     │
                             │    webhooks         │                     │
                             │    (event_types)    │                     │
                             │                     │                     │
                             │ 4. Prepare payload  │                     │
                             │    with event data  │                     │
                             │                     │                     │
                             │ 5. Generate        │                     │
                             │    signature using  │                     │
                             │    webhook secret   │                     │
                             │                     │                     │
                             │ 6. Log webhook     │                     │
                             │    delivery attempt │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 7. Create webhook_  │
                                                   │    log entry       │
                                                   │    with status     │
                                                   │    "Pending"       │
                                                   │                     │
                                                   │ 8. Send HTTP POST │
                                                   │    to target URL   │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 9. Receive webhook  │
                                                                         │    payload          │
                                                                         │    + verify         │
                                                                         │    signature        │
                                                                         │                     │
                                                                         │ 10. Process event   │
                                                                         │     (business      │
                                                                         │     logic)          │
                                                                         │                     │
                                                                         │ 11. Return response │
                                                                         │     (200 OK)        │
                                                                         │◀────────────────────│
                                                   │                     │
                                                   │ 12. Update webhook │
                                                   │     log with       │
                                                   │     response       │
                                                   │     details        │
                                                   │                     │
                                                   │ 13. Update webhook │
                                                   │     statistics:    │
                                                   │     - success_     │
                                                   │       count++      │
                                                   │     - last_        │
                                                   │       triggered    │
                                                   │                     │
                                                   │ 14. If failed:     │
                                                   │     - failure_     │
                                                   │       count++      │
                                                   │     - schedule     │
                                                   │       retry based   │
                                                   │       on policy     │
                                                   │                     │
                                                   │ 15. Return to SCIM │
                                                   │     with delivery   │
                                                   │     status         │
                                                   │◀────────────────────│
                             │                     │
                             │ 16. Log final      │                     │
                             │     delivery status │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 17. System         │                     │                     │
       │     continues       │                     │                     │
       │     processing      │                     │                     │
       │◀────────────────────│                     │                     │
```

### 5. Data Export & Synchronization Flow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ External System  │     │ SCIM API         │     │ SCIM Database    │     │ Export Scheduler │
│ (Data Consumer)  │     │ (Integration)    │     │                  │     │ (Background)     │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
       │                     │                     │                     │
       │ 1. Request data     │                     │                     │
       │    export           │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. GET /api/v1/    │                     │
                             │    integration/    │                     │
                             │    export/{type}   │                     │
                             │    + Auth headers  │                     │
                             └────────────────────▶│
                                                   │                     │
                                                   │ 3. Validate auth   │
                                                   │    + check config  │
                                                   │                     │
                                                   │ 4. Query data from │
                                                   │    relevant tables │
                                                   │    (e.g., assets,  │
                                                   │     purchase_      │
                                                   │     orders, etc.)   │
                                                   │                     │
                                                   │ 5. Format data     │
                                                   │    (JSON/CSV)      │
                                                   │                     │
                                                   │ 6. Create export   │
                                                   │    history record   │
                                                   │                     │
                                                   │ 7. Return data     │
                                                   │    + metadata      │
                                                   │◀────────────────────│
                             │                     │
                             │ 8. Return export   │                     │
                             │    data + stats     │                     │
                             │◀────────────────────│                     │
       │                     │                     │
       │ 9. Process export  │                     │
       │    data            │                     │
       │◀────────────────────│                     │
                             │                     │                     │
                             │                     │ 10. Scheduled     │
                             │                     │     exports check   │
                             │                     │     for next run    │
                             │                     └────────────────────▶│
                                                   │                     │
                                                   │ 11. Check         │
                                                   │     scheduled_     │
                                                   │     exports table  │
                                                   │     for due jobs    │
                                                   │                     │
                                                   │ 12. Execute export │
                                                   │     automatically  │
                                                   │     via webhook/    │
                                                   │     API call       │
                                                   │                     │
                                                   │ 13. Update export  │
                                                   │     history +      │
                                                   │     schedule next  │
                                                   │     run            │
                                                   │                     │
                                                   │ 14. Log any       │
                                                   │     errors         │
                                                   │◀────────────────────│
                             │                     │
                             │ 15. System ready   │                     │
                             │     for next export │                     │
                             │◀────────────────────│                     │
```

## Integration Security & Audit Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION SECURITY & AUDIT FLOW                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          REQUEST AUTHENTICATION FLOW                                                       │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  1. External System Request                                                                                │  │
│  │     ├─ HTTP Headers: X-API-Key, X-API-Signature, X-System-ID, X-Timestamp                                │  │
│  │     ├─ Request Body: JSON payload                                                                          │  │
│  │     └─ Method + Endpoint                                                                                  │  │
│  │                                                                                                             │  │
│  │  2. integrationAuth() Function Execution                                                                   │  │
│  │     ├─ Extract headers from request                                                                       │  │
│  │     ├─ Validate required headers present                                                                  │  │
│  │     ├─ Query system_integrations table by api_key                                                          │  │
│  │     ├─ Check integration status = "Active"                                                                │  │
│  │     ├─ Construct payload: Method + URI + Body + Timestamp                                                  │  │
│  │     ├─ Calculate expected HMAC-SHA256 signature using api_secret                                          │  │
│  │     ├─ Compare signatures using hash_equals() (timing attack safe)                                        │  │
│  │     └─ Return integration details or 401 error                                                           │  │
│  │                                                                                                             │  │
│  │  3. Automatic Audit Logging                                                                                │  │
│  │     ├─ Insert into integration_audit_log                                                                   │  │
│  │     ├─ Log: system_integration_id, external_system, action, request_data, status, IP, user_agent        │  │
│  │     └─ Include both success and failed attempts                                                           │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          RATE LIMITING FLOW                                                                │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  1. Check api_rate_limits table for integration + endpoint                                                │  │
│  │  2. If current time within rate limit window:                                                             │  │
│  │     ├─ Check if request_count < limit                                                                     │  │
│  │     ├─ If exceeded: Return 429 Too Many Requests                                                          │  │
│  │     └─ If not exceeded: Increment request_count                                                          │  │
│  │  3. If outside window: Reset counters and start new window                                                │  │
│  │  4. If rate limit repeatedly exceeded: Set blocked_until timestamp                                       │  │
│  │  5. Check blocked status before processing any request                                                    │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          ERROR HANDLING & RETRY FLOW                                                        │  │
│  ├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                                                             │  │
│  │  1. Integration Endpoint Error                                                                             │  │
│  │     ├─ Log error to integration_audit_log with status = "Failed"                                         │  │
│  │     ├─ Include error_message and response_data                                                          │  │
│  │     └─ Return appropriate HTTP error code (400, 401, 403, 404, 500)                                      │  │
│  │                                                                                                             │  │
│  │  2. Webhook Delivery Failure                                                                              │  │
│  │     ├─ Update webhook_logs with delivery_status = "Failed"                                               │  │
│  │     ├─ Increment failure_count in webhooks table                                                          │  │
│  │     ├─ Calculate next_retry_at based on retry_policy (exponential backoff)                               │  │
│  │     ├─ If attempt_number >= max_retries: Mark as permanently failed                                      │  │
│  │     └─ Background process retries failed webhooks                                                         │  │
│  │                                                                                                             │  │
│  │  3. Data Export Failure                                                                                   │  │
│  │     ├─ Update export_history with status = "Failed"                                                       │  │
│  │     ├─ Include error_message details                                                                     │  │
│  │     ├─ Notify administrators via configured alerts                                                        │  │
│  │     └─ Manual intervention required for critical exports                                                 │  │
│  │                                                                                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Latest System Components & Features

### New Integration Components:

1. **Equipment Requests Module** (`equipment-requests.html` + `equipment-requests.js`)
   - Cross-system equipment request management
   - Integration with external HR systems
   - Approval workflow with system source tracking
   - Fulfillment with asset assignment

2. **Integration API Endpoints** (in `api/index.php`)
   - Equipment request integration endpoints
   - Asset assignment integration
   - Purchase order budget integration
   - Data export endpoints
   - Webhook management
   - System health and configuration

3. **Enhanced Database Tables**
   - `system_integrations` - External system connections
   - `equipment_requests` - Cross-system equipment requests
   - `equipment_request_items` - Detailed line items
   - `equipment_request_activity` - Activity audit trail
   - `webhooks` - Event-driven integration
   - `webhook_logs` - Webhook delivery tracking
   - `external_references` - Cross-system entity mapping
   - `integration_audit_log` - Complete audit trail
   - `integration_config` - Runtime configuration
   - `api_rate_limits` - Rate limiting and throttling
   - `scheduled_exports` - Automated data exports
   - `export_history` - Export execution history

4. **Security Enhancements**
   - HMAC signature verification for API calls
   - Integration-specific authentication
   - Comprehensive audit logging
   - API rate limiting
   - Webhook signature verification

5. **Automation Features**
   - Webhook-based event notifications
   - Scheduled data exports
   - Automatic retry mechanisms
   - Real-time sync status tracking

This enhanced architecture transforms SCIM from a standalone inventory management system into a comprehensive integration platform that can seamlessly communicate with external HR, finance, and ERP systems while maintaining security, auditability, and data consistency.