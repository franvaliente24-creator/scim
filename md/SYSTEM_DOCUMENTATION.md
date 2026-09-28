# Great Solomon Supply Chain & Inventory Management System (SCIM)
## Complete System Documentation

---

## 1. SYSTEM OVERVIEW

### 1.1 Purpose
The Great Solomon Supply Chain & Inventory Management System (SCIM) is a comprehensive web-based application designed to streamline supply chain operations for IT recruitment agencies. The system provides real-time visibility into inventory, procurement, warehousing, and document tracking with advanced security features and mobile scanning capabilities.

### 1.2 Target Users
- **Recruitment Agency IT Staff**: Manage IT hardware assets for deployments
- **Warehouse Personnel**: Handle inventory intake, transfers, and QR scanning
- **Procurement Managers**: Oversee purchase orders, vendor relationships, and sourcing
- **System Administrators**: Manage users, security settings, and system configuration

### 1.3 Key Benefits
- Real-time inventory tracking and valuation
- Streamlined procurement workflow with approval processes
- Mobile QR code scanning for warehouse operations
- Enhanced security with MFA and activity monitoring
- Comprehensive audit trails and compliance tracking
- Role-based access control for operational efficiency

---

## 2. SYSTEM ARCHITECTURE

### 2.1 Technology Stack

**Frontend:**
- **HTML5**: Semantic markup and structure
- **Vanilla JavaScript (ES6+)**: Client-side logic and API interactions
- **CSS3**: Custom styling with indigo/blue theme
- **WebRTC**: Real-time camera access for QR scanning
- **LocalStorage**: Session management and client-side state

**Backend:**
- **PHP 8.2**: Server-side logic and API endpoints
- **MariaDB**: Relational database for data persistence
- **PDO**: Database abstraction layer
- **REST API**: JSON-based API for client-server communication

**Security:**
- **Password Hashing**: bcrypt (PASSWORD_DEFAULT)
- **Session Management**: Secure HTTP-only cookies
- **TOTP**: Time-based One-Time Password for MFA
- **Role-Based Access Control**: Admin, Manager, Warehouse Staff roles

### 2.2 File Structure
```
scim/
├── api/
│   └── index.php              # REST API endpoints and database logic
├── index.html                 # Main dashboard
├── login.html                 # Login page
├── warehousing.html           # Smart Warehousing module
├── inventory.html             # Inventory Management module
├── procurement.html           # Procurement & Sourcing module
├── suppliers.html             # Supplier Management module
├── purchase-orders.html       # Purchase Order Management module
├── documents.html             # Document Tracking module
├── users.html                 # User Management (Admin only)
├── mfa-setup.html             # MFA configuration page
├── dashboard.js               # Dashboard logic
├── warehousing.js             # Warehousing module logic
├── inventory.js               # Inventory module logic
├── procurement.js             # Procurement module logic
├── suppliers.js               # Supplier module logic
├── purchase-orders.js         # PO module logic
├── documents.js               # Document module logic
├── users.js                   # User management logic
├── mfa-setup.js               # MFA setup logic
├── inactivity.js              # Session timeout handler
├── login.js                   # Login page logic
├── styles.css                 # Global styles
├── admin.css                  # Admin page styles
├── auth.css                   # Authentication styles
├── .htaccess                  # Server configuration
├── config.php                 # Database configuration
├── init.sql                   # Database schema and sample data
└── Dockerfile                 # Container deployment config
```

### 2.3 Database Schema

**Core Tables:**
- `users`: User accounts with roles and MFA settings
- `roles`: System roles (Admin, Manager, Warehouse Staff)
- `login_history`: Authentication audit trail

**Asset & Warehouse Tables:**
- `assets`: IT hardware inventory items
- `warehouse_zones`: Warehouse zone definitions
- `warehouse_rows`: Detailed row-level storage mapping
- `asset_transactions`: Asset movement and scan history

**Procurement Tables:**
- `vendors`: Supplier information and performance metrics
- `purchase_orders`: Purchase order lifecycle management
- `purchase_order_items`: Line items for purchase orders
- `requisitions`: Internal procurement requests
- `supplier_quotes`: Vendor quotations for requisitions

**Document Tables:**
- `documents`: EAF compliance and document tracking
- `document_signatures`: Digital signature records
- `document_activity`: Document change history

**Activity Tracking:**
- `po_activity`: Purchase order audit trail
- `document_activity`: Document audit trail

---

## 3. USER ROLES AND PERMISSIONS

### 3.1 Role Definitions

**Admin:**
- Full system access
- User management (create, edit, delete)
- Login history viewing
- System configuration
- All module access
- MFA management

**Manager:**
- Asset management (CRUD operations)
- Purchase order lifecycle management
- Supplier relationship management
- Document tracking
- Procurement oversight
- No user management access

**Warehouse Staff:**
- Asset lookup and scanning
- Inventory intake operations
- Asset transfers
- QR code scanning
- Limited access to operational functions

### 3.2 Permission Matrix

| Feature | Admin | Manager | Warehouse Staff |
|----------|-------|---------|------------------|
| Dashboard | ✅ | ✅ | ✅ |
| Smart Warehousing | ✅ | ✅ | ✅ |
| Inventory Management | ✅ | ✅ | ✅ (View only) |
| Procurement | ✅ | ✅ | ❌ |
| Supplier Management | ✅ | ✅ | ❌ |
| Purchase Orders | ✅ | ✅ | ❌ |
| Documents | ✅ | ✅ | ❌ |
| User Management | ✅ | ❌ | ❌ |
| MFA Setup | ✅ | ✅ | ✅ |
| Login History | ✅ | ❌ | ❌ |

---

## 4. COMPLETE WORKFLOW DESCRIPTIONS

### 4.1 Authentication Workflow

**Step 1: User Access**
1. User navigates to system URL
2. System redirects to login page (login.html)
3. User enters email and password
4. System validates credentials against database
5. On success: Creates session, redirects to dashboard
6. On failure: Shows error message, logs failed attempt

**Step 2: MFA Verification (if enabled)**
1. After successful password authentication
2. System checks if MFA is enabled for user
3. If enabled: Prompts for TOTP code
4. User enters 6-digit code from authenticator app
5. System validates TOTP code
6. On success: Completes authentication
7. On failure: Requests retry, logs attempt

**Step 3: Session Management**
1. Session stored securely with HTTP-only cookies
2. Session validated on each API request
3. 30-minute inactivity timeout enforced
4. Warning modal at 27 minutes of inactivity
5. Automatic logout after 30 minutes
6. Server-side session invalidation on logout

### 4.2 Dashboard Workflow

**Step 1: System Overview**
1. User logs in and lands on dashboard
2. System loads real-time statistics:
   - Total inventory value
   - Asset deployment mix
   - Active purchase orders
   - Compliance alerts
3. Warehouse occupancy grid displays zone status
4. Recent activity feed shows latest operations

**Step 2: Navigation**
1. User selects module from sidebar
2. System loads corresponding module page
3. Breadcrumb navigation shows current location
4. Responsive sidebar adapts to screen size

**Step 3: Profile Management**
1. User clicks profile avatar
2. Dropdown menu appears with options:
   - My Profile & Preferences
   - Security & MFA Settings
   - Active Sessions
   - User Management (Admin only)
   - Help & Documentation
   - Log Out
3. User selection redirects to appropriate page

### 4.3 Smart Warehousing Workflow

**Step 1: Zone Management**
1. User accesses Smart Warehousing module
2. System displays warehouse zones with occupancy rates
3. Color-coded indicators (Green <60%, Yellow 60-85%, Red >85%)
4. Row-level detail shows specific shelf capacity
5. Critical zones highlighted for attention

**Step 2: QR Scanning Operations**
1. User opens mobile scanner via button
2. System requests camera access
3. Camera preview appears with scanning modes
4. User selects mode (Inventory Intake, Asset Transfer, Contractor Check-Out)
5. User scans QR code or enters manually
6. System validates QR code against asset database
7. On success: Records transaction, updates occupancy
8. System shows confirmation with asset details

**Step 3: Real-time Updates**
1. Scanner activities logged in real-time
2. Dashboard feed updated with latest scans
3. Warehouse occupancy automatically recalculated
4. Zone capacity alerts triggered when thresholds exceeded

### 4.4 Inventory Management Workflow

**Step 1: Asset Registration**
1. User accesses Inventory Management module
2. System displays current asset inventory
3. User clicks "Add Asset" button
4. Modal form appears for asset details:
   - Asset name
   - QR code assignment
   - Category selection (Laptop, Monitor, Peripheral, etc.)
   - Value estimation
   - Status (In Warehouse, Deployed, In Maintenance)
   - Location assignment
5. System validates QR code uniqueness
6. On submission: Asset created, inventory updated

**Step 2: Asset Tracking**
1. System tracks asset lifecycle through status changes
2. Asset movements logged in transaction history
3. Current location and status always visible
4. Search functionality enables quick asset lookup
5. Category-based filtering for organized view

**Step 3: Asset Operations**
1. Users can view detailed asset information
2. Edit capabilities for asset updates
3. Status changes trigger appropriate workflows
4. Location updates affect warehouse occupancy
5. Transaction history provides complete audit trail

### 4.5 Procurement & Sourcing Workflow

**Step 1: Requisition Creation**
1. User identifies need for equipment
2. Accesses Procurement & Sourcing module
3. Creates new requisition with details:
   - Request title
   - Department
   - Item description
   - Estimated cost
   - Priority level (Low, Medium, High, Urgent)
   - Needed by date
4. System assigns unique requisition number
5. Requisition submitted for approval

**Step 2: Approval Process**
1. Requisition enters "Pending Approval" status
2. Authorized reviewers can approve or reject
3. If approved: Requisition moves to sourcing phase
4. If rejected: Reason captured, status updated
5. Activity logged for audit trail

**Step 3: Supplier Quotations**
1. System requests quotes from selected suppliers
2. Suppliers submit quotations with pricing
3. Quotations compared side-by-side
4. Best option selected based on price, delivery, quality
5. Requisition updated with actual cost

**Step 4: Purchase Order Generation**
1. Approved requisition converted to purchase order
2. PO number automatically generated
3. Vendor selected from approved suppliers
4. Line items detailed with quantities and pricing
5. PO sent to vendor for fulfillment

### 4.6 Supplier Management Workflow

**Step 1: Supplier Onboarding**
1. New supplier information entered into system
2. Details include:
   - Company name and contact information
   - Category specialization
   - Initial performance metrics
3. Supplier profile created in database
4. Initial rating assigned based on credentials

**Step 2: Performance Tracking**
1. System continuously tracks supplier performance:
   - On-time delivery rate
   - Device defect rate
   - Overall rating (1-5 scale)
2. Metrics updated automatically from PO fulfillment
3. Performance scorecards displayed visually
4. Color-coded indicators highlight performance issues

**Step 3: Supplier Evaluation**
1. Top performers identified for preferred status
2. Underperforming suppliers flagged for review
3. Performance trends analyzed over time
4. Supplier relationships managed based on metrics

### 4.7 Purchase Order Lifecycle Workflow

**Step 1: PO Creation**
1. Purchase order created from approved requisition
2. PO number automatically generated (PO-YYYY-XXX)
3. Vendor selected and details populated
4. Line items with quantities and unit prices
5. Expected delivery date set
6. PO status set to "Draft"

**Step 2: Submission for Approval**
1. PO submitted for managerial approval
2. Status changes to "Pending Approval"
3. Approvers receive notification
4. Approval or rejection workflow initiated

**Step 3: Approval Process**
1. Authorized manager reviews PO details
2. Can approve: Status changes to "Sent to Vendor"
3. Can reject: Status changes to "Cancelled" with reason
4. Activity logged with decision details
5. Stakeholders notified of outcome

**Step 4: Vendor Fulfillment**
1. Vendor receives PO and processes order
2. Manager marks PO as "Shipped" with:
   - Tracking number
   - Carrier information
   - Updated delivery estimate
3. Status change logged with tracking details
4. Dashboard shows in-transit items

**Step 5: Receipt and Processing**
1. Warehouse receives shipment
2. Manager marks PO as "Received" with:
   - Items received confirmation
   - Condition assessment
   - Delivery notes
3. System automatically generates QR codes for all items
4. QR PDF created for asset tracking
5. Assets added to inventory
6. Warehouse occupancy updated

**Step 6: Completion**
1. PO lifecycle completes
2. Final status set to "Received"
3. Vendor performance metrics updated
4. Financial records updated
5. Complete audit trail maintained

### 4.8 Document Tracking Workflow

**Step 1: Document Creation**
1. User creates new document in system
2. Document types include:
   - Equipment Accountability Form (EAF)
   - Vendor Invoice
   - Courier Receipt
   - Contract
   - Other custom documents
3. Reference number automatically generated
4. Owner and due date assigned
5. Document linked to related PO if applicable

**Step 2: EAF Compliance**
1. EAF created for asset deployments
2. Document tracks equipment accountability
3. Digital signature workflow initiated
4. Multiple signatures may be required
5. Each signature logged with timestamp and signer identity

**Step 3: Signature Process**
1. Authorized signers review document
2. Digital signature captured (name + hash)
3. Document status changes to "Signed"
4. Signature recorded in document_signatures table
5. Activity logged for compliance audit

**Step 4: Status Management**
1. Documents move through statuses:
   - Pending Verification
   - Signed
   - Verified
   - Rejected
   - Expired
2. Status changes logged with reasons
3. Compliance alerts triggered for overdue documents
4. Automated reminders for pending actions

**Step 5: Compliance Tracking**
1. System calculates EAF compliance rate
2. Dashboard shows compliance percentage
3. Documents needing attention highlighted
4. Audit trail provides complete document history
5. Reporting available for compliance reviews

### 4.9 User Management Workflow (Admin Only)

**Step 1: User Creation**
1. Admin accesses User Management page
2. Creates new user account with:
   - Full name
   - Work email
   - Temporary password
   - Role assignment
3. System validates email uniqueness
4. Password hashed securely before storage
5. User created with appropriate permissions

**Step 2: User Modification**
1. Admin can edit existing user accounts
2. Updates can include:
   - Name changes
   - Email updates
   - Role reassignment
   - Password changes
   - Active/inactive status
3. Changes logged in audit trail
4. User sessions affected immediately

**Step 3: User Deletion**
1. Admin can delete user accounts
2. Confirmation required to prevent accidental deletion
3. User data removed from system
4. Associated activities preserved in audit logs
5. Cannot delete own account while logged in

**Step 4: Login History Monitoring**
1. System tracks all login attempts
2. Shows success/failure status
3. IP address and timestamp recorded
4. Failed login attempts monitored for security
5. Pattern analysis can identify potential threats

### 4.10 MFA Setup Workflow

**Step 1: MFA Initialization**
1. User accesses Security & MFA Settings
2. System displays current MFA status
3. User clicks "Generate MFA Secret"
4. System generates secure TOTP secret
5. QR code URI created for authenticator app

**Step 2: Authenticator App Setup**
1. User scans QR code with authenticator app
2. Or manually enters secret into app
3. Authenticator app generates 6-digit codes
4. Codes change every 30 seconds
5. TOTP algorithm ensures time-based synchronization

**Step 3: Verification**
1. User enters current 6-digit code
2. System verifies code against secret
3. On successful verification: MFA enabled
4. Failed attempts logged for security
5. Multiple failed attempts trigger security review

**Step 4: MFA Usage**
1. Subsequent logins require MFA code
2. User enters code from authenticator app
3. System validates code before granting access
4. Failed MFA attempts lock account temporarily
5. Recovery process available for lost authenticator

**Step 5: MFA Management**
1. Users can disable MFA (with password confirmation)
2. System warns about security implications
3. MFA removal requires re-authentication
4. Audit trail records MFA changes
5. Admin can force MFA for specific roles

---

## 5. SECURITY FEATURES

### 5.1 Authentication Security
- **Password Hashing**: bcrypt algorithm with automatic salt generation
- **Session Management**: HTTP-only, secure, same-site cookies
- **Session Regeneration**: Session ID regeneration on login
- **Login Attempt Logging**: All attempts recorded with IP and timestamp
- **Account Lockout**: Configurable lockout after failed attempts

### 5.2 Multi-Factor Authentication
- **TOTP Implementation**: Time-based One-Time Password (RFC 6238)
- **Authenticator App Support**: Compatible with Google Authenticator, Authy, etc.
- **Secret Storage**: Encrypted storage of TOTP secrets
- **Backup Codes**: System can generate recovery codes
- **MFA Enforcement**: Can be mandatory for specific roles

### 5.3 Authorization Security
- **Role-Based Access Control**: Three-tier permission system
- **API-Level Authorization**: Every endpoint validates permissions
- **Principle of Least Privilege**: Users get minimum required access
- **Session Validation**: Every request validates active session
- **Cross-Site Request Protection**: CSRF considerations for state-changing operations

### 5.4 Session Security
- **30-Minute Timeout**: Automatic logout after inactivity
- **Warning System**: 3-minute warning before timeout
- **Activity Monitoring**: Mouse, keyboard, touch, scroll events tracked
- **Server-Side Invalidation**: Sessions invalidated server-side on logout
- **Secure Cookie Configuration**: HttpOnly, Secure, SameSite attributes

### 5.5 Data Security
- **SQL Injection Prevention**: Prepared statements for all database queries
- **XSS Protection**: Output encoding and input validation
- **Data Encryption**: Sensitive data encrypted at rest (future enhancement)
- **Audit Logging**: All sensitive operations logged
- **Secure File Upload**: File upload validation and type checking

---

## 6. DATA FLOW DIAGRAMS

### 6.1 Authentication Data Flow
```
User → Login Page → API (/auth/login) → Database Validation → Session Creation → Dashboard
                                  ↓ (Failure)
                            Login History → Error Response
```

### 6.2 MFA Data Flow
```
User → MFA Setup → API (/mfa/setup) → Secret Generation → QR Code Display
                     ↓
              Authenticator App Scan → Code Generation
                     ↓
User → Code Entry → API (/mfa/verify) → TOTP Validation → MFA Enable
```

### 6.3 Asset Scanning Data Flow
```
Warehouse Staff → Scanner Modal → Camera Access → QR Detection
                                          ↓
                                    Manual Entry
                                          ↓
                        API (/assets/scan) → Asset Validation → Transaction Recording
                                          ↓
                                    Database Update → Occupancy Recalculation
```

### 6.4 Purchase Order Data Flow
```
Manager → PO Creation → API (/pos) → PO Number Generation → Database Storage
                                   ↓
                          Approval Workflow → Status Updates → Activity Logging
                                   ↓
                          Vendor Fulfillment → Shipment Marking → Tracking Update
                                   ↓
                          Receipt Processing → QR Generation → Inventory Update
```

### 6.5 Document Tracking Data Flow
```
User → Document Creation → API (/documents) → Reference Generation → Database Storage
                                 ↓
                          Signature Workflow → Digital Capture → Status Update
                                 ↓
                          Compliance Check → Status Validation → Alert Generation
```

---

## 7. INTEGRATION POINTS

### 7.1 External System Integrations
- **Email Service**: For purchase order notifications (future)
- **SMS Service**: For critical alerts and MFA recovery (future)
- **Payment Gateway**: For supplier payments (future)
- **ERP Systems**: For financial integration (future)

### 7.2 Third-Party Libraries
- **QR Code Libraries**: jsQR or html5-qrcode for scanning (future integration)
- **TOTP Libraries**: Spomky-Labs/otphp for proper TOTP validation (future)
- **PDF Generation**: For QR code PDF creation (future)
- **Chart Libraries**: For enhanced analytics (future)

### 7.3 API Integration Points
- **REST API**: All client-server communication via REST
- **JSON Format**: Standardized data exchange format
- **CORS Configuration**: Cross-origin resource sharing setup
- **API Versioning**: /api/v1/ prefix for version management

---

## 8. DEPLOYMENT CONSIDERATIONS

### 8.1 Environment Requirements
- **PHP Version**: 8.2 or higher
- **MariaDB Version**: 10.6 or higher
- **Web Server**: Apache with mod_rewrite or Nginx
- **SSL/TLS**: Required for production deployment
- **PHP Extensions**: PDO, JSON, Session, OpenSSL

### 8.2 Configuration Requirements
- **Database Credentials**: Set via environment variables
- **Session Configuration**: Secure cookie parameters
- **File Permissions**: Proper file system permissions
- **Error Reporting**: Production error handling configuration

### 8.3 Performance Considerations
- **Database Indexing**: Proper indexes on frequently queried columns
- **Caching Strategy**: Implement caching for frequently accessed data
- **Image Optimization**: Compress and optimize asset images
- **CDN Integration**: Static asset delivery via CDN (future)
- **Load Balancing**: Horizontal scaling for high availability (future)

### 8.4 Backup Strategy
- **Database Backups**: Regular automated backups
- **File System Backups**: Configuration and uploaded files
- **Disaster Recovery**: Restore procedures documented
- **Backup Encryption**: Encrypted backup storage

---

## 9. MAINTENANCE AND SUPPORT

### 9.1 Routine Maintenance
- **Database Optimization**: Regular table optimization and index rebuilding
- **Log Rotation**: Automated log file rotation and archival
- **Security Updates**: Regular PHP and dependency updates
- **Performance Monitoring**: System performance metric tracking

### 9.2 Monitoring and Alerting
- **System Health Monitoring**: Server resource utilization
- **Application Performance**: Response time and error rate tracking
- **Security Alerts**: Failed login attempts, suspicious activities
- **Business Metrics**: Key performance indicators dashboard

### 9.3 User Support
- **Training Documentation**: User guides and tutorials
- **Help Desk Integration**: Support ticket system (future)
- **FAQ System**: Common questions and answers
- **Video Tutorials**: Step-by-step video guides (future)

---

## 10. FUTURE ENHANCEMENTS

### 10.1 Planned Features
- **WebSocket Real-Time Sync**: Live updates between mobile scanners and dashboard
- **Advanced Analytics**: Business intelligence and reporting dashboards
- **Mobile App**: Native mobile application for warehouse operations
- **Barcode Printer Integration**: Direct barcode label printing
- **API Rate Limiting**: Enhanced API security and management
- **Multi-Language Support**: Internationalization capabilities

### 10.2 Scalability Improvements
- **Microservices Architecture**: Split services into independent containers
- **Database Sharding**: Horizontal database scaling
- **Message Queue Integration**: Asynchronous task processing
- **Caching Layer**: Redis or Memcached integration
- **Load Balancing**: Multiple server deployment

---

## 11. COMPLIANCE AND AUDIT

### 11.1 Regulatory Compliance
- **Data Protection**: GDPR-like data handling practices
- **Audit Trail**: Complete operation logging for compliance
- **Access Control**: Proper authentication and authorization
- **Data Retention**: Configurable data retention policies

### 11.2 Audit Capabilities
- **User Activity Logs**: All user actions recorded
- **System Event Logs**: System-level events and errors
- **Change History**: Complete change tracking for critical data
- **Security Logs**: Authentication and authorization events
- **Compliance Reports**: Generated reports for regulatory requirements

---

## 12. TROUBLESHOOTING GUIDE

### 12.1 Common Issues

**Login Problems:**
- **Issue**: Unable to login
- **Solution**: Check email/password, verify account is active, check browser cookies

**Camera Access Issues:**
- **Issue**: Camera not working in scanner
- **Solution**: Check browser permissions, ensure HTTPS, try different browser

**MFA Problems:**
- **Issue**: Cannot enable MFA
- **Solution**: Verify authenticator app time sync, check secret generation, contact admin

**Performance Issues:**
- **Issue**: Slow page loading
- **Solution**: Check database performance, clear browser cache, check network connectivity

### 12.2 Support Procedures
1. Check system status page
2. Review error logs
3. Verify database connectivity
4. Check API endpoint status
5. Validate user permissions
6. Contact system administrator if unresolved

---

## 13. GLOSSARY

- **SCIM**: Supply Chain & Inventory Management
- **EAF**: Equipment Accountability Form
- **PO**: Purchase Order
- **QR Code**: Quick Response code for asset identification
- **TOTP**: Time-based One-Time Password
- **MFA**: Multi-Factor Authentication
- **RBAC**: Role-Based Access Control
- **API**: Application Programming Interface
- **REST**: Representational State Transfer
- **TOTP**: Time-based One-Time Password
- **WebRTC**: Web Real-Time Communication

---

## 14. CONTACT AND SUPPORT

**System Administrator**: [Admin Contact]
**Technical Support**: [Support Contact]
**Documentation Updates**: [Documentation Contact]
**Emergency Support**: [Emergency Contact]

---

*This documentation is maintained by the Great Solomon IT Department and reflects the current system state as of the last update. For the most current information, please refer to the system's built-in help documentation or contact the system administrator.*