-- MySQL CHECK accepts UNKNOWN; explicitly reject NULL for an active offer.
ALTER TABLE `SubscriptionPlan` ADD CONSTRAINT `chk_active_offer_nonnull` CHECK (active = false OR (referenceSlot IS NOT NULL AND referenceSlot = 1));
