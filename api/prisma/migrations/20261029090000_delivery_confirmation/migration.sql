-- AlterTable
ALTER TABLE `Order` ADD COLUMN `trackingVersion` INTEGER UNSIGNED NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `DeliveryOtp` ADD COLUMN `activeSlot` TINYINT UNSIGNED NULL,
    ADD COLUMN `assignmentId` CHAR(36) NULL,
    ADD COLUMN `consumedAt` DATETIME(3) NULL,
    ADD COLUMN `invalidatedAt` DATETIME(3) NULL,
    ADD COLUMN `sealedCode` TEXT NULL,
    ADD COLUMN `validationExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `verifiedById` CHAR(36) NULL,
    MODIFY `status` ENUM('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED', 'REVOKED', 'CONSUMED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `DeliveryProof` ADD COLUMN `assignmentId` CHAR(36) NULL,
    ADD COLUMN `confirmedById` CHAR(36) NULL,
    ADD COLUMN `exceptionId` CHAR(36) NULL,
    ADD COLUMN `operationKey` VARCHAR(100) NULL,
    ADD COLUMN `requestHash` CHAR(64) NULL;

-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `deliveryState` VARCHAR(24) NULL,
    ADD COLUMN `providerAcceptedAt` DATETIME(3) NULL,
    ADD COLUMN `providerMessageId` VARCHAR(190) NULL;

-- CreateTable
CREATE TABLE `TrackingAccess` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `version` INTEGER UNSIGNED NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `sealedToken` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TrackingAccess_tokenHash_key`(`tokenHash`),
    INDEX `TrackingAccess_companyId_orderId_kind_expiresAt_idx`(`companyId`, `orderId`, `kind`, `expiresAt`),
    UNIQUE INDEX `TrackingAccess_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TrackingThrottle` (
    `key` CHAR(64) NOT NULL,
    `count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `resetsAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpAttempt` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `otpId` CHAR(36) NULL,
    `actorId` CHAR(36) NOT NULL,
    `outcome` VARCHAR(32) NOT NULL,
    `operationKey` VARCHAR(100) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpAttempt_companyId_deliveryId_createdAt_idx`(`companyId`, `deliveryId`, `createdAt`),
    UNIQUE INDEX `OtpAttempt_companyId_operationKey_key`(`companyId`, `operationKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OtpException` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `requestedById` CHAR(36) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `decidedById` CHAR(36) NULL,
    `decisionReason` VARCHAR(1000) NULL,
    `decidedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpException_companyId_deliveryId_status_idx`(`companyId`, `deliveryId`, `status`),
    UNIQUE INDEX `OtpException_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryEvidence` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `fileId` CHAR(36) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'READY',
    `proofId` CHAR(36) NULL,
    `operationKey` VARCHAR(100) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeliveryEvidence_fileId_key`(`fileId`),
    INDEX `DeliveryEvidence_companyId_deliveryId_status_idx`(`companyId`, `deliveryId`, `status`),
    UNIQUE INDEX `DeliveryEvidence_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `DeliveryEvidence_companyId_operationKey_key`(`companyId`, `operationKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationAttempt` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `notificationId` CHAR(36) NOT NULL,
    `attempt` INTEGER UNSIGNED NOT NULL,
    `outcome` VARCHAR(24) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotificationAttempt_companyId_createdAt_idx`(`companyId`, `createdAt`),
    UNIQUE INDEX `NotificationAttempt_notificationId_attempt_key`(`notificationId`, `attempt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `DeliveryAssignment_companyId_id_deliveryId_courierId_key` ON `DeliveryAssignment`(`companyId`, `id`, `deliveryId`, `courierId`);

-- CreateIndex
CREATE UNIQUE INDEX `DeliveryOtp_companyId_deliveryId_activeSlot_key` ON `DeliveryOtp`(`companyId`, `deliveryId`, `activeSlot`);

-- CreateIndex
CREATE UNIQUE INDEX `DeliveryProof_companyId_operationKey_key` ON `DeliveryProof`(`companyId`, `operationKey`);
ALTER TABLE `TrackingAccess` ADD CONSTRAINT `tracking_order_fk` FOREIGN KEY (companyId,orderId) REFERENCES `Order` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpAttempt` ADD CONSTRAINT `OtpAttempt_delivery_fk` FOREIGN KEY (companyId,deliveryId) REFERENCES `Delivery` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpException` ADD CONSTRAINT `OtpException_delivery_fk` FOREIGN KEY (companyId,deliveryId) REFERENCES `Delivery` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryEvidence` ADD CONSTRAINT `DeliveryEvidence_delivery_fk` FOREIGN KEY (companyId,deliveryId) REFERENCES `Delivery` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpAttempt` ADD CONSTRAINT `otp_attempt_source_fk` FOREIGN KEY (companyId,otpId) REFERENCES `DeliveryOtp` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpException` ADD CONSTRAINT `OtpException_assignment_fk` FOREIGN KEY (companyId,assignmentId,deliveryId,courierId) REFERENCES `DeliveryAssignment` (companyId,id,deliveryId,courierId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryEvidence` ADD CONSTRAINT `DeliveryEvidence_assignment_fk` FOREIGN KEY (companyId,assignmentId,deliveryId,courierId) REFERENCES `DeliveryAssignment` (companyId,id,deliveryId,courierId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_assignment_fk` FOREIGN KEY (companyId,assignmentId,deliveryId,courierId) REFERENCES `DeliveryAssignment` (companyId,id,deliveryId,courierId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpException` ADD CONSTRAINT `OtpException_agency_fk` FOREIGN KEY (companyId,agencyId) REFERENCES `Agency` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryEvidence` ADD CONSTRAINT `DeliveryEvidence_agency_fk` FOREIGN KEY (companyId,agencyId) REFERENCES `Agency` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryEvidence` ADD CONSTRAINT `evidence_file_fk` FOREIGN KEY (companyId,fileId) REFERENCES `FileAsset` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryEvidence` ADD CONSTRAINT `evidence_proof_fk` FOREIGN KEY (companyId,proofId) REFERENCES `DeliveryProof` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `proof_exception_fk` FOREIGN KEY (companyId,exceptionId) REFERENCES `OtpException` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `NotificationAttempt` ADD CONSTRAINT `notification_attempt_fk` FOREIGN KEY (companyId,notificationId) REFERENCES `Notification` (companyId,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpAttempt` ADD CONSTRAINT `OtpAttempt_actorId_user_fk` FOREIGN KEY (actorId) REFERENCES `User` (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpException` ADD CONSTRAINT `OtpException_requestedById_user_fk` FOREIGN KEY (requestedById) REFERENCES `User` (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `OtpException` ADD CONSTRAINT `OtpException_decidedById_user_fk` FOREIGN KEY (decidedById) REFERENCES `User` (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_confirmedById_user_fk` FOREIGN KEY (confirmedById) REFERENCES `User` (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `DeliveryOtp_verifiedById_user_fk` FOREIGN KEY (verifiedById) REFERENCES `User` (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE Delivery DROP CHECK chk_parcel_custody,
ADD CONSTRAINT chk_parcel_custody CHECK (phase IS NULL OR (custodyType IS NOT NULL AND ((custodyType IN ('SHOP','RECIPIENT') AND custodyAgencyId IS NULL AND custodyUserId IS NULL) OR (custodyType='AGENCY' AND custodyAgencyId IS NOT NULL AND custodyUserId IS NULL) OR (custodyType IN ('COURIER','TRANSPORT') AND custodyAgencyId IS NOT NULL AND custodyUserId IS NOT NULL)))),
ADD CONSTRAINT chk_recipient_custody CHECK (custodyType <> 'RECIPIENT' OR (status='DELIVERED' AND phase='DELIVERED' AND closedAt IS NOT NULL));
ALTER TABLE TrackingAccess ADD CONSTRAINT chk_tracking_kind CHECK (kind IN ('LINK','SESSION'));
ALTER TABLE OtpException ADD CONSTRAINT chk_exception_status CHECK (status IN ('PENDING','APPROVED','REJECTED','REVOKED','CONSUMED')),
ADD CONSTRAINT chk_exception_distinct CHECK (decidedById IS NULL OR (decidedById<>courierId AND decidedById<>requestedById)),
ADD CONSTRAINT chk_exception_decision CHECK (status NOT IN ('APPROVED','REJECTED','CONSUMED') OR (decidedById IS NOT NULL AND decidedAt IS NOT NULL AND LENGTH(TRIM(decisionReason))>=5));
ALTER TABLE DeliveryEvidence ADD CONSTRAINT chk_evidence_kind CHECK (kind IN ('HANDOVER','FAILURE')),
ADD CONSTRAINT chk_evidence_status CHECK ((status='READY' AND proofId IS NULL) OR (status='ATTACHED' AND proofId IS NOT NULL));
ALTER TABLE DeliveryOtp ADD CONSTRAINT chk_otp_consumption CHECK (status<>'CONSUMED' OR (consumedAt IS NOT NULL AND verifiedAt IS NOT NULL AND activeSlot IS NULL));
DROP TRIGGER DeliveryOtp_no_reuse;
CREATE TRIGGER DeliveryOtp_no_reuse BEFORE UPDATE ON DeliveryOtp FOR EACH ROW
BEGIN
 IF OLD.status IN ('CONSUMED','REVOKED') OR NOT(OLD.id<=>NEW.id AND OLD.companyId<=>NEW.companyId AND OLD.deliveryId<=>NEW.deliveryId AND OLD.courierId<=>NEW.courierId AND OLD.codeHash<=>NEW.codeHash AND OLD.sealedCode<=>NEW.sealedCode AND OLD.assignmentId<=>NEW.assignmentId AND OLD.expiresAt<=>NEW.expiresAt AND OLD.maxAttempts<=>NEW.maxAttempts) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OTP source is immutable'; END IF;
 IF OLD.status='VERIFIED' AND (NEW.status NOT IN ('REVOKED','CONSUMED') OR NOT(OLD.verifiedAt<=>NEW.verifiedAt AND OLD.verifiedById<=>NEW.verifiedById AND OLD.validationExpiresAt<=>NEW.validationExpiresAt AND OLD.attempts<=>NEW.attempts) OR NEW.activeSlot IS NOT NULL) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Verified OTP cannot be rewritten'; END IF;
END;
CREATE TRIGGER Delivery_confirmed_proof_required BEFORE UPDATE ON Delivery FOR EACH ROW
BEGIN
 IF NEW.phase IS NOT NULL AND NEW.status='DELIVERED' AND OLD.status<>'DELIVERED' AND NOT EXISTS (
 SELECT 1 FROM DeliveryProof p WHERE p.companyId=NEW.companyId AND p.deliveryId=NEW.id AND p.courierId=NEW.courierId AND p.operationKey IS NOT NULL
 AND (SELECT COUNT(*) FROM ProofPhoto ph WHERE ph.companyId=p.companyId AND ph.proofId=p.id)>=IF(p.method='AUTHORIZED_EXCEPTION',2,1)
 ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Final delivery requires complete proof'; END IF;
END;
CREATE TRIGGER Evidence_preserve_source BEFORE UPDATE ON DeliveryEvidence FOR EACH ROW
BEGIN
 IF OLD.status='ATTACHED' OR NOT(OLD.companyId<=>NEW.companyId AND OLD.deliveryId<=>NEW.deliveryId AND OLD.agencyId<=>NEW.agencyId AND OLD.courierId<=>NEW.courierId AND OLD.assignmentId<=>NEW.assignmentId AND OLD.fileId<=>NEW.fileId AND OLD.kind<=>NEW.kind AND OLD.operationKey<=>NEW.operationKey AND OLD.requestHash<=>NEW.requestHash) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Evidence source is immutable'; END IF;
END;
CREATE TRIGGER OtpException_preserve_request BEFORE UPDATE ON OtpException FOR EACH ROW
BEGIN
 IF NOT(OLD.companyId<=>NEW.companyId AND OLD.deliveryId<=>NEW.deliveryId AND OLD.agencyId<=>NEW.agencyId AND OLD.assignmentId<=>NEW.assignmentId AND OLD.courierId<=>NEW.courierId AND OLD.requestedById<=>NEW.requestedById AND OLD.reason<=>NEW.reason AND OLD.expiresAt<=>NEW.expiresAt) OR (OLD.status<>'PENDING' AND (NOT(OLD.decidedById<=>NEW.decidedById AND OLD.decisionReason<=>NEW.decisionReason AND OLD.decidedAt<=>NEW.decidedAt) OR OLD.status<>'APPROVED' OR NEW.status NOT IN ('CONSUMED','REVOKED'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Exception request and decision are immutable'; END IF;
END;
CREATE TRIGGER OtpAttempt_immutable_update BEFORE UPDATE ON OtpAttempt FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Security history is immutable';
CREATE TRIGGER OtpAttempt_immutable_delete BEFORE DELETE ON OtpAttempt FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Security history is immutable';
CREATE TRIGGER NotificationAttempt_immutable_update BEFORE UPDATE ON NotificationAttempt FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Security history is immutable';
CREATE TRIGGER NotificationAttempt_immutable_delete BEFORE DELETE ON NotificationAttempt FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Security history is immutable';
CREATE TRIGGER DeliveryEvidence_no_delete BEFORE DELETE ON DeliveryEvidence FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Proof history must be preserved';
CREATE TRIGGER OtpException_no_delete BEFORE DELETE ON OtpException FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Proof history must be preserved';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.proofs.read','delivery.proofs.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.otp.manage','delivery.otp.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.exceptions.approve','delivery.exceptions.approve',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'tracking.manage','tracking.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.notifications.read','delivery.notifications.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.proofs.self.read','delivery.proofs.self.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.otp.verify','delivery.otp.verify',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.proofs.upload','delivery.proofs.upload',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.complete','delivery.complete',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'delivery.exceptions.request','delivery.exceptions.request',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.delivery.proofs.read','shop.delivery.proofs.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.delivery.notifications.read','shop.delivery.notifications.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('delivery.proofs.read','delivery.otp.manage','delivery.exceptions.approve','tracking.manage','delivery.notifications.read') WHERE r.code='company_admin' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('delivery.proofs.read','delivery.otp.manage','delivery.exceptions.approve','tracking.manage','delivery.notifications.read') WHERE r.code='agency_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('delivery.proofs.self.read','delivery.otp.verify','delivery.proofs.upload','delivery.complete','delivery.exceptions.request') WHERE r.code='courier' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.delivery.proofs.read','shop.delivery.notifications.read') WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.delivery.proofs.read','shop.delivery.notifications.read') WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code IN ('shop.delivery.proofs.read','shop.delivery.notifications.read') WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
