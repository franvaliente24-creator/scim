# SCIM Integration Guide
## Great Solomon Supply Chain & Inventory Management System

---

## 1. Overview

SCIM (Supply Chain & Inventory Management) is a specialized subsystem designed to handle supply chain operations within the larger enterprise architecture. This guide provides comprehensive information for external systems to integrate with SCIM.

### 1.1 System Role in Enterprise Architecture

SCIM serves as the **Supply Chain & Inventory Management** component in the broader Business Process Architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                   Enterprise Architecture                     │
├─────────────────────────────────────────────────────────────┤
│  HR Systems        │  SCIM (This System)   │  Financial     │
│  (Recruitment,    │  - Supply Chain       │  Systems       │
│   Employee Info,  │  - Inventory Mgmt     │  - Budget      │
│   Training, Exit) │  - Procurement        │  - Disbursement │
│                   │  - Warehousing        │                │
│                   │  - Document Tracking  │                │
├─────────────────────────────────────────────────────────────┤
│  CRM Systems      │  BI & Analytics       │  Compliance     │
│  (Leads, Clients) │  - Data Aggregation   │  - Legal        │
│                   │  - Reporting          │  - Audit        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Integration Scope

SCIM provides integration capabilities for:

- **HR Systems**: Employee-to-asset assignment, equipment requests, separation workflows
- **Financial Systems**: Budget validation, payment processing, cost tracking
- **CRM Systems**: Client-specific procurement, deployment tracking
- **BI Systems**: Data export, analytics feeds, scheduled reports
- **Compliance Systems**: Audit trails, compliance reports, document tracking

### 1.3 Integration Methods

SCIM supports multiple integration patterns:

1. **REST API**: Synchronous request/response for real-time operations
2. **Webhooks**: Event-driven notifications for system state changes
3. **Batch Processing**: Scheduled data synchronization
4. **Equipment Requests**: Cross-system workflow for equipment allocation

---

## 2. Authentication & Security

### 2.1 API Authentication

SCIM uses API key-based authentication for external system integration.

#### Obtaining API Credentials

Contact the SCIM system administrator to obtain:
- **API Key**: Unique identifier for your system
- **API Secret**: Shared secret for request signing
- **System ID**: System identifier for tracking

#### Authentication Headers

All API requests must include authentication headers:

```http
POST /api/v1/integration/equipment-requests
Content-Type: application/json
X-API-Key: your_api_key_here
X-API-Signature: calculated_signature_here
X-System-ID: your_system_id
X-Timestamp: current_unix_timestamp
```

#### Signature Calculation

```javascript
const crypto = require('crypto');

function calculateSignature(method, path, body, apiSecret, timestamp) {
    const payload = method + path + JSON.stringify(body) + timestamp;
    return crypto.createHmac('sha256', apiSecret)
                  .update(payload)
                  .digest('hex');
}

// Note: The timestamp should be sent as X-Timestamp header

// Example
const timestamp = Date.now();
const signature = calculateSignature(
    'POST',
    '/api/v1/integration/equipment-requests',
    requestBody,
    apiSecret,
    timestamp
);
```

### 2.2 Rate Limiting

- **Standard Rate**: 100 requests per minute per system
- **Burst Rate**: 200 requests per minute with short-term allowance
- **Rate Limit Headers**: 
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

### 2.3 IP Whitelisting

Production integrations require IP whitelisting. Provide your system's public IP addresses to the SCIM administrator.

---

## 3. REST API Endpoints

### 3.1 Base URL

```
Production: https://scim.greatsolomon.com/api/v1
Development: https://scim-dev.greatsolomon.com/api/v1
```

### 3.2 Equipment Requests

#### Create Equipment Request

```http
POST /api/v1/integration/equipment-requests
```

**Request Body:**
```json
{
    "external_request_id": "HR-REQ-2026-001",
    "employee_name": "John Doe",
    "employee_id": "EMP-001",
    "department": "IT",
    "equipment_needed": [
        {
            "category": "Laptop",
            "specifications": "MacBook Pro 14, 16GB RAM, 512GB SSD",
            "quantity": 1,
            "priority": "High"
        }
    ],
    "needed_by": "2026-10-15",
    "business_justification": "New hire equipment setup",
    "cost_center": "CC-IT-001"
}
```

**Response:**
```json
{
    "success": true,
    "request_number": "SCIM-REQ-2026-001",
    "status": "Pending",
    "estimated_cost": 124500.00,
    "created_at": "2026-09-26T10:30:00Z"
}
```

#### Get Equipment Request Status

```http
GET /api/v1/integration/equipment-requests/{request_number}
```

**Response:**
```json
{
    "request_number": "SCIM-REQ-2026-001",
    "external_request_id": "HR-REQ-2026-001",
    "status": "Approved",
    "assigned_assets": [
        {
            "qr_code": "QR-LAP-050",
            "name": "MacBook Pro 14",
            "assigned_date": "2026-10-01"
        }
    ],
    "total_cost": 124500.00
}
```

### 3.3 Asset Information

#### Get Asset by QR Code

```http
GET /api/v1/integration/assets/{qr_code}
```

**Response:**
```json
{
    "qr_code": "QR-LAP-001",
    "name": "MacBook Pro 14",
    "category": "Laptop",
    "value": 124500.00,
    "status": "Deployed",
    "location": "Manila HQ",
    "assigned_to": {
        "system": "HR",
        "employee_id": "EMP-001",
        "employee_name": "John Doe"
    }
}
```

#### Assign Asset to Employee

```http
POST /api/v1/integration/assets/{qr_code}/assign
```

**Request Body:**
```json
{
    "external_system": "HR",
    "employee_id": "EMP-001",
    "employee_name": "John Doe",
    "department": "IT",
    "assignment_date": "2026-10-01",
    "notes": "New hire assignment"
}
```

### 3.4 Purchase Order Integration

#### Get Purchase Order Details

```http
GET /api/v1/integration/purchase-orders/{po_number}
```

**Response:**
```json
{
    "po_number": "PO-2026-041",
    "vendor": "TechSource Asia",
    "status": "Sent to Vendor",
    "total": 284500.00,
    "expected_delivery": "2026-10-15",
    "items": [
        {
            "item_name": "MacBook Pro 14",
            "quantity": 15,
            "unit_price": 16500.00
        }
    ],
    "budget_code": "BG-IT-2026-Q4"
}
```

#### Update PO Budget Status

```http
PUT /api/v1/integration/purchase-orders/{po_number}/budget-status
```

**Request Body:**
```json
{
    "budget_status": "Approved",
    "approved_by": "FIN-001",
    "approval_date": "2026-09-26",
    "notes": "Budget approved within Q4 allocation"
}
```

### 3.5 Data Export

#### Export Inventory Data

```http
GET /api/v1/integration/export/inventory
```

**Query Parameters:**
- `format`: `json` or `csv` (default: json)
- `since`: ISO date string for incremental updates
- `category`: Filter by asset category

**Response (JSON):**
```json
{
    "export_date": "2026-09-26T10:00:00Z",
    "total_assets": 150,
    "assets": [
        {
            "qr_code": "QR-LAP-001",
            "name": "MacBook Pro 14",
            "category": "Laptop",
            "value": 124500.00,
            "status": "Deployed"
        }
    ]
}
```

#### Export Audit Trail

```http
GET /api/v1/integration/export/audit-trail
```

**Query Parameters:**
- `from_date`: Start date (ISO format)
- `to_date`: End date (ISO format)
- `entity_type`: Filter by entity type (asset, po, document)

---

## 4. Webhook System

### 4.1 Webhook Events

SCIM sends webhook notifications for the following events:

#### Asset Events
- `asset.created`: New asset registered
- `asset.assigned`: Asset assigned to employee
- `asset.returned`: Asset returned to inventory
- `asset.status_changed`: Asset status updated

#### Purchase Order Events
- `po.created`: New purchase order created
- `po.approved`: PO approved
- `po.sent_to_vendor`: PO sent to vendor
- `po.received`: Items received
- `po.completed`: PO lifecycle complete

#### Equipment Request Events
- `equipment_request.created`: New equipment request
- `equipment_request.approved`: Request approved
- `equipment_request.fulfilled`: Equipment assigned
- `equipment_request.rejected`: Request rejected

#### Document Events
- `document.created`: New document created
- `document.signed`: Document signed
- `document.status_changed`: Document status updated

### 4.2 Webhook Configuration

#### Register Webhook

```http
POST /api/v1/integration/webhooks
```

**Request Body:**
```json
{
    "event_types": [
        "asset.assigned",
        "equipment_request.fulfilled"
    ],
    "target_url": "https://your-system.com/scim-webhook",
    "secret": "your_webhook_secret"
}
```

**Response:**
```json
{
    "webhook_id": "WH-001",
    "status": "active",
    "event_types": ["asset.assigned", "equipment_request.fulfilled"]
}
```

#### Webhook Payload Structure

All webhook payloads follow this structure:

```json
{
    "event_id": "EV-2026-001",
    "event_type": "asset.assigned",
    "timestamp": "2026-09-26T10:30:00Z",
    "data": {
        "qr_code": "QR-LAP-001",
        "asset_name": "MacBook Pro 14",
        "assigned_to": {
            "employee_id": "EMP-001",
            "employee_name": "John Doe"
        }
    },
    "signature": "calculated_hmac_signature"
}
```

#### Webhook Signature Verification

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, webhookSecret) {
    const expectedSignature = crypto.createHmac('sha256', webhookSecret)
                                      .update(JSON.stringify(payload))
                                      .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}
```

### 4.3 Webhook Response Handling

Your webhook endpoint should:

1. **Respond quickly**: Return 200 OK within 5 seconds
2. **Handle retries**: SCIM retries failed webhooks (exponential backoff)
3. **Validate signatures**: Verify webhook authenticity
4. **Process asynchronously**: Process events in background

**Success Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
    "received": true
}
```

**Error Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
    "error": "Invalid signature"
}
```

---

## 5. Equipment Request Workflow

### 5.1 Workflow Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ External    │    │ SCIM        │    │ SCIM        │    │ External    │
│ System      │───▶│ API         │───▶│ Processing  │───▶│ System      │
│ (HR/CRM)    │    │             │    │             │    │ (Webhook)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                  │                  │                  │
      │ 1. Request       │ 2. Validate      │ 3. Process       │ 4. Notify
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
 Equipment          Budget Check       Asset Allocation    Assignment
 Request            Inventory Check    PO Creation          Details
```

### 5.2 Step-by-Step Integration

#### Step 1: Submit Equipment Request

External system submits equipment request to SCIM:

```javascript
const equipmentRequest = {
    external_request_id: "HR-REQ-2026-001",
    employee_name: "John Doe",
    employee_id: "EMP-001",
    department: "IT",
    equipment_needed: [{
        category: "Laptop",
        specifications: "MacBook Pro 14, 16GB RAM, 512GB SSD",
        quantity: 1,
        priority: "High"
    }],
    needed_by: "2026-10-15",
    business_justification: "New hire equipment setup",
    cost_center: "CC-IT-001"
};

const response = await fetch('https://scim.greatsolomon.com/api/v1/integration/equipment-requests', {
    method: 'POST',
    const timestamp = Date.now();
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-API-Signature': calculateSignature('POST', '/api/v1/integration/equipment-requests', equipmentRequest, apiSecret, timestamp),
        'X-System-ID': 'HR',
        'X-Timestamp': timestamp.toString()
    };
    body: JSON.stringify(equipmentRequest)
});
```

#### Step 2: Track Request Status

External system polls for status updates:

```javascript
const timestamp = Date.now();
const statusResponse = await fetch(`https://scim.greatsolomon.com/api/v1/integration/equipment-requests/SCIM-REQ-2026-001`, {
    method: 'GET',
    headers: {
        'X-API-Key': apiKey,
        'X-API-Signature': calculateSignature('GET', '/api/v1/integration/equipment-requests/SCIM-REQ-2026-001', {}, apiSecret, timestamp),
        'X-System-ID': 'HR',
        'X-Timestamp': timestamp.toString()
    }
});

const status = await statusResponse.json();
// status: "Pending" | "Approved" | "Rejected" | "Fulfilled"
```

#### Step 3: Receive Webhook Notification

Alternatively, set up webhook to receive status changes:

```javascript
// Your webhook endpoint
app.post('/scim-webhook', (req, res) => {
    const payload = req.body;
    const signature = req.headers['x-webhook-signature'];
    
    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
        return res.status(400).json({ error: 'Invalid signature' });
    }
    
    if (payload.event_type === 'equipment_request.fulfilled') {
        const { request_number, assigned_assets } = payload.data;
        // Update your system with assignment details
        updateEmployeeEquipment(payload.data.employee_id, assigned_assets);
    }
    
    res.json({ received: true });
});
```

### 5.3 Request States

| State | Description | External Action Required |
|-------|-------------|------------------------|
| `Pending` | Request received, awaiting processing | None |
| `Validating` | Budget and inventory validation | None |
| `Approved` | Request approved, awaiting fulfillment | None |
| `Rejected` | Request rejected | Review rejection reason |
| `Fulfilling` | Asset allocation in progress | None |
| `Fulfilled` | Equipment assigned to employee | Update employee records |
| `Cancelled` | Request cancelled | Review cancellation reason |

---

## 6. Data Synchronization

### 6.1 Batch Synchronization

For bulk data updates, use batch synchronization endpoints.

#### Batch Asset Sync

```http
POST /api/v1/integration/sync/assets
```

**Request Body:**
```json
{
    "sync_type": "full",
    "assets": [
        {
            "qr_code": "QR-LAP-001",
            "external_system": "HR",
            "external_employee_id": "EMP-001",
            "status": "Deployed"
        }
    ]
}
```

#### Batch Employee Sync

```http
POST /api/v1/integration/sync/employees
```

**Request Body:**
```json
{
    "employees": [
        {
            "employee_id": "EMP-001",
            "employee_name": "John Doe",
            "department": "IT",
            "status": "Active"
        }
    ]
}
```

### 6.2 Scheduled Data Exports

Configure scheduled exports for regular data synchronization.

#### Configure Scheduled Export

```http
POST /api/v1/integration/scheduled-exports
```

**Request Body:**
```json
{
    "export_type": "inventory",
    "frequency": "daily",
    "time": "02:00",
    "format": "json",
    "delivery_method": "webhook",
    "target_url": "https://your-system.com/scheduled-export"
}
```

### 6.3 Incremental Updates

Use the `since` parameter for incremental updates:

```http
GET /api/v1/integration/export/inventory?since=2026-09-25T00:00:00Z
```

This returns only assets modified since the specified timestamp.

---

## 7. Error Handling

### 7.1 HTTP Status Codes

| Code | Description | Action |
|------|-------------|--------|
| 200 | Success | Process response |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Fix request format |
| 401 | Unauthorized | Check authentication |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify resource exists |
| 409 | Conflict | Resolve data conflict |
| 422 | Validation Error | Fix validation issues |
| 429 | Rate Limited | Implement backoff |
| 500 | Server Error | Retry with exponential backoff |

### 7.2 Error Response Format

All error responses follow this format:

```json
{
    "error": "Error type",
    "message": "Human-readable error message",
    "details": {
        "field": "Specific field error",
        "code": "ERROR_CODE"
    },
    "request_id": "REQ-2026-001"
}
```

### 7.3 Common Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `AUTH_INVALID` | Invalid authentication | Check API credentials |
| `AUTH_EXPIRED` | Authentication expired | Refresh credentials |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | Implement backoff |
| `VALIDATION_FAILED` | Request validation failed | Fix request format |
| `RESOURCE_NOT_FOUND` | Resource not found | Verify resource ID |
| `CONFLICT_DUPLICATE` | Duplicate resource | Use different identifier |
| `INTEGRATION_DISABLED` | Integration disabled | Contact administrator |

### 7.4 Retry Strategy

Implement exponential backoff for retries:

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            
            if (response.status >= 500 && i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}
```

---

## 8. Best Practices

### 8.1 Security

- **Never expose API secrets** in client-side code
- **Use HTTPS** for all API communications
- **Validate webhook signatures** before processing
- **Implement IP whitelisting** where possible
- **Rotate API keys** regularly (recommended: quarterly)
- **Monitor API usage** for unusual patterns

### 8.2 Performance

- **Cache frequently accessed data** (asset details, employee info)
- **Use batch operations** for bulk updates
- **Implement webhooks** instead of polling for real-time updates
- **Compress large payloads** using gzip
- **Paginate large responses** using provided pagination parameters

### 8.3 Data Consistency

- **Use idempotent operations** where possible
- **Implement optimistic concurrency** for updates
- **Handle conflicts gracefully** with proper error handling
- **Maintain audit trails** for all cross-system operations
- **Reconcile data periodically** to ensure consistency

### 8.4 Monitoring & Logging

- **Log all API requests** with timestamps and request IDs
- **Monitor webhook delivery** and retry failures
- **Track integration metrics** (success rates, response times)
- **Set up alerts** for critical failures
- **Regular audit logs** for compliance requirements

### 8.5 Testing

- **Use sandbox environment** for development and testing
- **Test error scenarios** (rate limits, invalid data, network failures)
- **Validate webhook payloads** in test environment first
- **Monitor integration health** before production deployment
- **Have rollback procedures** ready for critical integrations

---

## 9. Example Implementations

### 9.1 Node.js Integration Example

```javascript
const crypto = require('crypto');
const fetch = require('node-fetch');

class SCIMIntegration {
    constructor(apiKey, apiSecret, systemId, baseUrl = 'https://scim.greatsolomon.com/api/v1') {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.systemId = systemId;
        this.baseUrl = baseUrl;
    }

    calculateSignature(method, path, body) {
        const timestamp = Date.now();
        const payload = method + path + JSON.stringify(body) + timestamp;
        const signature = crypto.createHmac('sha256', this.apiSecret)
                              .update(payload)
                              .digest('hex');
        return { signature, timestamp };
    }

    getHeaders(method, path, body = {}) {
        const { signature, timestamp } = this.calculateSignature(method, path, body);
        return {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-API-Signature': signature,
            'X-System-ID': this.systemId,
            'X-Timestamp': timestamp.toString()
        };
    }

    async createEquipmentRequest(requestData) {
        const path = '/integration/equipment-requests';
        const headers = this.getHeaders('POST', path, requestData);
        
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`SCIM API error: ${response.status}`);
        }

        return response.json();
    }

    async getAssetByQRCode(qrCode) {
        const path = `/integration/assets/${qrCode}`;
        const headers = this.getHeaders('GET', path);
        
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            throw new Error(`SCIM API error: ${response.status}`);
        }

        return response.json();
    }

    async assignAsset(qrCode, assignmentData) {
        const path = `/integration/assets/${qrCode}/assign`;
        const headers = this.getHeaders('POST', path, assignmentData);
        
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(assignmentData)
        });

        if (!response.ok) {
            throw new Error(`SCIM API error: ${response.status}`);
        }

        return response.json();
    }
}

// Usage Example
const scim = new SCIMIntegration(
    'your_api_key',
    'your_api_secret',
    'HR'
);

// Create equipment request
const request = await scim.createEquipmentRequest({
    external_request_id: 'HR-REQ-2026-001',
    employee_name: 'John Doe',
    employee_id: 'EMP-001',
    department: 'IT',
    equipment_needed: [{
        category: 'Laptop',
        specifications: 'MacBook Pro 14',
        quantity: 1,
        priority: 'High'
    }],
    needed_by: '2026-10-15',
    business_justification: 'New hire equipment'
});

console.log('Request created:', request.request_number);
```

### 9.2 Python Integration Example

```python
import hmac
import hashlib
import json
import requests
from datetime import datetime

class SCIMIntegration:
    def __init__(self, api_key, api_secret, system_id, base_url='https://scim.greatsolomon.com/api/v1'):
        self.api_key = api_key
        self.api_secret = api_secret
        self.system_id = system_id
        self.base_url = base_url

    def calculate_signature(self, method, path, body):
        timestamp = str(int(datetime.now().timestamp()))
        payload = method + path + json.dumps(body) + timestamp
        signature = hmac.new(
            self.api_secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature, timestamp

    def get_headers(self, method, path, body=None):
        body = body or {}
        signature, timestamp = self.calculate_signature(method, path, body)
        return {
            'Content-Type': 'application/json',
            'X-API-Key': self.api_key,
            'X-API-Signature': signature,
            'X-System-ID': self.system_id,
            'X-Timestamp': timestamp
        }

    def create_equipment_request(self, request_data):
        path = '/integration/equipment-requests'
        headers = self.get_headers('POST', path, request_data)
        
        response = requests.post(
            f"{self.base_url}{path}",
            headers=headers,
            json=request_data
        )
        
        response.raise_for_status()
        return response.json()

    def get_asset_by_qr_code(self, qr_code):
        path = f'/integration/assets/{qr_code}'
        headers = self.get_headers('GET', path)
        
        response = requests.get(
            f"{self.base_url}{path}",
            headers=headers
        )
        
        response.raise_for_status()
        return response.json()

# Usage Example
scim = SCIMIntegration(
    api_key='your_api_key',
    api_secret='your_api_secret',
    system_id='HR'
)

request = scim.create_equipment_request({
    'external_request_id': 'HR-REQ-2026-001',
    'employee_name': 'John Doe',
    'employee_id': 'EMP-001',
    'department': 'IT',
    'equipment_needed': [{
        'category': 'Laptop',
        'specifications': 'MacBook Pro 14',
        'quantity': 1,
        'priority': 'High'
    }],
    'needed_by': '2026-10-15',
    'business_justification': 'New hire equipment'
})

print(f"Request created: {request['request_number']}")
```

### 9.3 Webhook Handler Example (Node.js/Express)

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

const WEBHOOK_SECRET = 'your_webhook_secret';

app.use(express.json());

function verifyWebhookSignature(payload, signature) {
    const expectedSignature = crypto.createHmac('sha256', WEBHOOK_SECRET)
                                      .update(JSON.stringify(payload))
                                      .digest('hex');
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
}

app.post('/scim-webhook', (req, res) => {
    const payload = req.body;
    const signature = req.headers['x-webhook-signature'];
    
    // Verify signature
    if (!verifyWebhookSignature(payload, signature)) {
        console.error('Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
    }
    
    console.log(`Received webhook: ${payload.event_type}`);
    
    // Process different event types
    switch (payload.event_type) {
        case 'asset.assigned':
            handleAssetAssignment(payload.data);
            break;
        case 'equipment_request.fulfilled':
            handleEquipmentFulfillment(payload.data);
            break;
        case 'po.completed':
            handlePOCompletion(payload.data);
            break;
        default:
            console.log(`Unhandled event type: ${payload.event_type}`);
    }
    
    res.json({ received: true });
});

function handleAssetAssignment(data) {
    console.log(`Asset ${data.qr_code} assigned to ${data.assigned_to.employee_name}`);
    // Update your internal systems
}

function handleEquipmentFulfillment(data) {
    console.log(`Equipment request ${data.request_number} fulfilled`);
    // Update employee records with assigned equipment
}

function handlePOCompletion(data) {
    console.log(`PO ${data.po_number} completed`);
    // Update financial records
}

app.listen(3000, () => {
    console.log('Webhook server running on port 3000');
});
```

---

## 10. Support & Contact

### 10.1 Technical Support

For integration-related issues:
- **Email**: integration-support@greatsolomon.com
- **Documentation**: https://docs.greatsolomon.com/scim/integration
- **Status Page**: https://status.greatsolomon.com

### 10.2 API Status

Monitor SCIM API status:
- **Status Page**: https://status.greatsolomon.com
- **API Health**: https://scim.greatsolomon.com/api/v1/health

### 10.3 Emergency Contacts

For critical integration failures:
- **Emergency Hotline**: +63-2-SCIM-HELP
- **On-Call Engineer**: Available 24/7 for production issues

---

## 11. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-09-26 | Initial integration guide release |

---

*This integration guide is maintained by the Great Solomon IT Department. For the most current information, refer to the online documentation or contact the integration support team.*
