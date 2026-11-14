-- Additional MySQL 8.0.16+ integrity constraints. Keep these when creating future migrations.
ALTER TABLE `GlobalRoleGrant` ADD CONSTRAINT `chk_global_scope` CHECK (roleScope = 'GLOBAL');
ALTER TABLE `CompanyMembership` ADD CONSTRAINT `chk_company_scope` CHECK (roleScope = 'COMPANY');
ALTER TABLE `AgencyMembership` ADD CONSTRAINT `chk_agency_scope` CHECK (roleScope = 'AGENCY');
ALTER TABLE `ShopMembership` ADD CONSTRAINT `chk_shop_scope` CHECK (roleScope = 'SHOP');
ALTER TABLE `CompanyShop` ADD CONSTRAINT `chk_collaboration_dates` CHECK (endedAt IS NULL OR (startedAt IS NOT NULL AND endedAt >= startedAt));
ALTER TABLE `Stock` ADD CONSTRAINT `chk_stock_available` CHECK (reservedQuantity <= physicalQuantity);
ALTER TABLE `Transfer` ADD CONSTRAINT `chk_different_agencies` CHECK (originAgencyId <> destinationAgencyId);
ALTER TABLE `Transfer` ADD CONSTRAINT `chk_transfer_dates` CHECK (receivedAt IS NULL OR (departedAt IS NOT NULL AND receivedAt >= departedAt));
ALTER TABLE `Transfer` ADD CONSTRAINT `chk_received_transfer` CHECK (status <> 'RECEIVED' OR receivedAt IS NOT NULL);
ALTER TABLE `Transfer` ADD CONSTRAINT `chk_in_transit_departure` CHECK (status <> 'IN_TRANSIT' OR departedAt IS NOT NULL);
ALTER TABLE `TransferItem` ADD CONSTRAINT `chk_transfer_quantity` CHECK (quantity > 0);
ALTER TABLE `Recipient` ADD CONSTRAINT `chk_recipient_contact` CHECK (LENGTH(TRIM(email)) > 0 AND LENGTH(TRIM(phone)) > 0 AND LENGTH(TRIM(address)) > 0);
ALTER TABLE `Recipient` ADD CONSTRAINT `chk_recipient_latitude` CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE `Recipient` ADD CONSTRAINT `chk_recipient_longitude` CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
ALTER TABLE `Order` ADD CONSTRAINT `chk_order_amount` CHECK (amountToCollect >= 0);
ALTER TABLE `Order` ADD CONSTRAINT `chk_order_contact` CHECK (LENGTH(TRIM(recipientEmail)) > 0 AND LENGTH(TRIM(recipientPhone)) > 0 AND LENGTH(TRIM(recipientAddress)) > 0);
ALTER TABLE `Order` ADD CONSTRAINT `chk_order_currency` CHECK (REGEXP_LIKE(currency, '^[A-Z]{3}$', 'c'));
ALTER TABLE `Order` ADD CONSTRAINT `chk_order_latitude` CHECK (recipientLatitude IS NULL OR recipientLatitude BETWEEN -90 AND 90);
ALTER TABLE `Order` ADD CONSTRAINT `chk_order_longitude` CHECK (recipientLongitude IS NULL OR recipientLongitude BETWEEN -180 AND 180);
ALTER TABLE `OrderItem` ADD CONSTRAINT `chk_order_item_quantity` CHECK (quantity > 0);
ALTER TABLE `StockReservation` ADD CONSTRAINT `chk_reservation_quantity` CHECK (quantity > 0);
ALTER TABLE `StockReservation` ADD CONSTRAINT `chk_reservation_terminal` CHECK (releasedAt IS NULL OR consumedAt IS NULL);
ALTER TABLE `StockMovement` ADD CONSTRAINT `chk_movement_available` CHECK (reservedAfter <= physicalAfter);
ALTER TABLE `StockMovement` ADD CONSTRAINT `chk_movement_delta` CHECK (physicalDelta <> 0 OR reservedDelta <> 0);
ALTER TABLE `StockMovement` ADD CONSTRAINT `chk_movement_transfer` CHECK (type NOT IN ('TRANSFER_OUT','TRANSFER_IN') OR transferId IS NOT NULL);
ALTER TABLE `StockMovement` ADD CONSTRAINT `chk_movement_reservation` CHECK (type NOT IN ('RESERVE','RELEASE') OR reservationId IS NOT NULL);
ALTER TABLE `Delivery` ADD CONSTRAINT `chk_assigned_courier` CHECK (status NOT IN ('ASSIGNED','IN_PROGRESS','DELIVERED') OR (courierId IS NOT NULL AND assignedAt IS NOT NULL));
ALTER TABLE `Delivery` ADD CONSTRAINT `chk_delivery_closed` CHECK (status NOT IN ('DELIVERED','FAILED','CANCELLED') OR closedAt IS NOT NULL);
ALTER TABLE `Delivery` ADD CONSTRAINT `chk_delivery_failure` CHECK (status <> 'FAILED' OR (failureReason IS NOT NULL AND LENGTH(TRIM(failureReason)) > 0));
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `chk_otp_attempts` CHECK (maxAttempts > 0 AND attempts <= maxAttempts);
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `chk_otp_hash` CHECK (LENGTH(codeHash) >= 64);
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `chk_otp_verified` CHECK (status <> 'VERIFIED' OR verifiedAt IS NOT NULL);
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `chk_proof_method` CHECK ((method = 'OTP' AND otpId IS NOT NULL AND exceptionAuthorizedById IS NULL) OR (method = 'AUTHORIZED_EXCEPTION' AND otpId IS NULL AND exceptionAuthorizedById IS NOT NULL AND exceptionAuthorizedById <> courierId AND exceptionReason IS NOT NULL AND LENGTH(TRIM(exceptionReason)) > 0));
ALTER TABLE `FileAsset` ADD CONSTRAINT `chk_file_size` CHECK (sizeBytes > 0);
ALTER TABLE `Collection` ADD CONSTRAINT `chk_collection_amounts` CHECK (expectedAmount >= 0 AND (declaredAmount IS NULL OR declaredAmount >= 0));
ALTER TABLE `Collection` ADD CONSTRAINT `chk_collection_declared` CHECK (status NOT IN ('DECLARED','VERIFIED','DISPUTED') OR (declaredAmount IS NOT NULL AND method IS NOT NULL AND declaredAt IS NOT NULL));
ALTER TABLE `Collection` ADD CONSTRAINT `chk_collection_verified` CHECK (status <> 'VERIFIED' OR (verifiedById IS NOT NULL AND verifiedAt IS NOT NULL));
ALTER TABLE `Collection` ADD CONSTRAINT `chk_collection_currency` CHECK (REGEXP_LIKE(currency, '^[A-Z]{3}$', 'c'));
ALTER TABLE `Remittance` ADD CONSTRAINT `chk_remittance_amounts` CHECK (declaredAmount >= 0 AND (confirmedAmount IS NULL OR confirmedAmount >= 0));
ALTER TABLE `Remittance` ADD CONSTRAINT `chk_remittance_independent` CHECK (confirmedById IS NULL OR confirmedById <> courierId);
ALTER TABLE `Remittance` ADD CONSTRAINT `chk_remittance_confirmed` CHECK (status <> 'CONFIRMED' OR (confirmedAmount IS NOT NULL AND confirmedById IS NOT NULL AND confirmedAt IS NOT NULL));
ALTER TABLE `Remittance` ADD CONSTRAINT `chk_remittance_currency` CHECK (REGEXP_LIKE(currency, '^[A-Z]{3}$', 'c'));
ALTER TABLE `SubscriptionPlan` ADD CONSTRAINT `chk_single_reference_plan` CHECK (referenceSlot IS NULL OR (referenceSlot = 1 AND active = true));
ALTER TABLE `SubscriptionPrice` ADD CONSTRAINT `chk_price_positive` CHECK (amount > 0);
ALTER TABLE `SubscriptionPrice` ADD CONSTRAINT `chk_price_interval` CHECK (effectiveUntil IS NULL OR effectiveUntil > effectiveFrom);
ALTER TABLE `SubscriptionPrice` ADD CONSTRAINT `chk_price_currency` CHECK (REGEXP_LIKE(currency, '^[A-Z]{3}$', 'c'));
ALTER TABLE `Subscription` ADD CONSTRAINT `chk_subscription_dates` CHECK (expiresAt IS NULL OR (startedAt IS NOT NULL AND expiresAt > startedAt));
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `chk_subscription_payment_amount` CHECK (amount > 0);
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `chk_payment_validation` CHECK (status = 'PENDING' OR (validatedById IS NOT NULL AND validatedAt IS NOT NULL));
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `chk_payment_currency` CHECK (REGEXP_LIKE(currency, '^[A-Z]{3}$', 'c'));
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `chk_subscription_period_interval` CHECK (endsAt > startsAt);
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `chk_subscription_period_amount` CHECK (amountApplied > 0);
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `chk_period_currency` CHECK (REGEXP_LIKE(currency, '^[A-Z]{3}$', 'c'));
ALTER TABLE `Notification` ADD CONSTRAINT `chk_notification_attempts` CHECK (maxAttempts > 0 AND attempts <= maxAttempts);
ALTER TABLE `Notification` ADD CONSTRAINT `chk_notification_sent` CHECK (status <> 'SENT' OR sentAt IS NOT NULL);
ALTER TABLE `Notification` ADD CONSTRAINT `chk_notification_lease` CHECK (status <> 'PROCESSING' OR (lockedAt IS NOT NULL AND lockedBy IS NOT NULL));
ALTER TABLE `AuditLog` ADD CONSTRAINT `chk_audit_agency_tenant` CHECK (agencyId IS NULL OR companyId IS NOT NULL);

CREATE TRIGGER `AuditLog_immutable_update` BEFORE UPDATE ON `AuditLog` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog records are immutable';

CREATE TRIGGER `AuditLog_immutable_delete` BEFORE DELETE ON `AuditLog` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditLog records are immutable';

CREATE TRIGGER `DeliveryProof_immutable_update` BEFORE UPDATE ON `DeliveryProof` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DeliveryProof records are immutable';

CREATE TRIGGER `DeliveryProof_immutable_delete` BEFORE DELETE ON `DeliveryProof` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DeliveryProof records are immutable';

CREATE TRIGGER `SubscriptionPeriod_immutable_update` BEFORE UPDATE ON `SubscriptionPeriod` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubscriptionPeriod records are immutable';

CREATE TRIGGER `SubscriptionPeriod_immutable_delete` BEFORE DELETE ON `SubscriptionPeriod` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubscriptionPeriod records are immutable';

CREATE TRIGGER `Order_snapshot_immutable` BEFORE UPDATE ON `Order` FOR EACH ROW
BEGIN
 IF NOT (NEW.recipientName <=> OLD.recipientName) OR NOT (NEW.recipientEmail <=> OLD.recipientEmail)
 OR NOT (NEW.recipientPhone <=> OLD.recipientPhone) OR NOT (NEW.recipientAddress <=> OLD.recipientAddress)
 OR NOT (NEW.recipientCity <=> OLD.recipientCity) OR NOT (NEW.recipientLatitude <=> OLD.recipientLatitude)
 OR NOT (NEW.recipientLongitude <=> OLD.recipientLongitude) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order recipient snapshot is immutable';
 END IF;
END;
CREATE TRIGGER `SubscriptionPrice_history` BEFORE UPDATE ON `SubscriptionPrice` FOR EACH ROW
BEGIN
 IF NOT (NEW.amount <=> OLD.amount) OR NOT (NEW.currency <=> OLD.currency) OR NOT (NEW.planId <=> OLD.planId)
 OR NOT (NEW.effectiveFrom <=> OLD.effectiveFrom) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Create a new subscription price version';
 END IF;
END;
CREATE TRIGGER `DeliveryOtp_no_reuse` BEFORE UPDATE ON `DeliveryOtp` FOR EACH ROW
BEGIN
 IF OLD.status = 'VERIFIED' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verified OTP is immutable';
 END IF;
END;
CREATE TRIGGER `DeliveryProof_verified_otp` BEFORE INSERT ON `DeliveryProof` FOR EACH ROW
BEGIN
 IF NEW.method = 'OTP' AND NOT EXISTS (
  SELECT 1 FROM DeliveryOtp WHERE id = NEW.otpId AND companyId = NEW.companyId
  AND deliveryId = NEW.deliveryId AND courierId = NEW.courierId AND status = 'VERIFIED'
  AND verifiedAt IS NOT NULL AND expiresAt >= verifiedAt AND expiresAt >= UTC_TIMESTAMP(3) AND verifiedAt <= UTC_TIMESTAMP(3)
 ) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verified delivery-specific OTP required';
 END IF;
END;
CREATE TRIGGER `ProofPhoto_private_file` BEFORE INSERT ON `ProofPhoto` FOR EACH ROW
BEGIN
 IF NOT EXISTS (SELECT 1 FROM FileAsset WHERE id = NEW.fileId AND companyId = NEW.companyId AND visibility = 'PRIVATE') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Proof photos must be private';
 END IF;
END;
CREATE TRIGGER `FileAsset_preserve_proof_privacy` BEFORE UPDATE ON `FileAsset` FOR EACH ROW
BEGIN
 IF NEW.visibility <> 'PRIVATE' AND EXISTS (SELECT 1 FROM ProofPhoto WHERE fileId = OLD.id AND companyId = OLD.companyId) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Proof photos must remain private';
 END IF;
END;

CREATE TRIGGER `ProofPhoto_update_private_file` BEFORE UPDATE ON `ProofPhoto` FOR EACH ROW
BEGIN
 IF NOT EXISTS (SELECT 1 FROM FileAsset WHERE id = NEW.fileId AND companyId = NEW.companyId AND visibility = 'PRIVATE') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Proof photos must be private';
 END IF;
END;

CREATE TRIGGER `StockMovement_immutable_update` BEFORE UPDATE ON `StockMovement` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'StockMovement records are immutable';

CREATE TRIGGER `StockMovement_immutable_delete` BEFORE DELETE ON `StockMovement` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'StockMovement records are immutable';

CREATE TRIGGER `OrderEvent_immutable_update` BEFORE UPDATE ON `OrderEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OrderEvent records are immutable';

CREATE TRIGGER `OrderEvent_immutable_delete` BEFORE DELETE ON `OrderEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'OrderEvent records are immutable';

CREATE TRIGGER `DeliveryEvent_immutable_update` BEFORE UPDATE ON `DeliveryEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DeliveryEvent records are immutable';

CREATE TRIGGER `DeliveryEvent_immutable_delete` BEFORE DELETE ON `DeliveryEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DeliveryEvent records are immutable';

CREATE TRIGGER `TransferEvent_immutable_update` BEFORE UPDATE ON `TransferEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TransferEvent records are immutable';

CREATE TRIGGER `TransferEvent_immutable_delete` BEFORE DELETE ON `TransferEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TransferEvent records are immutable';

CREATE TRIGGER `CollectionEvent_immutable_update` BEFORE UPDATE ON `CollectionEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CollectionEvent records are immutable';

CREATE TRIGGER `CollectionEvent_immutable_delete` BEFORE DELETE ON `CollectionEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CollectionEvent records are immutable';

CREATE TRIGGER `RemittanceEvent_immutable_update` BEFORE UPDATE ON `RemittanceEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RemittanceEvent records are immutable';

CREATE TRIGGER `RemittanceEvent_immutable_delete` BEFORE DELETE ON `RemittanceEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'RemittanceEvent records are immutable';

CREATE TRIGGER `SubscriptionEvent_immutable_update` BEFORE UPDATE ON `SubscriptionEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubscriptionEvent records are immutable';

CREATE TRIGGER `SubscriptionEvent_immutable_delete` BEFORE DELETE ON `SubscriptionEvent` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SubscriptionEvent records are immutable';

CREATE TRIGGER `Delivery_no_initial_completion` BEFORE INSERT ON `Delivery` FOR EACH ROW
BEGIN
 IF NEW.status = 'DELIVERED' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Complete delivery with a proof in a transaction';
 END IF;
END;
CREATE TRIGGER `Delivery_completion_requires_proof` BEFORE UPDATE ON `Delivery` FOR EACH ROW
BEGIN
 IF OLD.status = 'DELIVERED' AND NEW.status <> 'DELIVERED' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A completed delivery cannot be validated again';
 END IF;
 IF NEW.status = 'DELIVERED' AND NOT EXISTS (SELECT 1 FROM DeliveryProof WHERE deliveryId = NEW.id AND companyId = NEW.companyId AND courierId = NEW.courierId) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A valid proof is required to complete a delivery';
 END IF;
END;
