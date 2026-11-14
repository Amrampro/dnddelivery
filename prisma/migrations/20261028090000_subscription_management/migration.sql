-- Additive: historical payments keep NULL in fields unavailable in previous blocks.
ALTER TABLE `Subscription` ADD COLUMN `lastActivatedAt` DATETIME(3) NULL;
ALTER TABLE `SubscriptionPayment`
 ADD COLUMN `paidAt` DATETIME(3) NULL,
 ADD COLUMN `rejectionReason` VARCHAR(500) NULL,
 ADD COLUMN `idempotencyKey` CHAR(36) NULL,
 ADD COLUMN `duplicateKey` CHAR(64) NULL,
 ADD UNIQUE INDEX `SubscriptionPayment_companyId_idempotencyKey_key` (`companyId`,`idempotencyKey`),
 ADD UNIQUE INDEX `SubscriptionPayment_duplicateKey_key` (`duplicateKey`),
 ADD INDEX `SubscriptionPayment_status_createdAt_idx` (`status`,`createdAt`);
-- Fails safely if legacy data violates the one-active-offer rule; never rewrites prices.
ALTER TABLE `SubscriptionPlan` ADD CONSTRAINT `chk_active_plan_slot` CHECK (active = false OR referenceSlot = 1);
INSERT INTO Permission (id,code,description,createdAt,updatedAt) VALUES (UUID(),'subscriptions.declare','Déclarer un règlement externe',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission (id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='subscriptions.declare' WHERE r.code='company_admin' AND r.scope='COMPANY';
CREATE TRIGGER `SubscriptionPayment_final_immutable` BEFORE UPDATE ON `SubscriptionPayment` FOR EACH ROW
BEGIN
 IF OLD.status <> 'PENDING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Processed subscription payments are immutable'; END IF;
END;
