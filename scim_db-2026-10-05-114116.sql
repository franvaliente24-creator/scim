/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.8-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: hf_db_5tyoddp0
-- ------------------------------------------------------
-- Server version	11.8.8-MariaDB-ubu2404

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `activity_log`
--

DROP TABLE IF EXISTS `activity_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `user_name` varchar(120) DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `entity` varchar(40) DEFAULT NULL,
  `entity_ref` varchar(80) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_activity_user` (`user_id`),
  KEY `idx_activity_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `activity_log` WRITE;
/*!40000 ALTER TABLE `activity_log` DISABLE KEYS */;
INSERT INTO `activity_log` VALUES
(1,2,'Franie Valiente','Generated serial batch','asset','Dell Latitude  Laptop','10 serials for B','2026-10-02 19:37:28'),
(2,4,'Juan Dela Cruz','Scanned asset','asset','AST-000002','Inventory Intake','2026-10-02 19:40:44'),
(3,4,'Juan Dela Cruz','Scanned asset','asset','AST-000007','Inventory Intake','2026-10-02 19:41:50'),
(4,4,'Juan Dela Cruz','Scanned asset','asset','AST-000010','Inventory Intake','2026-10-02 19:42:02'),
(5,2,'Franie Valiente','Registered asset','asset','QR-PRI-001','Printer','2026-10-02 23:01:32'),
(6,2,'Franie Valiente','Updated asset','asset','QR-PRI-001','qr_code, name, category, status, value, location, quantity, low_stock_threshold, date_purchased, lifespan_months, manufacturer, model, serial_number, warranty_expiry, specs','2026-10-02 23:03:23'),
(7,2,'Franie Valiente','Requisition Approved','requisition','3','','2026-10-02 23:44:45'),
(8,2,'Franie Valiente','Archived record','asset','58','Reason: Wrong Scanned','2026-10-02 23:50:01'),
(9,2,'Franie Valiente','Restored record','asset','58','','2026-10-02 23:50:41'),
(10,2,'Franie Valiente','Restored record','asset','43','','2026-10-02 23:50:46'),
(11,2,'Franie Valiente','Created purchase order','purchase_order','PO-2026-005','₱42,500.00 to TechSource Asia','2026-10-03 00:01:24'),
(12,2,'Franie Valiente','Created purchase order','purchase_order','PO-2026-006','₱48,500.00 to Prime Devices Co.','2026-10-03 00:03:18');
/*!40000 ALTER TABLE `activity_log` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `admin_notifications`
--

DROP TABLE IF EXISTS `admin_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `details` text DEFAULT NULL,
  `user_email` varchar(160) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notif_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_notifications`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `admin_notifications` WRITE;
/*!40000 ALTER TABLE `admin_notifications` DISABLE KEYS */;
INSERT INTO `admin_notifications` VALUES
(1,'password_reset','Password reset requested','User Gerry Ramoso requested a credential reset.','ramosogerrymaejoy@gmail.com','Resolved','2026-10-02 18:28:47');
/*!40000 ALTER TABLE `admin_notifications` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `asset_transactions`
--

DROP TABLE IF EXISTS `asset_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asset_id` int(11) DEFAULT NULL,
  `action` varchar(60) DEFAULT NULL,
  `zone` varchar(20) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `asset_id` (`asset_id`),
  KEY `idx_txn_created` (`created_at`),
  KEY `idx_txn_action` (`action`),
  KEY `idx_txn_zone` (`zone`),
  CONSTRAINT `asset_transactions_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_transactions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `asset_transactions` WRITE;
/*!40000 ALTER TABLE `asset_transactions` DISABLE KEYS */;
INSERT INTO `asset_transactions` VALUES
(8,39,'Inventory Intake',NULL,'2026-10-01 14:08:50'),
(9,41,'Inventory Intake',NULL,'2026-10-01 14:09:12'),
(10,42,'Inventory Intake',NULL,'2026-10-01 14:09:32'),
(11,43,'Inventory Intake',NULL,'2026-10-02 04:20:56'),
(12,50,'Inventory Intake','B','2026-10-02 19:40:44'),
(13,55,'Inventory Intake','B','2026-10-02 19:41:50'),
(14,58,'Inventory Intake','B','2026-10-02 19:42:02');
/*!40000 ALTER TABLE `asset_transactions` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `assets`
--

DROP TABLE IF EXISTS `assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `qr_code` varchar(50) DEFAULT NULL,
  `name` varchar(120) DEFAULT NULL,
  `category` varchar(60) DEFAULT NULL,
  `value` decimal(12,2) DEFAULT NULL,
  `status` varchar(40) DEFAULT NULL,
  `location` varchar(80) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `assigned_to_system` varchar(80) DEFAULT NULL,
  `external_employee_id` varchar(100) DEFAULT NULL,
  `external_employee_name` varchar(120) DEFAULT NULL,
  `assignment_date` date DEFAULT NULL,
  `assignment_notes` text DEFAULT NULL,
  `cost_center` varchar(40) DEFAULT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `low_stock_threshold` int(11) DEFAULT NULL,
  `date_purchased` date DEFAULT NULL,
  `lifespan_months` int(11) DEFAULT NULL,
  `archived_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `specs` text DEFAULT NULL,
  `manufacturer` varchar(120) DEFAULT NULL,
  `model` varchar(120) DEFAULT NULL,
  `serial_number` varchar(60) DEFAULT NULL,
  `warranty_expiry` date DEFAULT NULL,
  `archived_by` varchar(160) DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  `bin_row` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `qr_code` (`qr_code`),
  KEY `idx_assets_status` (`status`),
  KEY `idx_assets_deleted` (`deleted_at`),
  KEY `idx_assets_archived` (`archived_at`),
  KEY `idx_assets_category` (`category`),
  KEY `idx_assets_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assets`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `assets` WRITE;
/*!40000 ALTER TABLE `assets` DISABLE KEYS */;
INSERT INTO `assets` VALUES
(39,'AGENCY-ASSET-LAPTOP-000031','Dell Latitude 5440 Laptop','Laptop',0.00,'In Warehouse','Print Queue','2026-10-01 14:05:22',NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,NULL,'2026-10-02 18:43:59',NULL,NULL,NULL,NULL,NULL,NULL,'Franie Valiente (ID 2)','Wrong Scan',NULL),
(41,'AGENCY-ASSET-LAPTOP-000033','Dell Latitude 5440 Laptop','Laptop',0.00,'In Warehouse','Print Queue','2026-10-01 14:05:22',NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,NULL,'2026-10-02 18:44:08',NULL,NULL,NULL,NULL,NULL,NULL,'Franie Valiente (ID 2)','Wrong Scan',NULL),
(42,'AGENCY-ASSET-LAPTOP-000034','Dell Latitude 5440 Laptop','Laptop',0.00,'In Warehouse','Print Queue','2026-10-01 14:05:22',NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,NULL,'2026-10-02 18:44:12',NULL,NULL,NULL,NULL,NULL,NULL,'Franie Valiente (ID 2)','Wrong Scan',NULL),
(43,'AGENCY-ASSET-LAPTOP-000035','Dell Latitude 5440 Laptop','Laptop',0.00,'In Warehouse','Print Queue','2026-10-01 14:05:22',NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(49,'AST-000001','tables and chairs','IT Equipment',0.00,'Receiving Dock','Inbound/Receiving','2026-10-02 13:35:27',NULL,NULL,NULL,NULL,NULL,NULL,1,NULL,NULL,NULL,'2026-10-02 18:24:06',NULL,NULL,NULL,NULL,NULL,NULL,'Franie Valiente (ID 2)','Wrong input',NULL),
(50,'AST-000002','Dell Latitude  Laptop','Laptop',0.00,'In Warehouse','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(51,'AST-000003','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(52,'AST-000004','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(53,'AST-000005','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(54,'AST-000006','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(55,'AST-000007','Dell Latitude  Laptop','Laptop',0.00,'In Warehouse','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(56,'AST-000008','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(57,'AST-000009','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(58,'AST-000010','Dell Latitude  Laptop','Laptop',0.00,'In Warehouse','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(59,'AST-000011','Dell Latitude  Laptop','Laptop',0.00,'Awaiting Print','B','2026-10-02 19:37:28',NULL,NULL,NULL,NULL,NULL,NULL,1,3,'2026-10-02',48,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(60,'QR-PRI-001','High Performance Multifunction for High Volume Printing','IT equipment',32995.00,'In Warehouse','A','2026-10-02 23:01:32',NULL,NULL,NULL,NULL,NULL,NULL,20,5,'2026-10-05',36,NULL,NULL,'Print Head/Consumables  Number of Nozzles  Total 4,352 nozzles  Ink Bottles (Type/Colours)  GI-76 (Pigment Ink/Black, Cyan, Magenta, Yellow)  Maintenance Cartridge MC-G01 Maximum Print Resolution  600 (Horizontal) x 1,200 (Vertical) dpi','Canon','MAXIFY GX6170','126A48434555','2030-10-31',NULL,NULL,NULL);
/*!40000 ALTER TABLE `assets` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `clearance_tokens`
--

DROP TABLE IF EXISTS `clearance_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `clearance_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_name` varchar(120) NOT NULL,
  `token` varchar(40) NOT NULL,
  `items_returned` int(11) DEFAULT 0,
  `status` varchar(40) DEFAULT 'Issued',
  `issued_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clearance_tokens`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `clearance_tokens` WRITE;
/*!40000 ALTER TABLE `clearance_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `clearance_tokens` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `document_activity`
--

DROP TABLE IF EXISTS `document_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_activity` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `document_id` int(11) DEFAULT NULL,
  `action` varchar(100) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `document_id` (`document_id`),
  CONSTRAINT `document_activity_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_activity`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `document_activity` WRITE;
/*!40000 ALTER TABLE `document_activity` DISABLE KEYS */;
INSERT INTO `document_activity` VALUES
(1,NULL,'Created','Document created by System Administrator','2026-09-22 13:00:23'),
(2,NULL,'Created','Document created by System Administrator','2026-09-22 13:00:27'),
(3,NULL,'Status Updated','Status changed to Verified','2026-09-24 09:19:53'),
(4,NULL,'Status Updated','Status changed to Verified','2026-09-30 11:03:12');
/*!40000 ALTER TABLE `document_activity` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `document_logs`
--

DROP TABLE IF EXISTS `document_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `document_type` varchar(80) DEFAULT NULL,
  `reference_no` varchar(40) DEFAULT NULL,
  `owner` varchar(100) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status` varchar(40) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `related_po` varchar(30) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `document_logs` WRITE;
/*!40000 ALTER TABLE `document_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `document_logs` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `document_signatures`
--

DROP TABLE IF EXISTS `document_signatures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_signatures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `document_id` int(11) DEFAULT NULL,
  `signer_name` varchar(120) DEFAULT NULL,
  `signature_data` text DEFAULT NULL,
  `signed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `document_id` (`document_id`),
  CONSTRAINT `document_signatures_ibfk_1` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_signatures`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `document_signatures` WRITE;
/*!40000 ALTER TABLE `document_signatures` DISABLE KEYS */;
/*!40000 ALTER TABLE `document_signatures` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `documents`
--

DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `document_type` varchar(80) NOT NULL,
  `reference_no` varchar(40) NOT NULL,
  `owner` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `related_po` varchar(30) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status` varchar(40) DEFAULT 'Pending Verification',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `archived_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `archived_by` varchar(160) DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  `batch_no` varchar(60) DEFAULT NULL,
  `sku` varchar(60) DEFAULT NULL,
  `asset_ref` varchar(60) DEFAULT NULL,
  `po_number` varchar(30) DEFAULT NULL,
  `sto_ref` varchar(40) DEFAULT NULL,
  `transport_ref` varchar(40) DEFAULT NULL,
  `carrier_tracking` varchar(80) DEFAULT NULL,
  `zone` varchar(20) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `updated_by` varchar(120) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference_no` (`reference_no`),
  KEY `idx_docs_status` (`status`),
  KEY `idx_docs_deleted` (`deleted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
INSERT INTO `documents` VALUES
(1,'Contract','Con-2026-001','IT','test','','2026-09-22','Pending Verification','2026-09-22 13:00:23','2026-09-22 13:00:23',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(2,'Contract','Con-2026-002','IT','test','','2026-09-22','Verified','2026-09-22 13:00:27','2026-09-30 11:03:12',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `documents` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `equipment_request_activity`
--

DROP TABLE IF EXISTS `equipment_request_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_request_activity` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `action` varchar(100) NOT NULL,
  `details` text DEFAULT NULL,
  `performed_by` varchar(120) DEFAULT NULL,
  `performed_by_system` varchar(80) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  CONSTRAINT `equipment_request_activity_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `equipment_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment_request_activity`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `equipment_request_activity` WRITE;
/*!40000 ALTER TABLE `equipment_request_activity` DISABLE KEYS */;
/*!40000 ALTER TABLE `equipment_request_activity` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `equipment_request_items`
--

DROP TABLE IF EXISTS `equipment_request_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_request_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_id` int(11) NOT NULL,
  `category` varchar(60) NOT NULL,
  `specifications` text DEFAULT NULL,
  `quantity` int(11) NOT NULL,
  `priority` varchar(20) DEFAULT 'Medium',
  `assigned_asset_id` int(11) DEFAULT NULL,
  `assigned_qr_code` varchar(50) DEFAULT NULL,
  `unit_cost` decimal(12,2) DEFAULT NULL,
  `total_cost` decimal(12,2) DEFAULT NULL,
  `fulfillment_status` varchar(40) DEFAULT 'Pending',
  `fulfilled_date` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  KEY `assigned_asset_id` (`assigned_asset_id`),
  CONSTRAINT `equipment_request_items_ibfk_1` FOREIGN KEY (`request_id`) REFERENCES `equipment_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `equipment_request_items_ibfk_2` FOREIGN KEY (`assigned_asset_id`) REFERENCES `assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment_request_items`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `equipment_request_items` WRITE;
/*!40000 ALTER TABLE `equipment_request_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `equipment_request_items` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `equipment_requests`
--

DROP TABLE IF EXISTS `equipment_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `equipment_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `request_number` varchar(30) NOT NULL,
  `external_request_id` varchar(100) DEFAULT NULL,
  `requesting_system` varchar(80) NOT NULL,
  `employee_name` varchar(120) NOT NULL,
  `employee_id` varchar(100) DEFAULT NULL,
  `department` varchar(60) DEFAULT NULL,
  `equipment_needed` text NOT NULL,
  `needed_by` date DEFAULT NULL,
  `business_justification` text DEFAULT NULL,
  `cost_center` varchar(40) DEFAULT NULL,
  `priority` varchar(20) DEFAULT 'Medium',
  `status` varchar(40) DEFAULT 'Pending',
  `estimated_cost` decimal(12,2) DEFAULT NULL,
  `actual_cost` decimal(12,2) DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `requested_date` datetime DEFAULT NULL,
  `approved_by` int(11) DEFAULT NULL,
  `approved_date` datetime DEFAULT NULL,
  `fulfilled_date` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `request_number` (`request_number`),
  KEY `approved_by` (`approved_by`),
  CONSTRAINT `equipment_requests_ibfk_1` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `equipment_requests`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `equipment_requests` WRITE;
/*!40000 ALTER TABLE `equipment_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `equipment_requests` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `external_references`
--

DROP TABLE IF EXISTS `external_references`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `external_references` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `scim_entity_type` varchar(40) NOT NULL,
  `scim_entity_id` int(11) NOT NULL,
  `external_system` varchar(80) NOT NULL,
  `external_reference_id` varchar(100) NOT NULL,
  `reference_type` varchar(40) NOT NULL,
  `sync_status` varchar(40) DEFAULT 'Synced',
  `last_synced` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_external_ref` (`external_system`,`external_reference_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `external_references`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `external_references` WRITE;
/*!40000 ALTER TABLE `external_references` DISABLE KEYS */;
/*!40000 ALTER TABLE `external_references` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `finance_settlements`
--

DROP TABLE IF EXISTS `finance_settlements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_settlements` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `po_id` int(11) DEFAULT NULL,
  `po_number` varchar(30) DEFAULT NULL,
  `vendor_id` int(11) DEFAULT NULL,
  `vendor_name` varchar(120) DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `verification_timestamp` datetime DEFAULT NULL,
  `status` varchar(40) DEFAULT 'Forwarded',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_settlements`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `finance_settlements` WRITE;
/*!40000 ALTER TABLE `finance_settlements` DISABLE KEYS */;
INSERT INTO `finance_settlements` VALUES
(1,4,'PO-2026-004',2,'Prime Devices Co.',30000.00,'2026-10-02 16:28:48','Forwarded to AP','2026-10-02 16:28:41'),
(2,1,'PO-2026-041',1,'TechSource Asia',284500.00,'2026-10-02 16:42:06','Forwarded to AP','2026-10-02 16:42:06'),
(3,5,'PO-2026-005',1,'TechSource Asia',42500.00,'2026-10-03 00:07:35','Forwarded to AP','2026-10-03 00:01:23'),
(4,6,'PO-2026-006',2,'Prime Devices Co.',48500.00,NULL,'Awaiting Delivery','2026-10-03 00:03:18');
/*!40000 ALTER TABLE `finance_settlements` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `fleet_requests`
--

DROP TABLE IF EXISTS `fleet_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_requests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `req_number` varchar(30) NOT NULL,
  `item_name` varchar(200) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT 1,
  `origin` varchar(120) DEFAULT 'Warehouse',
  `destination` varchar(200) NOT NULL,
  `notes` text DEFAULT NULL,
  `status` varchar(40) DEFAULT 'Submitted',
  `requested_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `asset_ref` varchar(60) DEFAULT NULL,
  `recipient_name` varchar(120) DEFAULT NULL,
  `recipient_dept` varchar(80) DEFAULT NULL,
  `requested_date` date DEFAULT NULL,
  `priority` varchar(20) NOT NULL DEFAULT 'Normal',
  `special_instructions` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `req_number` (`req_number`),
  KEY `idx_fleet_status` (`status`),
  KEY `idx_fleet_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fleet_requests`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `fleet_requests` WRITE;
/*!40000 ALTER TABLE `fleet_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `fleet_requests` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `integration_audit_log`
--

DROP TABLE IF EXISTS `integration_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `integration_audit_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `system_integration_id` int(11) DEFAULT NULL,
  `external_system` varchar(80) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(40) DEFAULT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `request_data` text DEFAULT NULL,
  `response_data` text DEFAULT NULL,
  `status` varchar(40) NOT NULL,
  `error_message` text DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `system_integration_id` (`system_integration_id`),
  CONSTRAINT `integration_audit_log_ibfk_1` FOREIGN KEY (`system_integration_id`) REFERENCES `system_integrations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `integration_audit_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `integration_audit_log` WRITE;
/*!40000 ALTER TABLE `integration_audit_log` DISABLE KEYS */;
INSERT INTO `integration_audit_log` VALUES
(1,NULL,'SCIM','Requisition Approved','requisition',2,'{\"req_number\":\"2\",\"new_status\":\"Approved\",\"actor\":\"Franie Valiente\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-01 15:05:46'),
(2,NULL,'SCIM','Requisition Approved','requisition',1,'{\"req_number\":\"1\",\"new_status\":\"Approved\",\"actor\":\"Franie Valiente\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-01 15:05:48'),
(3,NULL,'Supplier Shipment Simulator','Inbound Arrival','purchase_order',4,'{\"po_number\":\"PO-2026-004\",\"serials\":[\"AST-000001\"]}',NULL,'Success',NULL,NULL,NULL,'2026-10-02 13:35:27'),
(4,NULL,'Financial Management','PO Settlement Forwarded','purchase_order',4,'{\"po_number\":\"PO-2026-004\",\"vendor_id\":2,\"total_invoice_amount\":\"30000.00\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-02 16:28:41'),
(5,NULL,'Financial Management','PO Settlement Forwarded','purchase_order',4,'{\"po_number\":\"PO-2026-004\",\"vendor_id\":2,\"total_invoice_amount\":\"30000.00\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-02 16:28:45'),
(6,NULL,'Financial Management','PO Settlement Forwarded','purchase_order',4,'{\"po_number\":\"PO-2026-004\",\"vendor_id\":2,\"total_invoice_amount\":\"30000.00\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-02 16:28:48'),
(7,NULL,'Financial Management','PO Settlement Forwarded','purchase_order',1,'{\"po_number\":\"PO-2026-041\",\"vendor_id\":1,\"total_invoice_amount\":\"284500.00\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-02 16:42:06'),
(8,NULL,'SCIM','Requisition Approved','requisition',3,'{\"req_number\":\"3\",\"new_status\":\"Approved\",\"actor\":\"Franie Valiente\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-02 23:44:45'),
(9,NULL,'Financial Management','PO Settlement Forwarded','purchase_order',5,'{\"po_number\":\"PO-2026-005\",\"vendor_id\":1,\"total_invoice_amount\":\"42500.00\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-03 00:07:35'),
(10,NULL,'Financial Management','PO Settlement Forwarded','purchase_order',5,'{\"po_number\":\"PO-2026-005\",\"vendor_id\":1,\"total_invoice_amount\":\"42500.00\"}',NULL,'Success',NULL,NULL,NULL,'2026-10-03 00:07:35');
/*!40000 ALTER TABLE `integration_audit_log` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `integration_config`
--

DROP TABLE IF EXISTS `integration_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `integration_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(80) NOT NULL,
  `config_value` text DEFAULT NULL,
  `config_type` varchar(40) DEFAULT 'string',
  `description` text DEFAULT NULL,
  `is_encrypted` tinyint(1) DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `config_key` (`config_key`)
) ENGINE=InnoDB AUTO_INCREMENT=80067 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `integration_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `integration_config` WRITE;
/*!40000 ALTER TABLE `integration_config` DISABLE KEYS */;
INSERT INTO `integration_config` VALUES
(1,'integration.enabled','true','boolean','Enable/disable all integrations',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(2,'webhook.retry.max_attempts','3','integer','Maximum webhook retry attempts',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(3,'webhook.retry.backoff_seconds','60','integer','Initial backoff for webhook retries',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(4,'api.rate_limit.requests_per_minute','100','integer','Standard rate limit per minute',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(5,'api.rate_limit.burst_requests','200','integer','Burst rate limit per minute',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(6,'equipment_request.auto_approve_threshold','50000','decimal','Auto-approve threshold for equipment requests',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(7,'sync.batch_size','1000','integer','Batch size for data synchronization',0,'2026-09-26 18:38:48','2026-09-26 18:38:48'),
(8,'export.retention_days','30','integer','Retention period for export files',0,'2026-09-26 18:38:48','2026-09-26 18:38:48');
/*!40000 ALTER TABLE `integration_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `login_history`
--

DROP TABLE IF EXISTS `login_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `email` varchar(160) NOT NULL,
  `success` tinyint(1) NOT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=194 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `login_history`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `login_history` WRITE;
/*!40000 ALTER TABLE `login_history` DISABLE KEYS */;
INSERT INTO `login_history` VALUES
(1,NULL,'franvaliente24@gmail.com',0,'187.77.128.9','2026-09-21 13:22:56'),
(2,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-21 13:25:10'),
(3,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-21 14:01:12'),
(4,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-21 14:11:05'),
(5,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-21 14:19:50'),
(6,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-21 14:23:56'),
(7,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-21 15:43:46'),
(8,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-21 15:50:27'),
(9,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-21 15:57:48'),
(10,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-21 16:05:43'),
(11,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-21 16:07:16'),
(12,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-22 01:03:54'),
(13,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-22 06:50:57'),
(14,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-22 11:37:15'),
(15,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-09-22 11:49:04'),
(16,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-22 11:50:22'),
(17,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-22 12:35:51'),
(18,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-22 16:02:42'),
(19,NULL,'franvaliente24@gmail.com',0,'187.77.128.9','2026-09-22 19:23:54'),
(20,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-22 19:26:41'),
(21,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 05:50:19'),
(22,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-24 06:25:30'),
(23,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 07:38:45'),
(24,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-24 07:39:08'),
(25,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 09:16:33'),
(26,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-24 09:16:51'),
(27,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 10:53:10'),
(28,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-09-24 10:53:19'),
(29,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 11:43:47'),
(30,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 11:44:56'),
(31,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 11:51:22'),
(32,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 14:05:37'),
(33,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 14:08:56'),
(34,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 14:10:12'),
(35,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-24 14:13:06'),
(36,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 14:47:25'),
(37,NULL,'franvaliente24@gmail.com',0,'187.77.128.9','2026-09-24 16:26:28'),
(38,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 16:26:36'),
(39,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-24 17:47:58'),
(40,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-24 17:55:21'),
(41,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-24 18:27:31'),
(42,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-24 18:32:09'),
(43,NULL,'admin@greatsolomon.test',0,'187.77.128.9','2026-09-24 18:52:23'),
(44,NULL,'admin@greatsolomon.test',0,'187.77.128.9','2026-09-24 18:52:37'),
(45,1,'admin@greatsolomon.test',1,'187.77.128.9','2026-09-24 18:52:49'),
(46,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 20:49:14'),
(47,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 20:51:31'),
(48,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-24 20:57:05'),
(49,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-09-24 20:57:53'),
(50,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-24 21:00:03'),
(51,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-25 08:59:02'),
(52,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-25 09:07:39'),
(53,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-09-25 09:09:24'),
(54,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-25 10:37:15'),
(55,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-25 16:29:49'),
(56,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-25 16:29:59'),
(57,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-25 19:24:29'),
(58,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-26 06:00:02'),
(59,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-26 18:38:50'),
(60,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 13:56:48'),
(61,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 16:53:42'),
(62,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 17:39:12'),
(63,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 18:07:23'),
(64,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 18:49:02'),
(65,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 19:37:22'),
(66,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-28 06:57:01'),
(67,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-28 17:15:53'),
(68,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-28 17:19:08'),
(69,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-28 20:36:07'),
(70,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 00:25:15'),
(71,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 00:31:06'),
(72,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 01:09:20'),
(73,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-29 01:09:36'),
(74,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 01:10:29'),
(75,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 01:10:49'),
(76,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 01:13:25'),
(77,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 01:20:56'),
(78,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 12:58:18'),
(79,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-29 13:02:14'),
(80,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 13:32:02'),
(81,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 13:32:05'),
(82,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 13:39:50'),
(83,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 14:42:49'),
(84,NULL,'joellajacabagernale@gmail.com',0,'187.77.128.9','2026-09-29 14:57:14'),
(85,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-29 14:57:56'),
(86,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 14:58:34'),
(87,NULL,'joellajacabagernale@gmail.com',0,'187.77.128.9','2026-09-29 14:59:20'),
(88,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-29 14:59:40'),
(89,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-29 15:22:34'),
(90,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-29 15:31:57'),
(91,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 16:08:18'),
(92,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-29 16:11:25'),
(93,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-29 17:16:17'),
(94,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 17:17:20'),
(95,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-29 17:29:05'),
(96,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 17:38:24'),
(97,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 18:40:15'),
(98,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-29 18:40:31'),
(99,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-29 19:36:51'),
(100,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-29 19:44:05'),
(101,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-30 03:53:27'),
(102,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-30 04:45:55'),
(103,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-09-30 05:26:23'),
(104,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-30 10:59:17'),
(105,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-09-30 11:13:26'),
(106,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-30 20:22:13'),
(107,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-30 21:46:29'),
(108,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-30 22:05:38'),
(109,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-30 23:13:54'),
(110,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-01 03:10:11'),
(111,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:16:34'),
(112,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:16:52'),
(113,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:17:14'),
(114,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:17:33'),
(115,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:17:58'),
(116,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:18:42'),
(117,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:19:30'),
(118,NULL,'zarahsotto17@gmail.com',0,'187.77.128.9','2026-10-01 03:19:39'),
(119,6,'zarahsotto17@gmail.com',1,'187.77.128.9','2026-10-01 03:20:59'),
(120,NULL,'conagshancai51@gmail.com',0,'187.77.128.9','2026-10-01 03:31:20'),
(121,NULL,'conagshancai51@gmail.com',0,'187.77.128.9','2026-10-01 03:32:35'),
(122,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-01 03:34:35'),
(123,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-01 03:36:20'),
(124,6,'zarahsotto17@gmail.com',1,'187.77.128.9','2026-10-01 03:36:49'),
(125,6,'zarahsotto17@gmail.com',1,'187.77.128.9','2026-10-01 04:27:17'),
(126,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-01 04:36:48'),
(127,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-01 04:37:41'),
(128,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-01 09:41:53'),
(129,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-01 09:48:58'),
(130,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-01 12:07:43'),
(131,6,'zarahsotto17@gmail.com',1,'187.77.128.9','2026-10-01 12:11:29'),
(132,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-01 12:11:43'),
(133,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-10-01 13:18:50'),
(134,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-01 13:21:16'),
(135,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-01 13:22:11'),
(136,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-10-01 13:24:05'),
(137,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-01 13:26:07'),
(138,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-10-01 13:36:49'),
(139,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-10-01 13:52:22'),
(140,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-01 14:10:55'),
(141,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-01 14:13:51'),
(142,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-01 14:16:29'),
(143,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-01 20:38:56'),
(144,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 02:04:30'),
(145,NULL,'shancaiconag519@gmail.com',0,'187.77.128.9','2026-10-02 02:05:12'),
(146,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 02:05:53'),
(147,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 04:11:02'),
(148,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 04:15:26'),
(149,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-02 04:15:43'),
(150,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 04:17:09'),
(151,6,'zarahsotto17@gmail.com',1,'187.77.128.9','2026-10-02 04:18:05'),
(152,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-02 10:20:13'),
(153,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-10-02 10:34:30'),
(154,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 11:00:06'),
(155,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-02 12:08:27'),
(156,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 12:17:46'),
(157,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 13:15:10'),
(158,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 14:47:11'),
(159,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 16:19:09'),
(160,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 16:22:50'),
(161,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 16:23:28'),
(162,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-02 16:44:42'),
(163,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 17:18:53'),
(164,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 17:41:10'),
(165,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 18:07:58'),
(166,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 18:22:27'),
(167,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 18:30:38'),
(168,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 18:42:23'),
(169,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 18:50:05'),
(170,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 19:12:20'),
(171,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 19:22:08'),
(172,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 19:35:19'),
(173,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-10-02 19:39:39'),
(174,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 20:28:24'),
(175,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 21:14:21'),
(176,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 21:37:21'),
(177,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 21:38:26'),
(178,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 21:57:26'),
(179,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 22:06:36'),
(180,NULL,'conagshancai51@gmail.com',0,'187.77.128.9','2026-10-02 22:34:59'),
(181,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 22:35:30'),
(182,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 22:37:08'),
(183,5,'joellajacabagernale@gmail.com',1,'187.77.128.9','2026-10-02 22:50:47'),
(184,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 22:53:52'),
(185,7,'conagshancai51@gmail.com',1,'187.77.128.9','2026-10-02 23:01:58'),
(186,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-02 23:19:43'),
(187,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-10-02 23:27:21'),
(188,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-10-02 23:52:40'),
(189,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-10-02 23:56:05'),
(190,4,'yojiieee.abiertas@gmail.com',1,'187.77.128.9','2026-10-03 00:13:27'),
(191,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-03 00:29:23'),
(192,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-10-03 00:30:37'),
(193,3,'ramosogerrymaejoy@gmail.com',1,'187.77.128.9','2026-10-03 08:37:10');
/*!40000 ALTER TABLE `login_history` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `otp_tickets`
--

DROP TABLE IF EXISTS `otp_tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `otp_tickets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticket` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `otp` varchar(6) NOT NULL,
  `expires_at` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket` (`ticket`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `otp_tickets`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `otp_tickets` WRITE;
/*!40000 ALTER TABLE `otp_tickets` DISABLE KEYS */;
/*!40000 ALTER TABLE `otp_tickets` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `po_activity`
--

DROP TABLE IF EXISTS `po_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `po_activity` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `po_id` int(11) DEFAULT NULL,
  `action` varchar(100) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `po_id` (`po_id`),
  KEY `idx_poact_created` (`created_at`),
  CONSTRAINT `po_activity_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `po_activity`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `po_activity` WRITE;
/*!40000 ALTER TABLE `po_activity` DISABLE KEYS */;
INSERT INTO `po_activity` VALUES
(1,4,'Created','Purchase order created by System Administrator','2026-09-22 18:16:42'),
(2,4,'Status Updated','Status changed to Sent to Vendor','2026-09-24 07:40:30'),
(3,2,'Status Updated','Status changed to Received. Notes: Items received: . Condition: Good. ','2026-09-24 07:41:24'),
(4,1,'Status Updated','Status changed to Sent to Vendor. Notes: Approved and sent to vendor','2026-09-30 11:03:41'),
(5,4,'Arrived (Simulated)','1 serialized assets staged at Receiving Dock by Franie Valiente','2026-10-02 13:35:27'),
(6,4,'Status Updated','Status changed to Received by Franie Valiente (ID 2). Notes: Items received: . Condition: Good. ','2026-10-02 16:28:41'),
(7,4,'Status Updated','Status changed to Received by Franie Valiente (ID 2). Notes: Items received: . Condition: Good. ','2026-10-02 16:28:45'),
(8,4,'Status Updated','Status changed to Received by Franie Valiente (ID 2). Notes: Items received: . Condition: Good. ','2026-10-02 16:28:48'),
(9,1,'Status Updated','Status changed to Received by Franie Valiente (ID 2). Notes: Items received: . Condition: Good. ','2026-10-02 16:42:06'),
(10,5,'Created','Purchase order created by Franie Valiente','2026-10-03 00:01:24'),
(11,6,'Created','Purchase order created by Franie Valiente','2026-10-03 00:03:18'),
(12,5,'Status Updated','Status changed to Pending Approval by Franie Valiente (ID 2). Notes: Submitted for approval','2026-10-03 00:03:33'),
(13,5,'Status Updated','Status changed to Sent to Vendor by Franie Valiente (ID 2). Notes: Approved and sent to vendor','2026-10-03 00:07:13'),
(14,5,'Status Updated','Status changed to Received by Franie Valiente (ID 2). Notes: Items received: . Condition: Good. ','2026-10-03 00:07:35'),
(15,5,'Status Updated','Status changed to Received by Franie Valiente (ID 2). Notes: Items received: . Condition: Good. ','2026-10-03 00:07:35'),
(16,6,'Status Updated','Status changed to Pending Approval by Franie Valiente (ID 2). Notes: Submitted for approval','2026-10-03 00:16:25');
/*!40000 ALTER TABLE `po_activity` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `po_id` int(11) DEFAULT NULL,
  `item_name` varchar(120) DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `unit_price` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `po_id` (`po_id`),
  CONSTRAINT `purchase_order_items_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_items`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `po_number` varchar(30) DEFAULT NULL,
  `vendor_id` int(11) DEFAULT NULL,
  `vendor` varchar(120) DEFAULT NULL,
  `total` decimal(12,2) DEFAULT NULL,
  `items` text DEFAULT NULL,
  `status` varchar(40) DEFAULT NULL,
  `expected_delivery` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL,
  `budget_code` varchar(40) DEFAULT NULL,
  `budget_status` varchar(40) DEFAULT NULL,
  `budget_approved_by` varchar(120) DEFAULT NULL,
  `budget_approved_date` datetime DEFAULT NULL,
  `external_po_reference` varchar(100) DEFAULT NULL,
  `requesting_system` varchar(80) DEFAULT NULL,
  `arrived_at` datetime DEFAULT NULL,
  `archived_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `archived_by` varchar(160) DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pos_status` (`status`),
  KEY `idx_pos_deleted` (`deleted_at`),
  KEY `idx_pos_expected` (`expected_delivery`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES
(1,'PO-2026-041',1,'TechSource Asia',284500.00,NULL,'Received',NULL,NULL,'2026-09-20 08:28:00','2026-10-02 16:42:06',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(2,'PO-2026-039',2,'Prime Devices Co.',156200.00,NULL,'Received',NULL,NULL,'2026-09-19 08:28:00','2026-09-24 07:41:24',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(3,'PO-2026-038',3,'Metro IT Supply',99100.00,NULL,'Received',NULL,NULL,'2026-09-17 08:28:00','2026-09-17 08:28:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(4,'PO-2026-004',2,'Prime Devices Co.',30000.00,'tables and chairs','Received','2026-10-10','','2026-09-22 18:16:42','2026-10-02 16:28:48',NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-02 13:35:27',NULL,NULL,NULL,NULL),
(5,'PO-2026-005',1,'TechSource Asia',42500.00,' 1x ASUS Vivobook 16\" Laptop (Intel Core i5, 16GB RAM, 512GB SSD) - Corporate Charcoal Black Grey color. Includes standard laptop backpack.','Received','2026-10-29',' Approved asset replacement for Requisition #1042. Please ensure the official warranty card is included inside the box upon delivery. Deliver directly to the 3rd Floor IT Helpdesk.','2026-10-03 00:01:23','2026-10-03 00:07:35',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(6,'PO-2026-006',2,'Prime Devices Co.',48500.00,'1x Lenovo ThinkPad E14 Gen 5 (Intel Core i5, 16GB RAM, 512GB SSD, Windows 11 Pro).','Pending Approval','2026-11-04',' Pre-approved replacement unit for Operations Department (Requisition #2026-089). Please deliver directly to the IT Department on the 3rd floor for provisioning.','2026-10-03 00:03:18','2026-10-03 00:16:25',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `requisitions`
--

DROP TABLE IF EXISTS `requisitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `requisitions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `req_number` varchar(30) NOT NULL,
  `title` varchar(200) NOT NULL,
  `department` varchar(60) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `estimated_cost` decimal(12,2) DEFAULT NULL,
  `actual_cost` decimal(12,2) DEFAULT NULL,
  `priority` varchar(20) DEFAULT 'Medium',
  `status` varchar(40) DEFAULT 'Draft',
  `needed_by` date DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `archived_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `purpose` varchar(200) DEFAULT NULL,
  `archived_by` varchar(160) DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `req_number` (`req_number`),
  KEY `created_by` (`created_by`),
  KEY `idx_reqs_status` (`status`),
  KEY `idx_reqs_deleted` (`deleted_at`),
  CONSTRAINT `requisitions_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `requisitions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `requisitions` WRITE;
/*!40000 ALTER TABLE `requisitions` DISABLE KEYS */;
INSERT INTO `requisitions` VALUES
(1,'REQ-2026-001','need new laptop','Finance','need 3 new laptop',300000.00,NULL,'High','Approved','2026-09-30',1,'2026-09-22 14:18:43',NULL,NULL,NULL,NULL,NULL),
(2,'REQ-2026-002','Office Laptop Maintenance ','Maintenance ','The system needed a maintenance checking ',30000.00,NULL,'Urgent','Approved','2026-09-30',5,'2026-09-29 15:45:19',NULL,NULL,NULL,NULL,NULL),
(3,'REQ-2026-003','Replacement laptops for finance.','Financial Management','Hardware Failure',20000.00,NULL,'Medium','Approved','2026-11-01',2,'2026-10-02 23:35:59',NULL,NULL,'Replacement',NULL,NULL),
(4,'REQ-2026-004',' Replacement Laptop for Senior Operations Specialist','Operation','1x Mid-range productivity laptop ',45000.00,NULL,'High','Submitted','2026-10-06',2,'2026-10-02 23:39:01',NULL,NULL,'Replacement',NULL,NULL),
(5,'REQ-2026-005','Workstation Laptop for Incoming Finance Analyst','Finance','1x Business laptop including necessary peripheral accessories (mouse and laptop bag) ',38000.00,NULL,'Medium','Submitted','2026-10-17',2,'2026-10-02 23:40:38',NULL,NULL,'New Equipment',NULL,NULL),
(6,'REQ-2026-006','Outdated Laptop Lifecycle Replacement','Human Resource','1x Standard office laptop. ',40000.00,NULL,'Low','Submitted','2026-11-03',2,'2026-10-02 23:41:53',NULL,NULL,'Replacement',NULL,NULL),
(7,'REQ-2026-007','High-Performance Laptop for Lead Marketing Designer','Marketing/Creative',' 1x Premium/Gaming tier laptop equipped with a dedicated graphics card (RTX 4060 or equivalent) and 32GB RAM',85000.00,NULL,'Medium','Submitted','2026-10-10',2,'2026-10-02 23:43:11',NULL,NULL,'New Equipment, Replacement',NULL,NULL),
(8,'REQ-2026-008','IT Buffer Inventory Deployment Laptops','IT Support',' 3x Entry-level fleet laptops (₱35,000 each) to replenish the spare IT inventory buffer pool.',105000.00,NULL,'Medium','Submitted','2026-10-29',2,'2026-10-02 23:44:22',NULL,NULL,'Stock Replenishment',NULL,NULL);
/*!40000 ALTER TABLE `requisitions` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(40) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=32865 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES
(1,'Admin'),
(2,'Manager'),
(3,'WarehouseStaff');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `scan_logs`
--

DROP TABLE IF EXISTS `scan_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `scan_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `asset_id` int(11) DEFAULT NULL,
  `qr_code` varchar(50) DEFAULT NULL,
  `action` varchar(60) NOT NULL,
  `details` text DEFAULT NULL,
  `scanned_by` varchar(120) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `collision` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_scan_asset` (`asset_id`),
  KEY `idx_scan_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `scan_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `scan_logs` WRITE;
/*!40000 ALTER TABLE `scan_logs` DISABLE KEYS */;
INSERT INTO `scan_logs` VALUES
(1,50,'AST-000002','Inventory Intake','Inventory Intake','Juan Dela Cruz',4,'187.77.128.9','2026-10-02 19:40:44',0),
(2,50,'AST-000002','Inventory Intake','COLLISION — Duplicate scan: the previous entry for this serial was also \'Inventory Intake\'.','Juan Dela Cruz',4,'187.77.128.9','2026-10-02 19:41:39',1),
(3,55,'AST-000007','Inventory Intake','Inventory Intake','Juan Dela Cruz',4,'187.77.128.9','2026-10-02 19:41:50',0),
(4,55,'AST-000007','Inventory Intake','COLLISION — Duplicate scan: the previous entry for this serial was also \'Inventory Intake\'.','Juan Dela Cruz',4,'187.77.128.9','2026-10-02 19:41:55',1),
(5,58,'AST-000010','Inventory Intake','Inventory Intake','Juan Dela Cruz',4,'187.77.128.9','2026-10-02 19:42:02',0);
/*!40000 ALTER TABLE `scan_logs` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `version` int(11) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES
(2,'2026-10-02 18:20:48'),
(3,'2026-10-02 18:41:48'),
(4,'2026-10-02 21:07:22'),
(5,'2026-10-02 22:05:33');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `session_tokens`
--

DROP TABLE IF EXISTS `session_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_tokens_expires` (`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `session_tokens`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `session_tokens` WRITE;
/*!40000 ALTER TABLE `session_tokens` DISABLE KEYS */;
INSERT INTO `session_tokens` VALUES
(85,'c1210d801881436892075c8ebc300737cb3b23b4fb18cb8540c5d92d037ab265',3,'2026-10-03 08:37:10','2026-10-03 16:37:10');
/*!40000 ALTER TABLE `session_tokens` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `stock_thresholds`
--

DROP TABLE IF EXISTS `stock_thresholds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_thresholds` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(60) NOT NULL,
  `min_quantity` int(11) NOT NULL DEFAULT 3,
  PRIMARY KEY (`id`),
  UNIQUE KEY `category` (`category`)
) ENGINE=InnoDB AUTO_INCREMENT=46993 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_thresholds`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `stock_thresholds` WRITE;
/*!40000 ALTER TABLE `stock_thresholds` DISABLE KEYS */;
INSERT INTO `stock_thresholds` VALUES
(1,'Laptop',5),
(2,'Monitor',5),
(3,'Peripheral',8),
(4,'Office Supplies',10),
(5,'IT Equipment',5);
/*!40000 ALTER TABLE `stock_thresholds` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `supplier_quotes`
--

DROP TABLE IF EXISTS `supplier_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_quotes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `requisition_id` int(11) DEFAULT NULL,
  `vendor_id` int(11) DEFAULT NULL,
  `quote_amount` decimal(12,2) DEFAULT NULL,
  `status` varchar(40) DEFAULT 'Pending',
  `valid_until` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `requisition_id` (`requisition_id`),
  KEY `vendor_id` (`vendor_id`),
  CONSTRAINT `supplier_quotes_ibfk_1` FOREIGN KEY (`requisition_id`) REFERENCES `requisitions` (`id`),
  CONSTRAINT `supplier_quotes_ibfk_2` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_quotes`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `supplier_quotes` WRITE;
/*!40000 ALTER TABLE `supplier_quotes` DISABLE KEYS */;
/*!40000 ALTER TABLE `supplier_quotes` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `system_integrations`
--

DROP TABLE IF EXISTS `system_integrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_integrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `system_name` varchar(80) NOT NULL,
  `system_type` varchar(40) NOT NULL,
  `api_endpoint` varchar(255) DEFAULT NULL,
  `api_key` varchar(255) NOT NULL,
  `api_secret` varchar(255) NOT NULL,
  `status` varchar(40) DEFAULT 'Active',
  `contact_email` varchar(160) DEFAULT NULL,
  `last_sync` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_integrations`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `system_integrations` WRITE;
/*!40000 ALTER TABLE `system_integrations` DISABLE KEYS */;
/*!40000 ALTER TABLE `system_integrations` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(40) NOT NULL DEFAULT 'WarehouseStaff',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `mfa_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `mfa_secret` varchar(255) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'System Administrator','admin@greatsolomon.test','$2y$10$7SxeHpt9pRnvI6ZI1/fGveW4t7WDJ7pjuxZTa5klRv2G/Yg7MB0Tu','Admin',0,'2026-09-21 13:22:56',0,NULL,NULL),
(2,'Franie Valiente','franvaliente24@gmail.com','$2y$10$Vg9o1xs6p5FngqBxAcxtTeIN8Cql1.a4TIpMKVSWd1bSE1OOYgHpi','Admin',1,'2026-09-21 14:10:24',1,'EF24E121F69807EAB439A0B099BCF9D4',NULL),
(3,'Gerry Ramoso','ramosogerrymaejoy@gmail.com','$2y$10$0DeELCX9h6duSomu8GGaE.O9lisUbz0V4FXBeCe0V74LPs5Kjm70S','Manager',1,'2026-09-21 14:19:17',1,NULL,NULL),
(4,'Juan Dela Cruz','yojiieee.abiertas@gmail.com','$2y$10$XtZltoGYILOF0AzKhBrVEOIOVeUXQKRfR2WJSR8Elh0uIpsbOrySq','WarehouseStaff',1,'2026-09-22 11:48:45',1,NULL,NULL),
(5,'Joella Gernale','joellajacabagernale@gmail.com','$2y$10$vRH5htGS4Cv9XDGskmCMnOI.dHFT6LMaFJOImm5vWRbqo5zWeMnCW','Manager',1,'2026-09-29 14:51:10',1,NULL,NULL),
(6,'Zarah Jane Sotto','zarahsotto17@gmail.com','$2y$10$9Vc3FMLftkH/1IYRY9jdHO2NHGG7YfE6tu1gOZ.dXDhvFTSwOiyJ.','Manager',1,'2026-09-29 14:52:13',1,NULL,NULL),
(7,'Shan Cai Conag','conagshancai51@gmail.com','$2y$10$ziUDSA06wq0SvQVeUKRfIuJu4rqiMSdwwrwuIrYwA4CK/ZGS4q3fC','Manager',1,'2026-09-29 14:53:35',1,NULL,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `vendors`
--

DROP TABLE IF EXISTS `vendors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vendors` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) DEFAULT NULL,
  `email` varchar(160) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `category` varchar(60) DEFAULT NULL,
  `on_time_rate` int(11) DEFAULT NULL,
  `defect_rate` decimal(4,1) DEFAULT NULL,
  `rating` decimal(3,1) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `archived_at` datetime DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  `auto_approve` tinyint(1) NOT NULL DEFAULT 0,
  `tax_compliant` tinyint(1) NOT NULL DEFAULT 0,
  `anti_bribery_clear` tinyint(1) NOT NULL DEFAULT 0,
  `certs` varchar(255) DEFAULT NULL,
  `coi_expiry` date DEFAULT NULL,
  `contract_ref` varchar(200) DEFAULT NULL,
  `archived_by` varchar(160) DEFAULT NULL,
  `archive_reason` varchar(255) DEFAULT NULL,
  `vendor_code` varchar(30) DEFAULT NULL,
  `verification_status` varchar(40) NOT NULL DEFAULT 'Pending',
  `onboarding_stage` varchar(60) NOT NULL DEFAULT 'Supplier Intake',
  `contract_expiry` date DEFAULT NULL,
  `lead_time_days` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vendors_deleted` (`deleted_at`),
  KEY `idx_vendors_archived` (`archived_at`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vendors`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `vendors` WRITE;
/*!40000 ALTER TABLE `vendors` DISABLE KEYS */;
INSERT INTO `vendors` VALUES
(1,'TechSource Asia',NULL,NULL,NULL,NULL,96,1.2,4.8,'2026-09-22 15:18:09',NULL,NULL,'Active',0,0,0,NULL,NULL,NULL,NULL,NULL,'VND-0001','Pending','Supplier Intake',NULL,NULL),
(2,'Prime Devices Co.',NULL,NULL,NULL,NULL,91,2.1,4.4,'2026-09-22 15:18:09',NULL,NULL,'Active',0,0,0,NULL,NULL,NULL,NULL,NULL,'VND-0002','Pending','Supplier Intake',NULL,NULL),
(3,'Metro IT Supply',NULL,NULL,NULL,NULL,87,3.8,4.0,'2026-09-22 15:18:09',NULL,NULL,'Active',0,0,0,NULL,NULL,NULL,NULL,NULL,'VND-0003','Pending','Supplier Intake',NULL,NULL),
(5,'Huawei Company ','huaweimanila@gmail.com','09162040270','','IT Equipment ',NULL,NULL,NULL,'2026-09-29 15:47:39',NULL,NULL,'Active',0,0,0,NULL,NULL,NULL,NULL,NULL,'VND-0005','Pending','Supplier Intake',NULL,NULL);
/*!40000 ALTER TABLE `vendors` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `warehouse_rows`
--

DROP TABLE IF EXISTS `warehouse_rows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `warehouse_rows` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `zone` varchar(20) NOT NULL,
  `row_num` varchar(10) NOT NULL,
  `capacity` int(11) NOT NULL DEFAULT 20,
  `occupied` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `zone` (`zone`),
  CONSTRAINT `warehouse_rows_ibfk_1` FOREIGN KEY (`zone`) REFERENCES `warehouse_zones` (`zone`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouse_rows`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `warehouse_rows` WRITE;
/*!40000 ALTER TABLE `warehouse_rows` DISABLE KEYS */;
INSERT INTO `warehouse_rows` VALUES
(1,'A','1',20,0),
(2,'A','2',20,0),
(3,'A','3',20,0),
(4,'A','4',20,0),
(5,'B','1',20,0),
(6,'B','2',20,0),
(7,'B','3',20,0),
(8,'B','4',20,0),
(9,'C','1',20,0),
(10,'C','2',20,0),
(11,'C','3',20,0),
(12,'C','4',20,0),
(13,'D','1',20,0),
(14,'D','2',20,0),
(15,'D','3',20,0),
(16,'D','4',20,0),
(17,'E','1',25,0),
(18,'E','2',25,0),
(19,'E','3',25,0),
(20,'E','4',25,0),
(21,'Zone F','1',25,0),
(22,'Zone F','2',25,0),
(23,'Zone F','3',25,0),
(24,'Zone F','4',25,0);
/*!40000 ALTER TABLE `warehouse_rows` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `warehouse_shelves`
--

DROP TABLE IF EXISTS `warehouse_shelves`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `warehouse_shelves` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `zone` varchar(20) DEFAULT NULL,
  `capacity` int(11) DEFAULT NULL,
  `occupied` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouse_shelves`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `warehouse_shelves` WRITE;
/*!40000 ALTER TABLE `warehouse_shelves` DISABLE KEYS */;
INSERT INTO `warehouse_shelves` VALUES
(1,'A',100,32),
(2,'B',100,68),
(3,'C',100,91),
(4,'D',100,48);
/*!40000 ALTER TABLE `warehouse_shelves` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `warehouse_zones`
--

DROP TABLE IF EXISTS `warehouse_zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `warehouse_zones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `zone` varchar(20) NOT NULL,
  `capacity` int(11) NOT NULL DEFAULT 100,
  `occupied` int(11) NOT NULL DEFAULT 0,
  `category` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `zone` (`zone`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouse_zones`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `warehouse_zones` WRITE;
/*!40000 ALTER TABLE `warehouse_zones` DISABLE KEYS */;
INSERT INTO `warehouse_zones` VALUES
(1,'A',100,0,'IT Equipment'),
(2,'B',100,3,'Laptops'),
(3,'C',100,0,'Monitors'),
(4,'D',100,0,'Peripheral'),
(5,'E',100,0,'Office Supplies'),
(7,'Zone F',100,0,NULL),
(8,'DISPOSAL',200,0,'Disposed Assets');
/*!40000 ALTER TABLE `warehouse_zones` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `webhook_logs`
--

DROP TABLE IF EXISTS `webhook_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `webhook_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `webhook_id` int(11) NOT NULL,
  `event_id` varchar(50) DEFAULT NULL,
  `event_type` varchar(80) NOT NULL,
  `payload` text NOT NULL,
  `response_code` int(11) DEFAULT NULL,
  `response_body` text DEFAULT NULL,
  `delivery_status` varchar(40) DEFAULT 'Pending',
  `attempt_number` int(11) DEFAULT 1,
  `next_retry_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `webhook_id` (`webhook_id`),
  CONSTRAINT `webhook_logs_ibfk_1` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `webhook_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `webhook_logs` WRITE;
/*!40000 ALTER TABLE `webhook_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `webhook_logs` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `webhooks`
--

DROP TABLE IF EXISTS `webhooks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `webhooks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `webhook_id` varchar(30) NOT NULL,
  `system_integration_id` int(11) DEFAULT NULL,
  `event_types` text NOT NULL,
  `target_url` varchar(255) NOT NULL,
  `webhook_secret` varchar(255) NOT NULL,
  `active` tinyint(1) DEFAULT 1,
  `retry_policy` varchar(40) DEFAULT 'exponential',
  `max_retries` int(11) DEFAULT 3,
  `last_triggered` datetime DEFAULT NULL,
  `success_count` int(11) DEFAULT 0,
  `failure_count` int(11) DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `webhook_id` (`webhook_id`),
  KEY `system_integration_id` (`system_integration_id`),
  CONSTRAINT `webhooks_ibfk_1` FOREIGN KEY (`system_integration_id`) REFERENCES `system_integrations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `webhooks`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `webhooks` WRITE;
/*!40000 ALTER TABLE `webhooks` DISABLE KEYS */;
/*!40000 ALTER TABLE `webhooks` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-10-05 11:41:13
