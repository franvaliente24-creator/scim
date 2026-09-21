CREATE TABLE assets (id INT AUTO_INCREMENT PRIMARY KEY, qr_code VARCHAR(50) UNIQUE, name VARCHAR(120), category VARCHAR(60), value DECIMAL(12,2), status VARCHAR(40), location VARCHAR(80));
CREATE TABLE warehouse_shelves (id INT AUTO_INCREMENT PRIMARY KEY, zone VARCHAR(20), capacity INT, occupied INT);
CREATE TABLE asset_transactions (id INT AUTO_INCREMENT PRIMARY KEY, asset_id INT, action VARCHAR(60), created_at DATETIME, FOREIGN KEY(asset_id) REFERENCES assets(id));
CREATE TABLE vendors (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120), on_time_rate INT, defect_rate DECIMAL(4,1), rating DECIMAL(3,1));
CREATE TABLE purchase_orders (id INT AUTO_INCREMENT PRIMARY KEY, po_number VARCHAR(30), vendor VARCHAR(120), total DECIMAL(12,2), status VARCHAR(40), updated_at DATETIME);
CREATE TABLE document_logs (id INT AUTO_INCREMENT PRIMARY KEY, document_type VARCHAR(80), reference_no VARCHAR(40), owner VARCHAR(100), due_date DATE, status VARCHAR(40));
INSERT INTO assets(qr_code,name,category,value,status,location) VALUES
('QR-LAP-001','MacBook Pro 14','Laptop',124500,'Deployed','Manila HQ'),('QR-MON-014','Dell UltraSharp 27','Monitor',28900,'In Warehouse','Zone B-02'),('QR-LAP-021','ThinkPad X1 Carbon','Laptop',99800,'In Maintenance','Service Bay'),('QR-KEY-008','Logitech MX Keys','Peripheral',6200,'In Warehouse','Zone A-04');
INSERT INTO warehouse_shelves(zone,capacity,occupied) VALUES ('A',100,32),('B',100,68),('C',100,91),('D',100,48);
INSERT INTO asset_transactions(asset_id,action,created_at) VALUES (1,'Contractor Check-Out',NOW()-INTERVAL 8 MINUTE),(2,'Inventory Intake',NOW()-INTERVAL 27 MINUTE),(4,'Asset Transfer',NOW()-INTERVAL 52 MINUTE);
INSERT INTO vendors(name,on_time_rate,defect_rate,rating) VALUES ('TechSource Asia',96,1.2,4.8),('Prime Devices Co.',91,2.1,4.4),('Metro IT Supply',87,3.8,4.0);
INSERT INTO purchase_orders(po_number,vendor,total,status,updated_at) VALUES ('PO-2026-041','TechSource Asia',284500,'Pending Approval',NOW()-INTERVAL 1 DAY),('PO-2026-039','Prime Devices Co.',156200,'Shipped',NOW()-INTERVAL 2 DAY),('PO-2026-038','Metro IT Supply',99100,'Received',NOW()-INTERVAL 4 DAY);
INSERT INTO document_logs(document_type,reference_no,owner,due_date,status) VALUES ('Equipment Accountability Form','EAF-2026-117','Juan Dela Cruz','2026-09-23','Awaiting signature'),('Courier Receipt','CR-2026-088','Warehouse Team','2026-09-21','Verified'),('Vendor Invoice','INV-2026-302','Finance','2026-09-25','For verification');
