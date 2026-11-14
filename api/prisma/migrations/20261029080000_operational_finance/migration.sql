-- DropForeignKey
ALTER TABLE `Collection` DROP FOREIGN KEY `Collection_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `Collection` DROP FOREIGN KEY `Collection_companyId_deliveryId_fkey`;

-- DropForeignKey
ALTER TABLE `Remittance` DROP FOREIGN KEY `Remittance_companyId_agencyId_confirmedById_fkey`;

-- DropForeignKey
ALTER TABLE `RemittanceItem` DROP FOREIGN KEY `RemittanceItem_companyId_fkey`;

-- DropIndex
DROP INDEX `Collection_companyId_deliveryId_key` ON `Collection`;

-- DropIndex
DROP INDEX `RemittanceItem_companyId_collectionId_key` ON `RemittanceItem`;

-- AlterTable
ALTER TABLE `DeliveryAssignment` ADD COLUMN `collectionRequiredSnapshot` BOOLEAN NULL,
    ADD COLUMN `currencySnapshot` CHAR(3) NULL,
    ADD COLUMN `expectedAmountSnapshot` DECIMAL(19, 4) NULL;

-- AlterTable
ALTER TABLE `Collection` ADD COLUMN `legacySlot` TINYINT UNSIGNED NULL DEFAULT 1,
    ADD COLUMN `operationKey` VARCHAR(100) NULL,
    ADD COLUMN `reference` VARCHAR(60) NULL,
    ADD COLUMN `requestHash` CHAR(64) NULL,
    ADD COLUMN `version` INTEGER UNSIGNED NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `Remittance` ADD COLUMN `decision` VARCHAR(24) NULL,
    ADD COLUMN `decisionReason` VARCHAR(1000) NULL,
    ADD COLUMN `operationKey` VARCHAR(100) NULL,
    ADD COLUMN `requestHash` CHAR(64) NULL,
    ADD COLUMN `version` INTEGER UNSIGNED NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `RemittanceItem` ADD COLUMN `amount` DECIMAL(19, 4) NULL,
    ADD COLUMN `confirmedAmount` DECIMAL(19, 4) NULL,
    ADD COLUMN `legacySlot` TINYINT UNSIGNED NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `FinancialCorrection` (
    `exceptional` BOOLEAN NOT NULL DEFAULT false,
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `collectionId` CHAR(36) NULL,
    `remittanceItemId` CHAR(36) NULL,
    `kind` VARCHAR(20) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `fromAmount` DECIMAL(19, 4) NOT NULL,
    `toAmount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `externalReference` VARCHAR(160) NULL,
    `requestedById` CHAR(36) NOT NULL,
    `decidedById` CHAR(36) NULL,
    `decisionReason` VARCHAR(1000) NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialCorrection_companyId_agencyId_status_createdAt_idx`(`companyId`, `agencyId`, `status`, `createdAt`),
    INDEX `FinancialCorrection_companyId_collectionId_status_idx`(`companyId`, `collectionId`, `status`),
    INDEX `FinancialCorrection_companyId_remittanceItemId_status_idx`(`companyId`, `remittanceItemId`, `status`),
    INDEX `FinancialCorrection_companyId_deliveryId_kind_status_idx`(`companyId`, `deliveryId`, `kind`, `status`),
    UNIQUE INDEX `FinancialCorrection_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialDiscrepancy` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NULL,
    `collectionId` CHAR(36) NULL,
    `remittanceId` CHAR(36) NULL,
    `kind` VARCHAR(32) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `description` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `createdById` CHAR(36) NOT NULL,
    `resolvedById` CHAR(36) NULL,
    `resolution` VARCHAR(1000) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `sourceKey` VARCHAR(160) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialDiscrepancy_companyId_agencyId_status_createdAt_idx`(`companyId`, `agencyId`, `status`, `createdAt`),
    INDEX `FinancialDiscrepancy_companyId_courierId_status_idx`(`companyId`, `courierId`, `status`),
    UNIQUE INDEX `FinancialDiscrepancy_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `FinancialDiscrepancy_companyId_reference_key`(`companyId`, `reference`),
    UNIQUE INDEX `FinancialDiscrepancy_companyId_sourceKey_key`(`companyId`, `sourceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NULL,
    `actorId` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NULL,
    `collectionId` CHAR(36) NULL,
    `remittanceId` CHAR(36) NULL,
    `correctionId` CHAR(36) NULL,
    `discrepancyId` CHAR(36) NULL,
    `action` VARCHAR(50) NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `previousStatus` VARCHAR(24) NULL,
    `status` VARCHAR(24) NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `reason` VARCHAR(1000) NULL,
    `metadata` JSON NULL,
    `operationKey` VARCHAR(100) NULL,
    `requestHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialEvent_companyId_agencyId_createdAt_id_idx`(`companyId`, `agencyId`, `createdAt`, `id`),
    INDEX `FinancialEvent_companyId_courierId_createdAt_idx`(`companyId`, `courierId`, `createdAt`),
    INDEX `FinancialEvent_companyId_orderId_createdAt_idx`(`companyId`, `orderId`, `createdAt`),
    UNIQUE INDEX `FinancialEvent_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `FinancialEvent_companyId_operationKey_key`(`companyId`, `operationKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Collection_companyId_deliveryId_legacySlot_key` ON `Collection`(`companyId`, `deliveryId`, `legacySlot`);

-- CreateIndex
CREATE UNIQUE INDEX `Collection_companyId_operationKey_key` ON `Collection`(`companyId`, `operationKey`);

-- CreateIndex
CREATE UNIQUE INDEX `Collection_companyId_reference_key` ON `Collection`(`companyId`, `reference`);

-- CreateIndex
CREATE UNIQUE INDEX `Remittance_companyId_operationKey_key` ON `Remittance`(`companyId`, `operationKey`);

-- CreateIndex
CREATE UNIQUE INDEX `RemittanceItem_companyId_collectionId_legacySlot_key` ON `RemittanceItem`(`companyId`, `collectionId`, `legacySlot`);

-- CreateIndex
CREATE UNIQUE INDEX `RemittanceItem_companyId_remittanceId_collectionId_key` ON `RemittanceItem`(`companyId`, `remittanceId`, `collectionId`);

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Remittance` ADD CONSTRAINT `Remittance_companyId_confirmedById_fkey` FOREIGN KEY (`companyId`, `confirmedById`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceItem` ADD CONSTRAINT `RemittanceItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Contextual integrity, immutable documentary ledger, additive reference grants.
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_company_fk` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_agency_fk` FOREIGN KEY (`companyId`,`agencyId`) REFERENCES `Agency` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_courier_fk` FOREIGN KEY (`companyId`,`agencyId`,`courierId`) REFERENCES `AgencyMembership` (`companyId`,`agencyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_collectionId_fk` FOREIGN KEY (`companyId`,`collectionId`) REFERENCES `Collection` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_remittanceItemId_fk` FOREIGN KEY (`companyId`,`remittanceItemId`) REFERENCES `RemittanceItem` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_deliveryId_fk` FOREIGN KEY (`companyId`,`deliveryId`) REFERENCES `Delivery` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_company_fk` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_agency_fk` FOREIGN KEY (`companyId`,`agencyId`) REFERENCES `Agency` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_courier_fk` FOREIGN KEY (`companyId`,`agencyId`,`courierId`) REFERENCES `AgencyMembership` (`companyId`,`agencyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_collectionId_fk` FOREIGN KEY (`companyId`,`collectionId`) REFERENCES `Collection` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_remittanceId_fk` FOREIGN KEY (`companyId`,`remittanceId`) REFERENCES `Remittance` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_deliveryId_fk` FOREIGN KEY (`companyId`,`deliveryId`) REFERENCES `Delivery` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_company_fk` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_agency_fk` FOREIGN KEY (`companyId`,`agencyId`) REFERENCES `Agency` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_courier_fk` FOREIGN KEY (`companyId`,`agencyId`,`courierId`) REFERENCES `AgencyMembership` (`companyId`,`agencyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_collectionId_fk` FOREIGN KEY (`companyId`,`collectionId`) REFERENCES `Collection` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_remittanceId_fk` FOREIGN KEY (`companyId`,`remittanceId`) REFERENCES `Remittance` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_orderId_fk` FOREIGN KEY (`companyId`,`orderId`) REFERENCES `Order` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_correctionId_fk` FOREIGN KEY (`companyId`,`correctionId`) REFERENCES `FinancialCorrection` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_discrepancyId_fk` FOREIGN KEY (`companyId`,`discrepancyId`) REFERENCES `FinancialDiscrepancy` (`companyId`,`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_requestedById_fk` FOREIGN KEY (`companyId`,`requestedById`) REFERENCES `CompanyMembership` (`companyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialCorrection` ADD CONSTRAINT `FinancialCorrection_decidedById_fk` FOREIGN KEY (`companyId`,`decidedById`) REFERENCES `CompanyMembership` (`companyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_createdById_fk` FOREIGN KEY (`companyId`,`createdById`) REFERENCES `CompanyMembership` (`companyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialDiscrepancy` ADD CONSTRAINT `FinancialDiscrepancy_resolvedById_fk` FOREIGN KEY (`companyId`,`resolvedById`) REFERENCES `CompanyMembership` (`companyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `FinancialEvent` ADD CONSTRAINT `FinancialEvent_actor_fk` FOREIGN KEY (`companyId`,`actorId`) REFERENCES `CompanyMembership` (`companyId`,`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE FinancialCorrection ADD CONSTRAINT chk_fin_correction_amount CHECK(fromAmount>=0 AND toAmount>=0 AND REGEXP_LIKE(currency,'^[A-Z]{3}$','c')),
 ADD CONSTRAINT chk_fin_correction_target CHECK((kind IN('EXPECTED','EXCEPTION') AND collectionId IS NULL AND remittanceItemId IS NULL) OR (kind IN('COLLECTION','REFUND') AND collectionId IS NOT NULL AND remittanceItemId IS NULL) OR (kind='RECEIPT' AND collectionId IS NOT NULL AND remittanceItemId IS NOT NULL)),
 ADD CONSTRAINT chk_fin_correction_independent CHECK(decidedById IS NULL OR (decidedById<>requestedById AND (courierId IS NULL OR decidedById<>courierId))),
 ADD CONSTRAINT chk_fin_correction_decision CHECK(status='PENDING' OR (decidedById IS NOT NULL AND decidedAt IS NOT NULL AND decisionReason IS NOT NULL));
ALTER TABLE FinancialDiscrepancy ADD CONSTRAINT chk_fin_discrepancy CHECK(amount>=0 AND REGEXP_LIKE(currency,'^[A-Z]{3}$','c') AND status IN('OPEN','REVIEW','RESOLVED','CLOSED') AND (collectionId IS NOT NULL OR remittanceId IS NOT NULL OR deliveryId IS NOT NULL));
ALTER TABLE FinancialEvent ADD CONSTRAINT chk_fin_event_amount CHECK(amount>=0 AND REGEXP_LIKE(currency,'^[A-Z]{3}$','c'));
ALTER TABLE Collection ADD CONSTRAINT chk_collection_traced CHECK(operationKey IS NULL OR (legacySlot IS NULL AND reference IS NOT NULL AND requestHash IS NOT NULL AND declaredAmount IS NOT NULL AND declaredAt IS NOT NULL AND method IS NOT NULL AND status='DECLARED'));
ALTER TABLE RemittanceItem ADD CONSTRAINT chk_remittance_item_amount CHECK((legacySlot IS NOT NULL OR amount IS NOT NULL) AND (amount IS NULL OR amount>0) AND (confirmedAmount IS NULL OR confirmedAmount>=0));
ALTER TABLE Remittance ADD CONSTRAINT chk_remittance_traced CHECK(operationKey IS NULL OR (requestHash IS NOT NULL AND declaredAmount>0 AND (confirmedAt IS NULL OR (confirmedById IS NOT NULL AND confirmedAmount IS NOT NULL AND decision IN('CONFIRM','DISPUTE','REJECT','REQUEST_CORRECTION')))));
CREATE TRIGGER FinancialEvent_immutable_update BEFORE UPDATE ON FinancialEvent FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial events are immutable';
CREATE TRIGGER FinancialEvent_immutable_delete BEFORE DELETE ON FinancialEvent FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial events are immutable';
CREATE TRIGGER Collection_traced_update BEFORE UPDATE ON Collection FOR EACH ROW
BEGIN
 IF OLD.operationKey IS NOT NULL AND (NOT(NEW.companyId<=>OLD.companyId) OR NOT(NEW.deliveryId<=>OLD.deliveryId) OR NOT(NEW.agencyId<=>OLD.agencyId) OR NOT(NEW.courierId<=>OLD.courierId) OR NOT(NEW.expectedAmount<=>OLD.expectedAmount) OR NOT(NEW.declaredAmount<=>OLD.declaredAmount) OR NOT(NEW.currency<=>OLD.currency) OR NOT(NEW.method<=>OLD.method) OR NOT(NEW.status<=>OLD.status) OR NOT(NEW.declaredAt<=>OLD.declaredAt) OR NOT(NEW.notes<=>OLD.notes) OR NOT(NEW.operationKey<=>OLD.operationKey) OR NOT(NEW.reference<=>OLD.reference) OR NOT(NEW.requestHash<=>OLD.requestHash) OR NOT(NEW.legacySlot<=>OLD.legacySlot)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Collection declarations are immutable; use approved corrections'; END IF;
END;
CREATE TRIGGER Collection_traced_delete BEFORE DELETE ON Collection FOR EACH ROW
BEGIN IF OLD.operationKey IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Collection declarations cannot be deleted'; END IF; END;
CREATE TRIGGER Remittance_traced_update BEFORE UPDATE ON Remittance FOR EACH ROW
BEGIN
 IF OLD.operationKey IS NOT NULL AND (OLD.confirmedAt IS NOT NULL OR NOT(NEW.companyId<=>OLD.companyId) OR NOT(NEW.reference<=>OLD.reference) OR NOT(NEW.agencyId<=>OLD.agencyId) OR NOT(NEW.courierId<=>OLD.courierId) OR NOT(NEW.declaredAmount<=>OLD.declaredAmount) OR NOT(NEW.currency<=>OLD.currency) OR NOT(NEW.declaredAt<=>OLD.declaredAt) OR NOT(NEW.notes<=>OLD.notes) OR NOT(NEW.operationKey<=>OLD.operationKey) OR NOT(NEW.requestHash<=>OLD.requestHash)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Remittance declarations and decided receipts are immutable'; END IF;
END;
CREATE TRIGGER Remittance_traced_delete BEFORE DELETE ON Remittance FOR EACH ROW
BEGIN IF OLD.operationKey IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Remittances cannot be deleted'; END IF; END;
CREATE TRIGGER RemittanceItem_traced_update BEFORE UPDATE ON RemittanceItem FOR EACH ROW
BEGIN
 IF OLD.legacySlot IS NULL AND (OLD.confirmedAmount IS NOT NULL OR NOT(NEW.amount<=>OLD.amount) OR NOT(NEW.companyId<=>OLD.companyId) OR NOT(NEW.remittanceId<=>OLD.remittanceId) OR NOT(NEW.collectionId<=>OLD.collectionId) OR NOT(NEW.agencyId<=>OLD.agencyId) OR NOT(NEW.courierId<=>OLD.courierId) OR NOT(NEW.currency<=>OLD.currency) OR NOT(NEW.legacySlot<=>OLD.legacySlot)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Remittance allocation and decided receipt are immutable'; END IF;
END;
CREATE TRIGGER RemittanceItem_traced_delete BEFORE DELETE ON RemittanceItem FOR EACH ROW
BEGIN IF OLD.legacySlot IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Remittance allocations cannot be deleted'; END IF; END;
CREATE TRIGGER FinancialCorrection_immutable_update BEFORE UPDATE ON FinancialCorrection FOR EACH ROW
BEGIN
 IF OLD.status<>'PENDING' OR NOT(NEW.companyId<=>OLD.companyId) OR NOT(NEW.agencyId<=>OLD.agencyId) OR NOT(NEW.courierId<=>OLD.courierId) OR NOT(NEW.deliveryId<=>OLD.deliveryId) OR NOT(NEW.collectionId<=>OLD.collectionId) OR NOT(NEW.remittanceItemId<=>OLD.remittanceItemId) OR NOT(NEW.kind<=>OLD.kind) OR NOT(NEW.fromAmount<=>OLD.fromAmount) OR NOT(NEW.toAmount<=>OLD.toAmount) OR NOT(NEW.currency<=>OLD.currency) OR NOT(NEW.reason<=>OLD.reason) OR NOT(NEW.requestedById<=>OLD.requestedById) OR NOT(NEW.exceptional<=>OLD.exceptional) OR NOT(NEW.externalReference<=>OLD.externalReference) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Correction requests and decisions are immutable'; END IF;
END;
CREATE TRIGGER FinancialCorrection_immutable_delete BEFORE DELETE ON FinancialCorrection FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Corrections cannot be deleted';
CREATE TRIGGER FinancialDiscrepancy_identity_update BEFORE UPDATE ON FinancialDiscrepancy FOR EACH ROW
BEGIN
 IF NOT(NEW.companyId<=>OLD.companyId) OR NOT(NEW.agencyId<=>OLD.agencyId) OR NOT(NEW.courierId<=>OLD.courierId) OR NOT(NEW.deliveryId<=>OLD.deliveryId) OR NOT(NEW.collectionId<=>OLD.collectionId) OR NOT(NEW.remittanceId<=>OLD.remittanceId) OR NOT(NEW.kind<=>OLD.kind) OR NOT(NEW.amount<=>OLD.amount) OR NOT(NEW.currency<=>OLD.currency) OR NOT(NEW.description<=>OLD.description) OR NOT(NEW.createdById<=>OLD.createdById) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial discrepancies retain their original statement'; END IF;
END;
CREATE TRIGGER FinancialDiscrepancy_immutable_delete BEFORE DELETE ON FinancialDiscrepancy FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial discrepancies cannot be deleted';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'collections.read','collections.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.supervise.read','financial.supervise.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'remittances.read','remittances.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'remittances.confirm','remittances.confirm',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.discrepancies.manage','financial.discrepancies.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.corrections.request','financial.corrections.request',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'collections.expected.request','collections.expected.request',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.history.read','financial.history.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.corrections.approve','financial.corrections.approve',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'collections.expected.exception','collections.expected.exception',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'collections.self.read','collections.self.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'collections.declare','collections.declare',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'remittances.self.read','remittances.self.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'remittances.declare','remittances.declare',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.corrections.self.request','financial.corrections.self.request',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'financial.history.self.read','financial.history.self.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.collections.read','shop.collections.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('collections.read','financial.supervise.read','remittances.read','remittances.confirm','financial.discrepancies.manage','financial.corrections.request','collections.expected.request','financial.history.read','financial.corrections.approve','collections.expected.exception') WHERE r.code='company_admin' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('collections.read','financial.supervise.read','remittances.read','remittances.confirm','financial.discrepancies.manage','financial.corrections.request','collections.expected.request','financial.history.read') WHERE r.code='agency_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('collections.self.read','collections.declare','remittances.self.read','remittances.declare','financial.corrections.self.request','financial.history.self.read') WHERE r.code='courier' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.collections.read') WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.collections.read') WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.collections.read') WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
