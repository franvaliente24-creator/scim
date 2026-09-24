CREATE TABLE IF NOT EXISTS roles (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(40) UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120) NOT NULL, email VARCHAR(160) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(40) NOT NULL DEFAULT 'WarehouseStaff', is_active TINYINT(1) NOT NULL DEFAULT 1, mfa_enabled TINYINT(1) NOT NULL DEFAULT 0, mfa_secret VARCHAR(255), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS login_history (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NULL, email VARCHAR(160) NOT NULL, success TINYINT(1) NOT NULL, ip_address VARCHAR(64), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assets (id INT AUTO_INCREMENT PRIMARY KEY, qr_code VARCHAR(50) UNIQUE, name VARCHAR(120), category VARCHAR(60), value DECIMAL(12,2), status VARCHAR(40), location VARCHAR(80), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS warehouse_zones (id INT AUTO_INCREMENT PRIMARY KEY, zone VARCHAR(20) UNIQUE NOT NULL, capacity INT NOT NULL DEFAULT 100, occupied INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS warehouse_rows (id INT AUTO_INCREMENT PRIMARY KEY, zone VARCHAR(20) NOT NULL, row_num VARCHAR(10) NOT NULL, capacity INT NOT NULL DEFAULT 20, occupied INT NOT NULL DEFAULT 0, FOREIGN KEY (zone) REFERENCES warehouse_zones(zone));
CREATE TABLE asset_transactions (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT, action VARCHAR(60), zone VARCHAR(20), created_at DATETIME, FOREIGN KEY(asset_id) REFERENCES assets(id));
CREATE TABLE IF NOT EXISTS vendors (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(160), phone VARCHAR(20), address TEXT, category VARCHAR(60), on_time_rate INT DEFAULT 95, defect_rate DECIMAL(4,1) DEFAULT 0.0, rating DECIMAL(3,1) DEFAULT 4.0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS purchase_orders (id INT AUTO_INCREMENT PRIMARY KEY, po_number VARCHAR(30) UNIQUE NOT NULL, vendor_id INT, vendor VARCHAR(120), items TEXT, total DECIMAL(12,2), status VARCHAR(40) DEFAULT 'Draft', expected_delivery DATE, notes TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (vendor_id) REFERENCES vendors(id));
CREATE TABLE IF NOT EXISTS purchase_order_items (id INT AUTO_INCREMENT PRIMARY KEY, po_id INT, item_name VARCHAR(120), quantity INT, unit_price DECIMAL(12,2), FOREIGN KEY (po_id) REFERENCES purchase_orders(id));
CREATE TABLE IF NOT EXISTS requisitions (id INT AUTO_INCREMENT PRIMARY KEY, req_number VARCHAR(30) UNIQUE NOT NULL, title VARCHAR(200) NOT NULL, department VARCHAR(60), description TEXT, estimated_cost DECIMAL(12,2), actual_cost DECIMAL(12,2), priority VARCHAR(20) DEFAULT 'Medium', status VARCHAR(40) DEFAULT 'Draft', needed_by DATE, created_by INT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (created_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS supplier_quotes (id INT AUTO_INCREMENT PRIMARY KEY, requisition_id INT, vendor_id INT, quote_amount DECIMAL(12,2), status VARCHAR(40) DEFAULT 'Pending', valid_until DATE, notes TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (requisition_id) REFERENCES requisitions(id), FOREIGN KEY (vendor_id) REFERENCES vendors(id));
CREATE TABLE IF NOT EXISTS documents (id INT AUTO_INCREMENT PRIMARY KEY, document_type VARCHAR(80) NOT NULL, reference_no VARCHAR(40) UNIQUE NOT NULL, owner VARCHAR(100) NOT NULL, description TEXT, related_po VARCHAR(30), due_date DATE, status VARCHAR(40) DEFAULT 'Pending Verification', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS document_signatures (id INT AUTO_INCREMENT PRIMARY KEY, document_id INT, signer_name VARCHAR(120), signature_data TEXT, signed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (document_id) REFERENCES documents(id));
CREATE TABLE IF NOT EXISTS po_activity (id INT AUTO_INCREMENT PRIMARY KEY, po_id INT, action VARCHAR(100), details TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (po_id) REFERENCES purchase_orders(id));
CREATE TABLE IF NOT EXISTS document_activity (id INT AUTO_INCREMENT PRIMARY KEY, document_id INT, action VARCHAR(100), details TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (document_id) REFERENCES documents(id));
INSERT INTO assets(qr_code,name,category,value,status,location) VALUES
('QR-LAP-001','MacBook Pro 14','Laptop',124500,'Deployed','Manila HQ'),('QR-MON-014','Dell UltraSharp 27','Monitor',28900,'In Warehouse','Zone B-02'),('QR-LAP-021','ThinkPad X1 Carbon','Laptop',99800,'In Maintenance','Service Bay'),('QR-KEY-008','Logitech MX Keys','Peripheral',6200,'In Warehouse','Zone A-04');
INSERT INTO warehouse_zones(zone,capacity,occupied) VALUES ('A',100,32),('B',100,68),('C',100,91),('D',100,48);
INSERT INTO warehouse_rows(zone,row_num,capacity,occupied) VALUES 
('A','1',20,6),('A','2',20,8),('A','3',20,10),('A','4',20,8),
('B','1',20,12),('B','2',20,14),('B','3',20,18),('B','4',20,24),
('C','1',20,20),('C','2',20,19),('C','3',20,18),('C','4',20,17),
('D','1',20,10),('D','2',20,12),('D','3',20,13),('D','4',20,13);
INSERT INTO asset_transactions(asset_id,action,zone,created_at) VALUES (1,'Contractor Check-Out','A',NOW()-INTERVAL 8 MINUTE),(2,'Inventory Intake','B',NOW()-INTERVAL 27 MINUTE),(4,'Asset Transfer','A',NOW()-INTERVAL 52 MINUTE);
INSERT INTO vendors(name,email,phone,address,category,on_time_rate,defect_rate,rating) VALUES 
('TechSource Asia','sales@techsource.asia','+63-2-8123-4567','Makati City, Metro Manila','IT Equipment',96,1.2,4.8),
('Prime Devices Co.','orders@primedevices.com','+63-2-8765-4321','Quezon City, Metro Manila','IT Equipment',91,2.1,4.4),
('Metro IT Supply','info@metroit.com','+63-2-8234-5678','Taguig City, Metro Manila','Office Supplies',87,3.8,4.0);
INSERT INTO purchase_orders(po_number,vendor_id,vendor,items,total,status,expected_delivery,notes,created_at,updated_at) VALUES 
('PO-2026-041',1,'TechSource Asia','15x MacBook Pro 14, 10x Dell UltraSharp 27',284500,'Pending Approval','2026-10-15','Bulk order for Q4 equipment deployment',NOW()-INTERVAL 1 DAY,NOW()-INTERVAL 1 DAY),
('PO-2026-039',2,'Prime Devices Co.','20x ThinkPad X1 Carbon, 5x Docking Stations',156200,'Shipped','2026-09-25','Rush order for new hires',NOW()-INTERVAL 2 DAY,NOW()-INTERVAL 1 DAY),
('PO-2026-038',3,'Metro IT Supply','Office supplies and peripherals',99100,'Received','2026-09-20','Monthly replenishment',NOW()-INTERVAL 4 DAY,NOW()-INTERVAL 2 DAY);
INSERT INTO purchase_order_items(po_id,item_name,quantity,unit_price) VALUES 
(1,'MacBook Pro 14',15,16500),(1,'Dell UltraSharp 27',10,3100),
(2,'ThinkPad X1 Carbon',20,7200),(2,'Docking Station',5,440),
(3,'Office Supplies Bundle',1,99100);
INSERT INTO requisitions(req_number,title,department,description,estimated_cost,priority,status,needed_by,created_by,created_at) VALUES 
('REQ-2026-045','Q4 Equipment Upgrade','IT','Laptops and monitors for new team members',450000,'High','Submitted','2026-10-15',1,NOW()-INTERVAL 3 DAY),
('REQ-2026-044','Office Furniture','Operations','Desks and chairs for expansion',150000,'Medium','Pending Quote','2026-10-30',1,NOW()-INTERVAL 5 DAY),
('REQ-2026-043','Network Equipment','IT','Switches and routers for new office',280000,'Urgent','Approved','2026-09-25',1,NOW()-INTERVAL 7 DAY);
INSERT INTO supplier_quotes(requisition_id,vendor_id,quote_amount,status,valid_until,notes,created_at) VALUES 
(1,1,445000,'Accepted','2026-09-30','Volume discount applied',NOW()-INTERVAL 2 DAY),
(1,2,460000,'Rejected','2026-09-28','Higher than budget',NOW()-INTERVAL 2 DAY),
(2,1,145000,'Pending','2026-09-30','Awaiting final confirmation',NOW()-INTERVAL 1 DAY);
INSERT INTO documents(document_type,reference_no,owner,description,related_po,due_date,status,created_at,updated_at) VALUES 
('Equipment Accountability Form','EAF-2026-117','Juan Dela Cruz','Asset handover for contractor deployment','PO-2026-038','2026-09-23','Pending Verification',NOW()-INTERVAL 1 DAY,NOW()),
('Courier Receipt','CR-2026-088','Warehouse Team','Delivery confirmation for PO-2026-038','PO-2026-038','2026-09-21','Verified',NOW()-INTERVAL 2 DAY,NOW()-INTERVAL 1 DAY),
('Vendor Invoice','INV-2026-302','Finance','Payment invoice for PO-2026-038','PO-2026-038','2026-09-25','For Verification',NOW()-INTERVAL 3 DAY,NOW());
INSERT INTO document_signatures(document_id,signer_name,signature_data,signed_at) VALUES 
(2,'Maria Santos','digital_signature_hash',NOW()-INTERVAL 1 DAY);
INSERT INTO po_activity(po_id,action,details,created_at) VALUES 
(1,'Created','Purchase order created by admin',NOW()-INTERVAL 1 DAY),
(2,'Shipped','Vendor confirmed shipment',NOW()-INTERVAL 1 DAY),
(3,'Received','Warehouse confirmed receipt',NOW()-INTERVAL 2 DAY);
INSERT INTO document_activity(document_id,action,details,created_at) VALUES 
(1,'Created','EAF generated for contractor deployment',NOW()-INTERVAL 1 DAY),
(2,'Verified','Courier receipt verified and signed',NOW()-INTERVAL 1 DAY),
(3,'Received','Invoice received from vendor',NOW()-INTERVAL 3 DAY);
