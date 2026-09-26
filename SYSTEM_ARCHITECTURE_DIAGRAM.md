# Great Solomon SCIM - System Architecture Diagram

## High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GREAT SOLOMON SCIM SYSTEM                           │
│                     Supply Chain & Inventory Management                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   CLIENT SIDE    │         │   SERVER SIDE    │         │   DATABASE       │
│   (Browser)      │         │   (PHP Backend)  │         │   (MariaDB)      │
└──────────────────┘         └──────────────────┘         └──────────────────┘
         │                            │                            │
         │ HTTP/HTTPS                 │                            │
         │ JSON API                   │ PDO                        │
         ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ HTML Pages       │────────▶│ api/index.php    │────────▶│ Database Tables  │
│ (12 modules)     │◀────────│ (REST API)       │◀────────│ (15+ tables)     │
└──────────────────┘         └──────────────────┘         └──────────────────┘
         │                            │
         │                            │
         ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│ JavaScript       │         │ Session          │
│ (Module logic)   │         │ Management       │
│ CSS (Styling)    │         │ Security         │
└──────────────────┘         └──────────────────┘
```

## Detailed Component Architecture

### 1. Frontend Layer (Client-Side)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  login.html  │  │ otp.html     │  │mfa-setup.html│  │ index.html   │   │
│  │  login.js    │  │ otp.js       │  │mfa-setup.js  │  │ dashboard.js │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │warehousing   │  │ inventory    │  │ procurement  │  │ suppliers    │   │
│  │.html         │  │.html         │  │.html         │  │.html         │   │
│  │warehousing.js│  │ inventory.js │  │ procurement.js│  │ suppliers.js │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │purchase-orders│ │ documents    │  │ users.html   │  │ equipment-   │   │
│  │.html         │  │.html         │  │              │  │ requests.html│   │
│  │purchase-orders│ │ documents.js │  │ users.js     │  │ equipment-   │   │
│  │.js           │  │              │  │              │  │ requests.js │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    SHARED COMPONENTS                                  │  │
│  │  • layout.js (Sidebar, Profile Dropdown, Navigation)                 │  │
│  │  • permissions.js (Role-based access control)                         │  │
│  │  • inactivity.js (Session timeout management)                         │  │
│  │  • styles.css (Global styling)                                        │  │
│  │  • admin.css (Admin-specific styles)                                  │  │
│  │  • auth.css (Authentication styles)                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Backend Layer (Server-Side)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND LAYER (api/index.php)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      API ENDPOINTS                                     │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │  AUTHENTICATION ENDPOINTS                                            │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ POST /api/v1/auth/login      - User login                      │  │  │
│  │  │ POST /api/v1/auth/logout     - User logout                     │  │  │
│  │  │ GET  /api/v1/auth/me         - Current user info               │  │  │
│  │  │ POST /api/v1/mfa/setup      - Setup MFA                       │  │  │
│  │  │ POST /api/v1/mfa/verify     - Verify MFA code                 │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  DASHBOARD ENDPOINTS                                                 │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET  /api/v1/dashboard        - Dashboard statistics           │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  WAREHOUSE ENDPOINTS                                                 │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET  /api/v1/warehouse/zones  - Get warehouse zones           │  │  │
│  │  │ POST /api/v1/assets/scan      - Scan asset QR code            │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  INVENTORY ENDPOINTS                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/assets           - Get all assets               │  │  │
│  │  │ POST   /api/v1/assets           - Create new asset             │  │  │
│  │  │ PUT    /api/v1/assets/{id}     - Update asset                 │  │  │
│  │  │ DELETE /api/v1/assets/{id}     - Delete asset                 │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  PROCUREMENT ENDPOINTS                                               │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/requisitions    - Get all requisitions         │  │  │
│  │  │ POST   /api/v1/requisitions    - Create requisition           │  │  │
│  │  │ PUT    /api/v1/requisitions/{id} - Update requisition         │  │  │
│  │  │ DELETE /api/v1/requisitions/{id} - Delete requisition         │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  SUPPLIER ENDPOINTS                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/suppliers       - Get all suppliers             │  │  │
│  │  │ POST   /api/v1/suppliers       - Create supplier               │  │  │
│  │  │ PUT    /api/v1/suppliers/{id} - Update supplier               │  │  │
│  │  │ DELETE /api/v1/suppliers/{id} - Delete supplier               │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  PURCHASE ORDER ENDPOINTS                                            │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/pos              - Get all purchase orders      │  │  │
│  │  │ POST   /api/v1/pos              - Create purchase order        │  │  │
│  │  │ PUT    /api/v1/pos/{id}        - Update purchase order        │  │  │
│  │  │ DELETE /api/v1/pos/{id}        - Delete purchase order        │  │  │
│  │  │ POST   /api/v1/pos/{id}/approve - Approve PO                 │  │  │
│  │  │ POST   /api/v1/pos/{id}/reject  - Reject PO                  │  │  │
│  │  │ POST   /api/v1/pos/{id}/ship    - Mark as shipped             │  │  │
│  │  │ POST   /api/v1/pos/{id}/receive - Mark as received           │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  DOCUMENT ENDPOINTS                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/documents       - Get all documents             │  │  │
│  │  │ POST   /api/v1/documents       - Create document              │  │  │
│  │  │ PUT    /api/v1/documents/{id} - Update document              │  │  │
│  │  │ DELETE /api/v1/documents/{id} - Delete document              │  │  │
│  │  │ POST   /api/v1/documents/{id}/sign - Sign document            │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  │  USER MANAGEMENT ENDPOINTS (Admin Only)                              │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │ GET    /api/v1/users            - Get all users                │  │  │
│  │  │ POST   /api/v1/users            - Create user                  │  │  │
│  │  │ PUT    /api/v1/users/{id}      - Update user                  │  │  │
│  │  │ DELETE /api/v1/users/{id}      - Delete user                  │  │  │
│  │  │ GET    /api/v1/login-history    - Get login history            │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      SECURITY LAYER                                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  • Session Management (HTTP-only cookies)                            │  │
│  │  • Authentication Check (middleware)                                  │  │
│  │  • Role-Based Access Control (RBAC)                                   │  │
│  │  • Password Hashing (bcrypt)                                          │  │
│  │  • MFA Verification (TOTP)                                             │  │
│  │  • Audit Logging (login_history, activity tables)                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Database Layer (Data Persistence)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATABASE LAYER (MariaDB)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    AUTHENTICATION & USERS                             │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │  │
│  │  │ users        │    │ roles        │    │ login_history        │   │  │
│  │  │ - id         │◀───│ - id         │    │ - id                 │   │  │
│  │  │ - full_name  │    │ - name       │    │ - user_id            │   │  │
│  │  │ - email      │    │              │    │ - email              │   │  │
│  │  │ - password   │    │              │    │ - success            │   │  │
│  │  │ - role       │────┘              │    │ - ip_address         │   │  │
│  │  │ - mfa_secret │                     │ - created_at          │   │  │
│  │  │ - is_active  │                     └──────────────────────┘   │  │
│  │  └──────────────┘                                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    ASSET & WAREHOUSE MANAGEMENT                       │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │  │
│  │  │ assets       │    │ warehouse_   │    │ warehouse_rows       │   │  │
│  │  │ - id         │    │ zones        │    │ - id                 │   │  │
│  │  │ - qr_code    │    │ - id         │    │ - zone (FK)          │   │  │
│  │  │ - name       │    │ - zone       │    │ - row_num            │   │  │
│  │  │ - category   │    │ - capacity   │    │ - capacity           │   │  │
│  │  │ - value      │    │ - occupied   │    │ - occupied           │   │  │
│  │  │ - status     │    └──────────────┘    └──────────────────────┘   │  │
│  │  │ - location   │                                                      │  │
│  │  └──────────────┘    ┌──────────────┐                                │  │
│  │                      │ asset_       │                                │  │
│  │                      │ transactions│                                │  │
│  │                      │ - id         │                                │  │
│  │                      │ - asset_id   │──────────────────────┐       │  │
│  │                      │ - action     │                       │       │  │
│  │                      │ - zone       │                       │       │  │
│  │                      │ - created_at │                       │       │  │
│  │                      └──────────────┘                       │       │  │
│  │                                                            │       │  │
│  └────────────────────────────────────────────────────────────┼───────┘  │
│                                                               │          │
│  ┌────────────────────────────────────────────────────────────┼──────┐   │
│  │                    PROCUREMENT & SUPPLIERS                 │      │   │
│  ├────────────────────────────────────────────────────────────┼──────┤   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │      │   │
│  │  │ vendors      │    │ purchase_    │    │ purchase_    │ │      │   │
│  │  │ - id         │◀───│ orders       │    │ order_items  │ │      │   │
│  │  │ - name       │    │ - id         │◀───│ - id         │ │      │   │
│  │  │ - email      │    │ - po_number  │    │ - po_id (FK) │ │      │   │
│  │  │ - phone      │    │ - vendor_id  │────│ - item_name   │ │      │   │
│  │  │ - address    │    │ - vendor     │    │ - quantity   │ │      │   │
│  │  │ - category   │    │ - items      │    │ - unit_price  │ │      │   │
│  │  │ - rating     │    │ - total      │    └──────────────┘ │      │   │
│  │  │ - on_time_   │    │ - status     │                       │      │   │
│  │  │   rate       │    │ - expected_  │    ┌──────────────┐ │      │   │
│  │  │ - defect_    │    │   delivery   │    │ requisitions │ │      │   │
│  │  │   rate       │    │ - notes      │    │ - id         │ │      │   │
│  │  └──────────────┘    │ - created_at │    │ - req_number │ │      │   │
│  │                      └──────────────┘    │ - title      │ │      │   │
│  │                                          │ - department │ │      │   │
│  │                      ┌──────────────┐    │ - estimated_ │ │      │   │
│  │                      │ supplier_    │    │   cost       │ │      │   │
│  │                      │ quotes       │    │ - priority   │ │      │   │
│  │                      │ - id         │◀───│ - status     │ │      │   │
│  │                      │ - requisition│    │ - needed_by  │ │      │   │
│  │                      │   _id        │    │ - created_by │──────┘   │
│  │                      │ - vendor_id  │    └──────────────┘          │
│  │                      │ - quote_     │                                │
│  │                      │   amount     │                                │
│  │                      │ - status     │                                │
│  │                      └──────────────┘                                │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    DOCUMENTS & COMPLIANCE                              │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │  │
│  │  │ documents    │    │ document_   │    │ document_    │           │  │
│  │  │ - id         │    │ signatures  │    │ activity     │           │  │
│  │  │ - document_  │    │ - id         │    │ - id         │           │  │
│  │  │   type       │    │ - document_ │    │ - document_  │           │  │
│  │  │ - reference_ │    │   id        │────│   id         │           │  │
│  │  │   no         │    │ - signer_   │    │ - action     │           │  │
│  │  │ - owner      │    │   name      │    │ - details    │           │  │
│  │  │ - description│    │ - signature_ │    │ - created_at │           │  │
│  │  │ - related_po │    │   data      │    └──────────────┘           │  │
│  │  │ - due_date   │    │ - signed_at  │                              │  │
│  │  │ - status     │    └──────────────┘                              │  │
│  │  └──────────────┘                                                  │  │
│  │                      ┌──────────────┐                                │  │
│  │                      │ po_activity  │                                │  │
│  │                      │ - id         │                                │  │
│  │                      │ - po_id      │────────────────────────┐     │  │
│  │                      │ - action     │                        │     │  │
│  │                      │ - details    │                        │     │  │
│  │                      │ - created_at │                        │     │  │
│  │                      └──────────────┘                        │     │  │
│  └────────────────────────────────────────────────────────────┼─────┘     │
│                                                               │           │
└───────────────────────────────────────────────────────────────┼───────────┘
                                                                │
                                                                │
                                                                ▼
                                                        (Foreign Key Relationships)
```

## Complete System Flow Diagram

### Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │  login.html  │     │ api/index.php│     │  Database    │
│              │     │  login.js    │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │                     │
       │ 1. Navigate to     │                     │                     │
       │    system          │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. Display login    │                     │
                             │    form             │                     │
                             │◀────────────────────│                     │
                             │                     │                     │
       │ 3. Enter email/    │                     │                     │
       │    password         │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 4. POST /api/v1/    │                     │
                             │    auth/login       │                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 5. Validate        │                     │
                                                   │    credentials     │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 6. Check user
                                                                         │    exists & 
                                                                         │    password
                                                                         │    hash match
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 7. If success:     │
                                                   │    - Create session │
                                                   │    - Log to login_  │
                                                   │      history        │
                                                   │    - Check MFA      │
                                                   │                     │
                                                   │ 8. Return response  │
                                                   │    (with/without    │
                                                   │     MFA required)   │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 9. If MFA required: │                     │
                             │    - Redirect to    │                     │
                             │      otp.html       │                     │
                             │    - Store temp     │                     │
                             │      token          │                     │
                             │                     │                     │
                             │ 10. If no MFA:      │                     │
                             │     - Redirect to    │                     │
                             │       index.html     │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 11. Land on         │                     │                     │
       │     dashboard       │                     │                     │
       │◀────────────────────│                     │                     │
```

### MFA Verification Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │  otp.html    │     │ api/index.php│     │  Database    │
│              │     │  otp.js      │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │                     │
       │ 1. Enter 6-digit    │                     │                     │
       │    TOTP code        │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. POST /api/v1/    │                     │
                             │    mfa/verify       │                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 3. Retrieve user   │                     │
                                                   │    MFA secret       │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 4. Return MFA
                                                                         │    secret
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 5. Validate TOTP   │
                                                   │    code             │
                                                   │                     │
                                                   │ 6. If valid:        │
                                                   │    - Enable session │
                                                   │    - Redirect to    │
                                                   │      dashboard      │
                                                   │                     │
                                                   │ 7. Return response  │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 8. Redirect to      │                     │
                             │    index.html       │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 9. Land on          │                     │                     │
       │    dashboard         │                     │                     │
       │◀────────────────────│                     │                     │
```

### Dashboard Data Loading Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │ index.html   │     │ api/index.php│     │  Database    │
│              │     │ dashboard.js │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │                     │
       │ 1. Page loads       │                     │                     │
       │    (after login)    │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. Initialize       │                     │
                             │    permissions      │                     │
                             │    (permissions.js) │                     │
                             │                     │                     │
                             │ 3. Check session    │                     │
                             │    (requireSession) │                     │
                             │                     │                     │
                             │ 4. Load dashboard   │                     │
                             │    data (load())    │                     │
                             │                     │                     │
                             │ 5. Parallel API     │                     │
                             │    calls:           │                     │
                             │    - GET /api/v1/   │                     │
                             │      dashboard      │                     │
                             │    - GET /api/v1/   │                     │
                             │      pos            │                     │
                             │    - GET /api/v1/   │                     │
                             │      suppliers      │                     │
                             │    - GET /api/v1/   │                     │
                             │      documents      │                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 6. Execute queries │                     │
                                                   │    in parallel:     │                     │
                                                   │    - Stats calculation│                 │
                                                   │    - PO data        │                     │
                                                   │    - Vendor data    │                     │
                                                   │    - Document data  │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 7. Query databases
                                                                         │    - assets
                                                                         │    - purchase_orders
                                                                         │    - vendors
                                                                         │    - documents
                                                                         │    - warehouse_zones
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 8. Aggregate &     │
                                                   │    format data     │
                                                   │                     │
                                                   │ 9. Return JSON     │
                                                   │    responses       │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 10. Render          │                     │
                             │     dashboard       │                     │
                             │     components:     │                     │
                             │     - Stats cards   │                     │
                             │     - Charts       │                     │
                             │     - Activity feed │                     │
                             │     - Warehouse     │                     │
                             │       grid          │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 11. View dashboard  │                     │                     │
       │     with real-time  │                     │                     │
       │     data            │                     │                     │
       │◀────────────────────│                     │                     │
```

### Purchase Order Lifecycle Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Manager    │     │purchase-     │     │ api/index.php│     │  Database    │
│              │     │orders.html   │     │              │     │              │
└──────────────┘     │purchase-     │     └──────────────┘     └──────────────┘
                     │orders.js     │
                     └──────────────┘
       │                     │                     │                     │
       │ 1. Create PO       │                     │                     │
       │    from requisition │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. Fill PO form     │                     │
                             │    - Vendor         │                     │
                             │    - Items          │                     │
                             │    - Quantities     │                     │
                             │    - Prices         │                     │
                             │                     │                     │
                             │ 3. POST /api/v1/pos │                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 4. Generate PO     │                     │
                                                   │    number           │                     │
                                                   │    (PO-YYYY-XXX)    │                     │
                                                   │                     │
                                                   │ 5. Insert into     │                     │
                                                   │    purchase_orders  │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 6. Insert line items
                                                                         │    into purchase_order_
                                                                         │    items
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 7. Log to po_      │
                                                   │    activity        │
                                                   │    (Created)        │
                                                   │                     │
                                                   │ 8. Return PO data  │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 9. Display PO with  │                     │
                             │    "Draft" status   │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 10. Submit for      │                     │                     │
       │     approval        │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 11. POST /api/v1/   │                     │
                             │     pos/{id}/approve│                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 12. Update status   │                     │
                                                   │     to "Pending     │                     │
                                                   │     Approval"       │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 13. Log to po_
                                                                         │     activity
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 14. Return updated │
                                                   │     PO data         │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 15. Display PO with │                     │
                             │     "Pending        │                     │
                             │     Approval"      │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 16. Approver        │                     │                     │
       │     approves PO     │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 17. POST /api/v1/   │                     │
                             │     pos/{id}/approve│                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 18. Update status   │                     │
                                                   │     to "Sent to     │                     │
                                                   │     Vendor"         │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 19. Log to po_
                                                                         │     activity
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 20. Return updated │
                                                   │     PO data         │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 21. Display PO with │                     │
                             │     "Sent to        │                     │
                             │     Vendor" status  │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 22. Vendor ships     │                     │                     │
       │     order            │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 23. POST /api/v1/   │                     │
                             │     pos/{id}/ship   │                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 24. Update status   │                     │
                                                   │     to "Shipped"     │                     │
                                                   │     + tracking info  │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 25. Log to po_
                                                                         │     activity
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 26. Return updated │
                                                   │     PO data         │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 27. Display PO with │                     │
                             │     "Shipped"       │                     │
                             │     status +        │                     │
                             │     tracking         │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 28. Warehouse       │                     │                     │
       │     receives        │                     │                     │
       │     shipment         │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 29. POST /api/v1/   │                     │
                             │     pos/{id}/receive│                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 30. Update status   │                     │
                                                   │     to "Received"    │                     │
                                                   │                     │
                                                   │ 31. Generate QR     │                     │
                                                   │     codes for items  │                     │
                                                   │                     │
                                                   │ 32. Insert assets   │                     │
                                                   │     into assets table│                    │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 33. Update warehouse
                                                                         │     occupancy
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 34. Update vendor  │
                                                   │     performance     │
                                                   │     metrics         │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 35. Log to po_
                                                                         │     activity
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 36. Return updated │
                                                   │     PO data + QR    │
                                                   │     codes           │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 37. Display PO with │                     │
                             │     "Received"      │                     │
                             │     status + QR     │                     │
                             │     PDF download    │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 38. PO lifecycle    │                     │                     │
       │     complete        │                     │                     │
       │◀────────────────────│                     │                     │
```

### Asset Scanning Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Warehouse    │     │ warehousing  │     │ api/index.php│     │  Database    │
│ Staff        │     │ .html        │     │              │     │              │
│              │     │ warehousing  │     └──────────────┘     └──────────────┘
└──────────────┘     │ .js          │
                     └──────────────┘
       │                     │                     │                     │
       │ 1. Open scanner     │                     │                     │
       │    modal            │                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 2. Request camera    │                     │
                             │    access (WebRTC)   │                     │
                             │                     │                     │
                             │ 3. Show camera       │                     │
                             │    preview           │                     │
                             │                     │                     │
                             │ 4. Select scan mode: │                     │
                             │    - Inventory Intake│                    │
                             │    - Asset Transfer  │                    │
                             │    - Contractor      │                    │
                             │      Check-Out       │                    │
                             │                     │                     │
       │ 5. Scan QR code     │                     │                     │
       │    with camera      │                     │                     │
       │    or enter manually│                     │                     │
       └────────────────────▶│                     │                     │
                             │                     │                     │
                             │ 6. POST /api/v1/    │                     │
                             │     assets/scan      │                     │
                             └────────────────────▶│                     │
                                                   │                     │
                                                   │ 7. Validate QR     │                     │
                                                   │    code against     │                     │
                                                   │    assets table     │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 8. Check if asset
                                                                         │    exists
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 9. If valid:       │                     │
                                                   │    - Record        │                     │
                                                   │      transaction    │                     │
                                                   │    - Update asset   │                     │
                                                   │      status/location│                    │
                                                   │    - Update        │                     │
                                                   │      warehouse      │                     │
                                                   │      occupancy      │                     │
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 10. Insert into
                                                                         │     asset_transactions
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 11. Update
                                                   │     warehouse_zones
                                                   │     and
                                                   │     warehouse_rows
                                                   └────────────────────▶│
                                                                         │
                                                                         │ 12. Return success
                                                                         │     with asset details
                                                                         │◀────────────────────
                                                   │                     │
                                                   │ 13. Return response │
                                                   │◀────────────────────│
                             │                     │                     │
                             │ 14. Show success     │                     │
                             │     confirmation     │                     │
                             │     with asset info   │                     │
                             │◀────────────────────│                     │
       │                     │                     │                     │
       │ 15. Transaction      │                     │                     │
       │     logged,          │                     │                     │
       │     inventory        │                     │                     │
       │     updated           │                     │                     │
       │◀────────────────────│                     │                     │
```

## Role-Based Access Control Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RBAC PERMISSION Flow                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                          │
│  │ User Action  │                                                          │
│  └──────┬───────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────┐                                                          │
│  │ permissions.js│                                                        │
│  │ - Check user  │                                                          │
│  │   role        │                                                          │
│  │ - Show/hide   │                                                          │
│  │   elements    │                                                          │
│  └──────┬───────┘                                                          │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────┐     ┌──────────────────────────────────────────────┐   │
│  │ API Request  │────▶│ Role Check in api/index.php (auth() function) │   │
│  └──────┬───────┘     └──────────────────────────────────────────────┘   │
│         │                         │                                       │
│         │                         ▼                                       │
│         │              ┌──────────────────────┐                          │
│         │              │ Check session        │                          │
│         │              │ - If no session:     │                          │
│         │              │   Return 401         │                          │
│         │              └──────────┬───────────┘                          │
│         │                         │                                       │
│         │                         ▼                                       │
│         │              ┌──────────────────────┐                          │
│         │              │ Check role           │                          │
│         │              │ - If insufficient:   │                          │
│         │              │   Return 403         │                          │
│         │              └──────────┬───────────┘                          │
│         │                         │                                       │
│         │                         ▼                                       │
│         │              ┌──────────────────────┐                          │
│         │              │ Execute request       │                          │
│         │              │ - If authorized:      │                          │
│         │              │   Process request    │                          │
│         │              └──────────┬───────────┘                          │
│         │                         │                                       │
│         │                         ▼                                       │
│         │              ┌──────────────────────┐                          │
│         │              │ Return response      │                          │
│         │              └──────────┬───────────┘                          │
│         │                         │                                       │
│         ▼                         │                                       │
│  ┌──────────────┐                 │                                       │
│  │ UI Update    │◀────────────────│                                       │
│  └──────────────┘                                                         │
│                                                                              │
│  ROLE PERMISSIONS:                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ ADMIN                      │ MANAGER           │ WAREHOUSE STAFF     │  │
│  ├────────────────────────────┼───────────────────┼─────────────────────┤  │
│  │ ✓ Dashboard                │ ✓ Dashboard       │ ✓ Dashboard          │  │
│  │ ✓ Smart Warehousing        │ ✓ Smart           │ ✓ Smart              │  │
│  │ ✓ Inventory Management    │   Warehousing     │   Warehousing        │  │
│  │ ✓ Procurement              │ ✓ Inventory       │ ✓ Inventory (View    │  │
│  │ ✓ Supplier Management      │   (Full)          │   only)              │  │
│  │ ✓ Purchase Orders          │ ✓ Procurement     │ ✗ Procurement       │  │
│  │ ✓ Documents                │ ✓ Supplier        │ ✗ Supplier           │  │
│  │ ✓ User Management          │   Management      │ ✗ Purchase Orders    │  │
│  │ ✓ MFA Setup                │ ✓ Purchase Orders │ ✗ Documents         │  │
│  │ ✓ Login History            │ ✓ Documents       │ ✓ MFA Setup          │  │
│  │                            │ ✓ MFA Setup       │                      │  │
│  └────────────────────────────┴───────────────────┴─────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    AUTHENTICATION SECURITY                            │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  • Password Hashing: bcrypt (PASSWORD_DEFAULT)                        │  │
│  │  • Session Management: HTTP-only, secure, same-site cookies           │  │
│  │  • Session Regeneration: On login                                     │  │
│  │  • Login Attempt Logging: All attempts with IP & timestamp            │  │
│  │  • Account Lockout: Configurable after failed attempts                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    MULTI-FACTOR AUTHENTICATION                        │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  • TOTP Implementation: RFC 6238 compliant                            │  │
│  │  • Authenticator App Support: Google Authenticator, Authy, etc.       │  │
│  │  • Secret Storage: Encrypted in database                               │  │
│  │  • Backup Codes: Recovery mechanism                                    │  │
│  │  • MFA Enforcement: Can be mandatory for specific roles                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    AUTHORIZATION SECURITY                             │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  • Role-Based Access Control: 3-tier permission system                │  │
│  │  • API-Level Authorization: Every endpoint validates permissions       │  │
│  │  • Principle of Least Privilege: Minimum required access               │  │
│  │  • Session Validation: Every request validates active session         │  │
│  │  • CSRF Protection: Considerations for state-changing operations      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    SESSION SECURITY                                   │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  • 30-Minute Timeout: Automatic logout after inactivity               │  │
│  │  • Warning System: 3-minute warning before timeout                    │  │
│  │  • Activity Monitoring: Mouse, keyboard, touch, scroll events        │  │
│  │  • Server-Side Invalidation: Sessions invalidated on logout           │  │
│  │  • Secure Cookie Configuration: HttpOnly, Secure, SameSite            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    DATA SECURITY                                       │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │  • SQL Injection Prevention: Prepared statements for all queries      │  │
│  │  • XSS Protection: Output encoding and input validation              │  │
│  │  • Data Encryption: Sensitive data encrypted at rest (future)         │  │
│  │  • Audit Logging: All sensitive operations logged                    │  │
│  │  • Secure File Upload: File validation and type checking              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TECHNOLOGY STACK                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FRONTEND:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  • HTML5: Semantic markup and structure                                │  │
│  │  • Vanilla JavaScript (ES6+): Client-side logic                        │  │
│  │  • CSS3: Custom styling with Tailwind CSS                              │  │
│  │  • WebRTC: Real-time camera access for QR scanning                     │  │
│  │  • LocalStorage: Session management                                     │  │
│  │  • Google Fonts: Inter & Public Sans                                    │  │
│  │  • Material Symbols: Iconography                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  BACKEND:                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  • PHP 8.2: Server-side logic and API endpoints                         │  │
│  │  • MariaDB: Relational database for data persistence                    │  │
│  │  • PDO: Database abstraction layer                                      │  │
│  │  • REST API: JSON-based API for client-server communication             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  SECURITY:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  • Password Hashing: bcrypt (PASSWORD_DEFAULT)                        │  │
│  │  • Session Management: Secure HTTP-only cookies                        │  │
│  │  • TOTP: Time-based One-Time Password for MFA                          │  │
│  │  • Role-Based Access Control: Admin, Manager, Warehouse Staff          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  DEPLOYMENT:                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  • Docker: Container deployment support                                │  │
│  │  • Apache/Nginx: Web server with mod_rewrite                           │  │
│  │  • SSL/TLS: Required for production deployment                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key System Flows Summary

1. **Authentication Flow**: Login → Password Validation → MFA (if enabled) → Session Creation → Dashboard
2. **Dashboard Flow**: Load Page → Check Session → Parallel API Calls → Aggregate Data → Render Dashboard
3. **Purchase Order Flow**: Create → Submit → Approve → Ship → Receive → Generate QR Codes → Update Inventory
4. **Asset Scanning Flow**: Open Scanner → Camera Access → QR Detection → Validate → Record Transaction → Update Occupancy
5. **Document Flow**: Create → Sign → Verify → Track Compliance → Audit Trail
6. **User Management Flow**: Create/Edit/Delete Users → Role Assignment → Permission Updates → Audit Logging

This system provides a comprehensive supply chain and inventory management solution with strong security, real-time tracking, and complete audit trails for IT recruitment agencies.