-- AlterTable
ALTER TABLE `Delivery` ADD COLUMN `custodyAgencyId` CHAR(36) NULL,
    ADD COLUMN `custodyType` VARCHAR(16) NULL,
    ADD COLUMN `custodyUserId` CHAR(36) NULL,
    ADD COLUMN `parcelReference` VARCHAR(80) NULL,
    ADD COLUMN `phase` VARCHAR(40) NULL,
    ADD COLUMN `stockIssuedAt` DATETIME(3) NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `DeliveryAssignment` ADD COLUMN `activeSlot` TINYINT UNSIGNED NULL,
    ADD COLUMN `purpose` VARCHAR(16) NOT NULL DEFAULT 'FINAL';

-- AlterTable
ALTER TABLE `DeliveryEvent` ADD COLUMN `action` VARCHAR(60) NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN `agencyId` CHAR(36) NULL,
    ADD COLUMN `fromCustody` JSON NULL,
    ADD COLUMN `fromPhase` VARCHAR(40) NULL,
    ADD COLUMN `metadata` JSON NULL,
    ADD COLUMN `operationKey` VARCHAR(100) NULL,
    ADD COLUMN `previousStatus` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'CANCELLED') NULL,
    ADD COLUMN `requestHash` CHAR(64) NULL,
    ADD COLUMN `toCustody` JSON NULL,
    ADD COLUMN `toPhase` VARCHAR(40) NULL;

-- CreateTable
CREATE TABLE `ParcelLeg` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `originAgencyId` CHAR(36) NOT NULL,
    `destinationAgencyId` CHAR(36) NOT NULL,
    `transporterId` CHAR(36) NOT NULL,
    `createdById` CHAR(36) NOT NULL,
    `receivedById` CHAR(36) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `activeSlot` TINYINT UNSIGNED NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isReturn` BOOLEAN NOT NULL DEFAULT false,
    `dispatchedAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `condition` VARCHAR(12) NULL,
    `notes` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ParcelLeg_companyId_destinationAgencyId_status_createdAt_idx`(`companyId`, `destinationAgencyId`, `status`, `createdAt`),
    UNIQUE INDEX `ParcelLeg_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `ParcelLeg_companyId_deliveryId_activeSlot_key`(`companyId`, `deliveryId`, `activeSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParcelHandover` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `fromCourierId` CHAR(36) NOT NULL,
    `targetCourierId` CHAR(36) NOT NULL,
    `createdById` CHAR(36) NOT NULL,
    `confirmedById` CHAR(36) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    `activeSlot` TINYINT UNSIGNED NULL,
    `condition` VARCHAR(12) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `confirmedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ParcelHandover_companyId_targetCourierId_status_idx`(`companyId`, `targetCourierId`, `status`),
    UNIQUE INDEX `ParcelHandover_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `ParcelHandover_companyId_deliveryId_activeSlot_key`(`companyId`, `deliveryId`, `activeSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryAttempt` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `result` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(20) NULL,
    `notes` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryAttempt_companyId_deliveryId_createdAt_idx`(`companyId`, `deliveryId`, `createdAt`),
    UNIQUE INDEX `DeliveryAttempt_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryIncident` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `description` VARCHAR(1000) NOT NULL,
    `blocking` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    `version` INTEGER NOT NULL DEFAULT 1,
    `decision` VARCHAR(16) NULL,
    `resolutionReason` VARCHAR(500) NULL,
    `resolvedById` CHAR(36) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryIncident_companyId_agencyId_status_createdAt_idx`(`companyId`, `agencyId`, `status`, `createdAt`),
    UNIQUE INDEX `DeliveryIncident_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryReturn` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `receivedById` CHAR(36) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'REQUESTED',
    `condition` VARCHAR(12) NULL,
    `receivedAt` DATETIME(3) NULL,
    `reintegratedAt` DATETIME(3) NULL,
    `returnedToShopAt` DATETIME(3) NULL,
    `notes` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryReturn_companyId_agencyId_status_createdAt_idx`(`companyId`, `agencyId`, `status`, `createdAt`),
    UNIQUE INDEX `DeliveryReturn_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `DeliveryReturn_companyId_deliveryId_key`(`companyId`, `deliveryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Delivery_parcelReference_key` ON `Delivery`(`parcelReference`);

-- CreateIndex
CREATE UNIQUE INDEX `DeliveryAssignment_companyId_deliveryId_activeSlot_key` ON `DeliveryAssignment`(`companyId`, `deliveryId`, `activeSlot`);

-- CreateIndex
CREATE UNIQUE INDEX `DeliveryEvent_companyId_operationKey_key` ON `DeliveryEvent`(`companyId`, `operationKey`);

-- AddForeignKey
ALTER TABLE `ParcelLeg` ADD CONSTRAINT `ParcelLeg_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ParcelHandover` ADD CONSTRAINT `ParcelHandover_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryAttempt` ADD CONSTRAINT `DeliveryAttempt_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryIncident` ADD CONSTRAINT `DeliveryIncident_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryReturn` ADD CONSTRAINT `DeliveryReturn_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Scalar contextual foreign keys are intentionally preserved outside Prisma relations.
ALTER TABLE Delivery ADD CONSTRAINT Delivery_custody_agency_fk FOREIGN KEY(companyId,custodyAgencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT Delivery_custody_user_fk FOREIGN KEY(companyId,custodyUserId) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT chk_parcel_custody CHECK (phase IS NULL OR (custodyType IS NOT NULL AND ((custodyType='SHOP' AND custodyAgencyId IS NULL AND custodyUserId IS NULL) OR (custodyType='AGENCY' AND custodyAgencyId IS NOT NULL AND custodyUserId IS NULL) OR (custodyType IN ('COURIER','TRANSPORT') AND custodyAgencyId IS NOT NULL AND custodyUserId IS NOT NULL))));
ALTER TABLE DeliveryAssignment ADD CONSTRAINT chk_assignment_active_slot CHECK (activeSlot IS NULL OR (activeSlot=1 AND endedAt IS NULL));
ALTER TABLE DeliveryEvent ADD CONSTRAINT DeliveryEvent_agency_fk FOREIGN KEY(companyId,agencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ParcelLeg ADD CONSTRAINT ParcelLeg_origin_fk FOREIGN KEY(companyId,originAgencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelLeg_destination_fk FOREIGN KEY(companyId,destinationAgencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelLeg_transporter_fk FOREIGN KEY(companyId,originAgencyId,transporterId) REFERENCES AgencyMembership(companyId,agencyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelLeg_actor_fk FOREIGN KEY(companyId,createdById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelLeg_receiver_fk FOREIGN KEY(companyId,receivedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT chk_parcel_leg_distinct CHECK(originAgencyId<>destinationAgencyId),
 ADD CONSTRAINT chk_parcel_leg_active CHECK((status IN ('DRAFT','IN_TRANSIT') AND activeSlot IS NOT NULL AND activeSlot=1) OR (status IN ('RECEIVED','CANCELLED') AND activeSlot IS NULL)),
 ADD CONSTRAINT chk_parcel_leg_receipt CHECK(status<>'RECEIVED' OR (receivedAt IS NOT NULL AND receivedById IS NOT NULL AND `condition` IS NOT NULL));
ALTER TABLE ParcelHandover ADD CONSTRAINT ParcelHandover_from_fk FOREIGN KEY(companyId,agencyId,fromCourierId) REFERENCES AgencyMembership(companyId,agencyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelHandover_target_fk FOREIGN KEY(companyId,agencyId,targetCourierId) REFERENCES AgencyMembership(companyId,agencyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelHandover_actor_fk FOREIGN KEY(companyId,createdById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT ParcelHandover_confirmer_fk FOREIGN KEY(companyId,confirmedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT chk_parcel_handover_distinct CHECK(fromCourierId<>targetCourierId),
 ADD CONSTRAINT chk_parcel_handover_active CHECK((status='PENDING' AND activeSlot IS NOT NULL AND activeSlot=1) OR (status IN ('ACCEPTED','REJECTED','CANCELLED') AND activeSlot IS NULL));
ALTER TABLE DeliveryAttempt ADD CONSTRAINT DeliveryAttempt_courier_fk FOREIGN KEY(companyId,courierId) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT chk_delivery_attempt_result CHECK(result IN ('FAILED','AWAITING_CONFIRMATION')),
 ADD CONSTRAINT chk_delivery_attempt_failure CHECK(result<>'FAILED' OR (reason IS NOT NULL AND LENGTH(TRIM(reason))>0 AND notes IS NOT NULL AND LENGTH(TRIM(notes))>0));
ALTER TABLE DeliveryIncident ADD CONSTRAINT DeliveryIncident_agency_fk FOREIGN KEY(companyId,agencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT DeliveryIncident_actor_fk FOREIGN KEY(companyId,actorId) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT DeliveryIncident_resolver_fk FOREIGN KEY(companyId,resolvedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT chk_delivery_incident_status CHECK(status IN ('OPEN','RESOLVED')),
 ADD CONSTRAINT chk_delivery_incident_resolution CHECK(status<>'RESOLVED' OR (decision IS NOT NULL AND resolutionReason IS NOT NULL AND resolvedAt IS NOT NULL AND resolvedById IS NOT NULL));
ALTER TABLE DeliveryReturn ADD CONSTRAINT DeliveryReturn_agency_fk FOREIGN KEY(companyId,agencyId) REFERENCES Agency(companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT DeliveryReturn_actor_fk FOREIGN KEY(companyId,actorId) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT DeliveryReturn_receiver_fk FOREIGN KEY(companyId,receivedById) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT chk_delivery_return_status CHECK(status IN ('REQUESTED','IN_TRANSIT','RECEIVED','SHOP_RETURNED')),
 ADD CONSTRAINT chk_delivery_return_receipt CHECK(status NOT IN ('RECEIVED','SHOP_RETURNED') OR (receivedAt IS NOT NULL AND `condition` IS NOT NULL AND receivedById IS NOT NULL)),
 ADD CONSTRAINT chk_delivery_return_stock CHECK(reintegratedAt IS NULL OR (receivedAt IS NOT NULL AND `condition`='GOOD' AND returnedToShopAt IS NULL));
CREATE TRIGGER DeliveryAttempt_immutable_update BEFORE UPDATE ON DeliveryAttempt FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Delivery attempts are immutable';
CREATE TRIGGER DeliveryAttempt_immutable_delete BEFORE DELETE ON DeliveryAttempt FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Delivery attempts are immutable';

-- Explicit, additive reference grants.
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.read','deliveries.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.supervise.read','deliveries.supervise.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.assign','deliveries.assign',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.prepare','deliveries.prepare',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.receive','deliveries.receive',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.transfer','deliveries.transfer',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.incident.report','deliveries.incident.report',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.incidents','deliveries.incidents',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.returns','deliveries.returns',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.returns.receive','deliveries.returns.receive',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.cancel','deliveries.cancel',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.amount.read','deliveries.amount.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.self.read','deliveries.self.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.pickup','deliveries.pickup',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.progress','deliveries.progress',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.attempt','deliveries.attempt',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'deliveries.handover.accept','deliveries.handover.accept',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.deliveries.read','shop.deliveries.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('deliveries.read','deliveries.supervise.read','deliveries.assign','deliveries.prepare','deliveries.receive','deliveries.transfer','deliveries.incident.report','deliveries.incidents','deliveries.returns','deliveries.returns.receive','deliveries.cancel','deliveries.amount.read') WHERE r.code='company_admin' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('deliveries.read','deliveries.supervise.read','deliveries.assign','deliveries.prepare','deliveries.receive','deliveries.transfer','deliveries.incident.report','deliveries.incidents','deliveries.returns','deliveries.returns.receive','deliveries.cancel','deliveries.amount.read') WHERE r.code='agency_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('deliveries.read','deliveries.supervise.read','deliveries.prepare','deliveries.receive','deliveries.incident.report') WHERE r.code='agency_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('deliveries.read','deliveries.supervise.read','deliveries.prepare','deliveries.receive') WHERE r.code='stock_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('deliveries.read','deliveries.self.read','deliveries.pickup','deliveries.progress','deliveries.attempt','deliveries.incident.report','deliveries.handover.accept','deliveries.amount.read') WHERE r.code='courier' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.deliveries.read') WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.deliveries.read') WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.deliveries.read') WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);

