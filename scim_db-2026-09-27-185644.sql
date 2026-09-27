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
  CONSTRAINT `asset_transactions_ibfk_1` FOREIGN KEY (`asset_id`) REFERENCES `assets` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_transactions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `asset_transactions` WRITE;
/*!40000 ALTER TABLE `asset_transactions` DISABLE KEYS */;
INSERT INTO `asset_transactions` VALUES
(1,1,'Contractor Check-Out',NULL,'2026-09-21 08:20:00'),
(2,2,'Inventory Intake',NULL,'2026-09-21 08:01:00'),
(3,4,'Asset Transfer',NULL,'2026-09-21 07:36:00'),
(4,7,'Inventory Intake',NULL,'2026-09-22 18:35:53');
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `qr_code` (`qr_code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assets`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `assets` WRITE;
/*!40000 ALTER TABLE `assets` DISABLE KEYS */;
INSERT INTO `assets` VALUES
(1,'QR-LAP-001','MacBook Pro 14','Laptop',124500.00,'Deployed','Manila HQ','2026-09-22 15:18:09',NULL,NULL,NULL,NULL,NULL,NULL),
(2,'QR-MON-014','Dell UltraSharp 27','Monitor',28900.00,'In Warehouse','Zone B-02','2026-09-22 15:18:09',NULL,NULL,NULL,NULL,NULL,NULL),
(3,'QR-LAP-021','ThinkPad X1 Carbon','Laptop',99800.00,'In Maintenance','Service Bay','2026-09-22 15:18:09',NULL,NULL,NULL,NULL,NULL,NULL),
(4,'QR-KEY-008','Logitech MX Keys','Peripheral',6200.00,'In Warehouse','Zone A-04','2026-09-22 15:18:09',NULL,NULL,NULL,NULL,NULL,NULL),
(7,'QR-LAP-','SWIFT GO SFG14-75-55MB OPI Steam Blue','Laptop',61749.00,'In Warehouse','Zone A, Row 1, Shelf 3','2026-09-22 15:18:09',NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `assets` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
(3,NULL,'Status Updated','Status changed to Verified','2026-09-24 09:19:53');
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_logs`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `document_logs` WRITE;
/*!40000 ALTER TABLE `document_logs` DISABLE KEYS */;
INSERT INTO `document_logs` VALUES
(1,'Equipment Accountability Form','EAF-2026-117','Juan Dela Cruz','2026-09-23','Awaiting signature',NULL,NULL,NULL),
(2,'Courier Receipt','CR-2026-088','Warehouse Team','2026-09-21','Verified',NULL,NULL,NULL),
(3,'Vendor Invoice','INV-2026-302','Finance','2026-09-25','For verification',NULL,NULL,NULL);
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference_no` (`reference_no`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
INSERT INTO `documents` VALUES
(1,'Contract','Con-2026-001','IT','test','','2026-09-22','Pending Verification','2026-09-22 13:00:23','2026-09-22 13:00:23'),
(2,'Contract','Con-2026-002','IT','test','','2026-09-22','Verified','2026-09-22 13:00:27','2026-09-24 09:19:53');
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `integration_audit_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `integration_audit_log` WRITE;
/*!40000 ALTER TABLE `integration_audit_log` DISABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=889 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
(64,2,'franvaliente24@gmail.com',1,'187.77.128.9','2026-09-27 18:49:02');
/*!40000 ALTER TABLE `login_history` ENABLE KEYS */;
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
  CONSTRAINT `po_activity_ibfk_1` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
(3,2,'Status Updated','Status changed to Received. Notes: Items received: . Condition: Good. ','2026-09-24 07:41:24');
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES
(1,'PO-2026-041',1,'TechSource Asia',284500.00,NULL,'Pending Approval',NULL,NULL,'2026-09-20 08:28:00','2026-09-20 08:28:00',NULL,NULL,NULL,NULL,NULL,NULL),
(2,'PO-2026-039',2,'Prime Devices Co.',156200.00,NULL,'Received',NULL,NULL,'2026-09-19 08:28:00','2026-09-24 07:41:24',NULL,NULL,NULL,NULL,NULL,NULL),
(3,'PO-2026-038',3,'Metro IT Supply',99100.00,NULL,'Received',NULL,NULL,'2026-09-17 08:28:00','2026-09-17 08:28:00',NULL,NULL,NULL,NULL,NULL,NULL),
(4,'PO-2026-004',2,'Prime Devices Co.',30000.00,'tables and chairs','Sent to Vendor','2026-10-10','','2026-09-22 18:16:42','2026-09-24 07:40:30',NULL,NULL,NULL,NULL,NULL,NULL);
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `req_number` (`req_number`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `requisitions_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `requisitions`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `requisitions` WRITE;
/*!40000 ALTER TABLE `requisitions` DISABLE KEYS */;
INSERT INTO `requisitions` VALUES
(1,'REQ-2026-001','need new laptop','Finance','need 3 new laptop',300000.00,NULL,'High','Draft','2026-09-30',1,'2026-09-22 14:18:43');
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
) ENGINE=InnoDB AUTO_INCREMENT=3172 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES
(1,'System Administrator','admin@greatsolomon.test','$2y$10$7SxeHpt9pRnvI6ZI1/fGveW4t7WDJ7pjuxZTa5klRv2G/Yg7MB0Tu','Admin',1,'2026-09-21 13:22:56',0,NULL),
(2,'Franie Valiente','franvaliente24@gmail.com','$2y$10$Vg9o1xs6p5FngqBxAcxtTeIN8Cql1.a4TIpMKVSWd1bSE1OOYgHpi','Admin',1,'2026-09-21 14:10:24',0,'4D42CEF91F4430D0A76D6D8108879A26'),
(3,'Gerry Ramoso','ramosogerrymaejoy@gmail.com','$2y$10$0DeELCX9h6duSomu8GGaE.O9lisUbz0V4FXBeCe0V74LPs5Kjm70S','Manager',1,'2026-09-21 14:19:17',0,NULL),
(4,'Joella Gernale','yojiieee.abiertas@gmail.com','$2y$10$XtZltoGYILOF0AzKhBrVEOIOVeUXQKRfR2WJSR8Elh0uIpsbOrySq','WarehouseStaff',1,'2026-09-22 11:48:45',0,NULL);
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vendors`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `vendors` WRITE;
/*!40000 ALTER TABLE `vendors` DISABLE KEYS */;
INSERT INTO `vendors` VALUES
(1,'TechSource Asia',NULL,NULL,NULL,NULL,96,1.2,4.8,'2026-09-22 15:18:09'),
(2,'Prime Devices Co.',NULL,NULL,NULL,NULL,91,2.1,4.4,'2026-09-22 15:18:09'),
(3,'Metro IT Supply',NULL,NULL,NULL,NULL,87,3.8,4.0,'2026-09-22 15:18:09'),
(4,'EVERAFTER','ramosogerrymaejoy@gmail.com','09065283246','Phase 6 package 4 block 15 lot 7 Camiling street Brgy 178 Camarin Caloocan City','Office Supplies',NULL,NULL,NULL,'2026-09-22 18:13:31');
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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouse_rows`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `warehouse_rows` WRITE;
/*!40000 ALTER TABLE `warehouse_rows` DISABLE KEYS */;
INSERT INTO `warehouse_rows` VALUES
(1,'A','1',20,6),
(2,'A','2',20,8),
(3,'A','3',20,10),
(4,'A','4',20,8),
(5,'B','1',20,12),
(6,'B','2',20,14),
(7,'B','3',20,18),
(8,'B','4',20,24),
(9,'C','1',20,20),
(10,'C','2',20,19),
(11,'C','3',20,18),
(12,'C','4',20,17),
(13,'D','1',20,10),
(14,'D','2',20,12),
(15,'D','3',20,13),
(16,'D','4',20,13);
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `zone` (`zone`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouse_zones`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `warehouse_zones` WRITE;
/*!40000 ALTER TABLE `warehouse_zones` DISABLE KEYS */;
INSERT INTO `warehouse_zones` VALUES
(1,'A',100,32),
(2,'B',100,68),
(3,'C',100,91),
(4,'D',100,48);
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

-- Dump completed on 2026-09-27 18:56:43
