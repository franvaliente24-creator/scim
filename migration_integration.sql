-- SCIM Integration Database Schema
-- Migration file for adding integration capabilities to SCIM
-- This adds support for external system integration, webhooks, and equipment requests

-- ==========================================
-- 1. System Integration Management
-- ==========================================

CREATE TABLE IF NOT EXISTS system_integrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_name VARCHAR(80) NOT NULL,
    system_type VARCHAR(40) NOT NULL,
    api_endpoint VARCHAR(255),
    api_key VARCHAR(255) NOT NULL,
    api_secret VARCHAR(255) NOT NULL,
    status VARCHAR(40) DEFAULT 'Active',
    contact_email VARCHAR(160),
    last_sync DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_system_name (system_name),
    INDEX idx_system_type (system_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 2. External References (Cross-System Mapping)
-- ==========================================

CREATE TABLE IF NOT EXISTS external_references (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scim_entity_type VARCHAR(40) NOT NULL,
    scim_entity_id INT NOT NULL,
    external_system VARCHAR(80) NOT NULL,
    external_reference_id VARCHAR(100) NOT NULL,
    reference_type VARCHAR(40) NOT NULL,
    sync_status VARCHAR(40) DEFAULT 'Synced',
    last_synced DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_external_ref (external_system, external_reference_id),
    INDEX idx_scim_entity (scim_entity_type, scim_entity_id),
    INDEX idx_external_system (external_system),
    INDEX idx_reference_type (reference_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 3. Equipment Requests (Cross-System)
-- ==========================================

CREATE TABLE IF NOT EXISTS equipment_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_number VARCHAR(30) UNIQUE NOT NULL,
    external_request_id VARCHAR(100),
    requesting_system VARCHAR(80) NOT NULL,
    employee_name VARCHAR(120) NOT NULL,
    employee_id VARCHAR(100),
    department VARCHAR(60),
    equipment_needed TEXT NOT NULL,
    needed_by DATE,
    business_justification TEXT,
    cost_center VARCHAR(40),
    priority VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(40) DEFAULT 'Pending',
    estimated_cost DECIMAL(12,2),
    actual_cost DECIMAL(12,2),
    rejection_reason TEXT,
    requested_date DATETIME,
    approved_by INT,
    approved_date DATETIME,
    fulfilled_date DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_request_number (request_number),
    INDEX idx_external_request (external_request_id),
    INDEX idx_requesting_system (requesting_system),
    INDEX idx_employee_id (employee_id),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_needed_by (needed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Equipment Request Items (for detailed line items)
CREATE TABLE IF NOT EXISTS equipment_request_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    category VARCHAR(60) NOT NULL,
    specifications TEXT,
    quantity INT NOT NULL,
    priority VARCHAR(20) DEFAULT 'Medium',
    assigned_asset_id INT,
    assigned_qr_code VARCHAR(50),
    unit_cost DECIMAL(12,2),
    total_cost DECIMAL(12,2),
    fulfillment_status VARCHAR(40) DEFAULT 'Pending',
    fulfilled_date DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES equipment_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_asset_id) REFERENCES assets(id),
    INDEX idx_request_id (request_id),
    INDEX idx_category (category),
    INDEX idx_fulfillment_status (fulfillment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Equipment Request Activity Log
CREATE TABLE IF NOT EXISTS equipment_request_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    performed_by VARCHAR(120),
    performed_by_system VARCHAR(80),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES equipment_requests(id) ON DELETE CASCADE,
    INDEX idx_request_id (request_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 4. Webhook Management
-- ==========================================

CREATE TABLE IF NOT EXISTS webhooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    webhook_id VARCHAR(30) UNIQUE NOT NULL,
    system_integration_id INT,
    event_types TEXT NOT NULL,
    target_url VARCHAR(255) NOT NULL,
    webhook_secret VARCHAR(255) NOT NULL,
    active TINYINT(1) DEFAULT 1,
    retry_policy VARCHAR(40) DEFAULT 'exponential',
    max_retries INT DEFAULT 3,
    last_triggered DATETIME,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (system_integration_id) REFERENCES system_integrations(id),
    INDEX idx_webhook_id (webhook_id),
    INDEX idx_active (active),
    INDEX idx_event_types (event_types(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Webhook Delivery Logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    webhook_id INT NOT NULL,
    event_id VARCHAR(50),
    event_type VARCHAR(80) NOT NULL,
    payload TEXT NOT NULL,
    response_code INT,
    response_body TEXT,
    delivery_status VARCHAR(40) DEFAULT 'Pending',
    attempt_number INT DEFAULT 1,
    next_retry_at DATETIME,
    sent_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id),
    INDEX idx_webhook_id (webhook_id),
    INDEX idx_event_type (event_type),
    INDEX idx_delivery_status (delivery_status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 5. Data Export & Synchronization
-- ==========================================

CREATE TABLE IF NOT EXISTS scheduled_exports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    export_id VARCHAR(30) UNIQUE NOT NULL,
    system_integration_id INT,
    export_type VARCHAR(40) NOT NULL,
    export_format VARCHAR(20) DEFAULT 'json',
    frequency VARCHAR(40) NOT NULL,
    schedule_time TIME,
    last_run DATETIME,
    next_run DATETIME,
    delivery_method VARCHAR(40) DEFAULT 'webhook',
    target_url VARCHAR(255),
    active TINYINT(1) DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (system_integration_id) REFERENCES system_integrations(id),
    INDEX idx_export_id (export_id),
    INDEX idx_export_type (export_type),
    INDEX idx_active (active),
    INDEX idx_next_run (next_run)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

CREATE TABLE IF NOT EXISTS export_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    export_id INT NOT NULL,
    export_type VARCHAR(40) NOT NULL,
    record_count INT,
    file_size BIGINT,
    file_path VARCHAR(255),
    status VARCHAR(40) DEFAULT 'Completed',
    error_message TEXT,
    export_start DATETIME,
    export_end DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (export_id) REFERENCES scheduled_exports(id),
    INDEX idx_export_id (export_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 6. Integration Audit Trail
-- ==========================================

CREATE TABLE IF NOT EXISTS integration_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_integration_id INT,
    external_system VARCHAR(80),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(40),
    entity_id INT,
    request_data TEXT,
    response_data TEXT,
    status VARCHAR(40) NOT NULL,
    error_message TEXT,
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (system_integration_id) REFERENCES system_integrations(id),
    INDEX idx_system_integration (system_integration_id),
    INDEX idx_external_system (external_system),
    INDEX idx_action (action),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 7. Asset Assignment Enhancement
-- ==========================================

-- Add integration columns to existing assets table
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS assigned_to_system VARCHAR(80),
ADD COLUMN IF NOT EXISTS external_employee_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS external_employee_name VARCHAR(120),
ADD COLUMN IF NOT EXISTS assignment_date DATE,
ADD COLUMN IF NOT EXISTS assignment_notes TEXT,
ADD COLUMN IF NOT EXISTS cost_center VARCHAR(40),
ADD INDEX IF NOT EXISTS idx_assigned_system (assigned_to_system),
ADD INDEX IF NOT EXISTS idx_external_employee (external_employee_id);

-- ==========================================
-- 8. Purchase Order Integration Enhancement
-- ==========================================

-- Add integration columns to existing purchase_orders table
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS budget_code VARCHAR(40),
ADD COLUMN IF NOT EXISTS budget_status VARCHAR(40),
ADD COLUMN IF NOT EXISTS budget_approved_by VARCHAR(120),
ADD COLUMN IF NOT EXISTS budget_approved_date DATETIME,
ADD COLUMN IF NOT EXISTS external_po_reference VARCHAR(100),
ADD COLUMN IF NOT EXISTS requesting_system VARCHAR(80),
ADD INDEX IF NOT EXISTS idx_budget_code (budget_code),
ADD INDEX IF NOT EXISTS idx_budget_status (budget_status),
ADD INDEX IF NOT EXISTS idx_external_po_ref (external_po_reference);

-- ==========================================
-- 9. API Rate Limiting
-- ==========================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    system_integration_id INT,
    external_system VARCHAR(80),
    endpoint VARCHAR(100),
    request_count INT DEFAULT 0,
    window_start DATETIME,
    window_end DATETIME,
    blocked_until DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (system_integration_id) REFERENCES system_integrations(id),
    INDEX idx_system_integration (system_integration_id),
    INDEX idx_external_system (external_system),
    INDEX idx_endpoint (endpoint),
    INDEX idx_window (window_start, window_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- ==========================================
-- 10. Integration Configuration
-- ==========================================

CREATE TABLE IF NOT EXISTS integration_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(80) UNIQUE NOT NULL,
    config_value TEXT,
    config_type VARCHAR(40) DEFAULT 'string',
    description TEXT,
    is_encrypted TINYINT(1) DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- Insert default integration configuration
INSERT INTO integration_config (config_key, config_value, config_type, description) VALUES
('integration.enabled', 'true', 'boolean', 'Enable/disable all integrations'),
('webhook.retry.max_attempts', '3', 'integer', 'Maximum webhook retry attempts'),
('webhook.retry.backoff_seconds', '60', 'integer', 'Initial backoff for webhook retries'),
('api.rate_limit.requests_per_minute', '100', 'integer', 'Standard rate limit per minute'),
('api.rate_limit.burst_requests', '200', 'integer', 'Burst rate limit per minute'),
('equipment_request.auto_approve_threshold', '50000', 'decimal', 'Auto-approve threshold for equipment requests'),
('sync.batch_size', '1000', 'integer', 'Batch size for data synchronization'),
('export.retention_days', '30', 'integer', 'Retention period for export files')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);

-- ==========================================
-- 11. Sample Data for Testing
-- ==========================================

-- Sample system integration
INSERT INTO system_integrations (system_name, system_type, api_endpoint, api_key, api_secret, status, contact_email) VALUES
('HR Information System', 'HRIS', 'https://hr.greatsolomon.com/api', 'HR-INT-001', 'secret_hr_key_12345', 'Active', 'hr-admin@greatsolomon.com'),
('Financial System', 'FINANCE', 'https://finance.greatsolomon.com/api', 'FIN-INT-001', 'secret_finance_key_12345', 'Active', 'finance-admin@greatsolomon.com')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Sample equipment request
INSERT INTO equipment_requests (request_number, external_request_id, requesting_system, employee_name, employee_id, department, equipment_needed, needed_by, business_justification, cost_center, priority, status, requested_date) VALUES
('SCIM-REQ-2026-001', 'HR-REQ-2026-001', 'HR', 'John Doe', 'EMP-001', 'IT', '[{"category":"Laptop","specifications":"MacBook Pro 14","quantity":1,"priority":"High"}]', '2026-10-15', 'New hire equipment setup', 'CC-IT-001', 'High', 'Pending', NOW())
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- Sample webhook
INSERT INTO webhooks (webhook_id, system_integration_id, event_types, target_url, webhook_secret, active) VALUES
('WH-HR-001', 1, '["asset.assigned","equipment_request.fulfilled"]', 'https://hr.greatsolomon.com/webhooks/scim', 'webhook_secret_hr_12345', 1)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

-- ==========================================
-- 12. Views for Common Queries
-- ==========================================

-- View for active equipment requests with system info
CREATE OR REPLACE VIEW v_active_equipment_requests AS
SELECT 
    er.request_number,
    er.external_request_id,
    er.requesting_system,
    er.employee_name,
    er.employee_id,
    er.department,
    er.status,
    er.priority,
    er.needed_by,
    er.estimated_cost,
    er.requested_date,
    si.system_name,
    si.system_type,
    si.contact_email
FROM equipment_requests er
LEFT JOIN system_integrations si ON er.requesting_system = si.system_name
WHERE er.status IN ('Pending', 'Approved', 'Fulfilling');

-- View for webhook performance
CREATE OR REPLACE VIEW v_webhook_performance AS
SELECT 
    w.webhook_id,
    w.event_types,
    w.target_url,
    w.active,
    w.success_count,
    w.failure_count,
    CASE 
        WHEN w.success_count + w.failure_count = 0 THEN 0
        ELSE ROUND((w.success_count * 100.0) / (w.success_count + w.failure_count), 2)
    END as success_rate,
    w.last_triggered,
    si.system_name
FROM webhooks w
LEFT JOIN system_integrations si ON w.system_integration_id = si.id;

-- View for integration audit summary
CREATE OR REPLACE VIEW v_integration_audit_summary AS
SELECT 
    external_system,
    action,
    status,
    COUNT(*) as total_actions,
    COUNT(CASE WHEN status = 'Success' THEN 1 END) as successful_actions,
    COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failed_actions,
    MIN(created_at) as first_action,
    MAX(created_at) as last_action
FROM integration_audit_log
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY external_system, action, status;

-- ==========================================
-- 13. Stored Procedures for Common Operations
-- ==========================================

DELIMITER //

-- Procedure to log equipment request activity
CREATE PROCEDURE log_equipment_request_activity(
    IN p_request_id INT,
    IN p_action VARCHAR(100),
    IN p_details TEXT,
    IN p_performed_by VARCHAR(120),
    IN p_performed_by_system VARCHAR(80)
)
BEGIN
    INSERT INTO equipment_request_activity (request_id, action, details, performed_by, performed_by_system)
    VALUES (p_request_id, p_action, p_details, p_performed_by, p_performed_by_system);
END //

-- Procedure to update webhook statistics
CREATE PROCEDURE update_webhook_stats(
    IN p_webhook_id INT,
    IN p_success TINYINT
)
BEGIN
    IF p_success = 1 THEN
        UPDATE webhooks 
        SET success_count = success_count + 1, 
            last_triggered = NOW() 
        WHERE id = p_webhook_id;
    ELSE
        UPDATE webhooks 
        SET failure_count = failure_count + 1, 
            last_triggered = NOW() 
        WHERE id = p_webhook_id;
    END IF;
END //

-- Procedure to generate equipment request number
CREATE PROCEDURE generate_equipment_request_number(OUT p_request_number VARCHAR(30))
BEGIN
    DECLARE v_count INT;
    SELECT COUNT(*) + 1 INTO v_count 
    FROM equipment_requests 
    WHERE YEAR(created_at) = YEAR(NOW());
    
    SET p_request_number = CONCAT('SCIM-REQ-', YEAR(NOW()), '-', LPAD(v_count, 3, '0'));
END //

DELIMITER ;

-- ==========================================
-- 14. Triggers for Data Consistency
-- ==========================================

DELIMITER //

-- Trigger to update external references when asset is assigned
CREATE TRIGGER trg_asset_assignment_reference
AFTER UPDATE ON assets
FOR EACH ROW
BEGIN
    IF NEW.assigned_to_system IS NOT NULL AND NEW.external_employee_id IS NOT NULL THEN
        INSERT INTO external_references (scim_entity_type, scim_entity_id, external_system, external_reference_id, reference_type, sync_status)
        VALUES ('asset', NEW.id, NEW.assigned_to_system, NEW.external_employee_id, 'assignment', 'Synced')
        ON DUPLICATE KEY UPDATE 
            sync_status = 'Synced',
            last_synced = NOW();
    END IF;
END //

-- Trigger to log equipment request status changes
CREATE TRIGGER trg_equipment_request_status_log
AFTER UPDATE ON equipment_requests
FOR EACH ROW
BEGIN
    IF OLD.status != NEW.status THEN
        INSERT INTO equipment_request_activity (request_id, action, details, performed_by_system)
        VALUES (NEW.id, 'Status Changed', CONCAT('Status changed from ', OLD.status, ' to ', NEW.status), NEW.requesting_system);
    END IF;
END //

DELIMITER ;

-- ==========================================
-- End of Integration Schema Migration
-- ==========================================

-- Notes:
-- 1. This migration adds integration capabilities without breaking existing functionality
-- 2. All new tables use InnoDB engine for transactional integrity
-- 3. Foreign key constraints ensure referential integrity
-- 4. Indexes are added for performance optimization
-- 5. Views and stored procedures provide common query patterns
-- 6. Triggers maintain data consistency across systems
-- 7. Sample data is provided for testing purposes
-- 8. Configuration table allows runtime behavior adjustment