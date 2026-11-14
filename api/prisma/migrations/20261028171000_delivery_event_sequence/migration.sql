ALTER TABLE DeliveryEvent ADD COLUMN sequence INT UNSIGNED NULL;
CREATE UNIQUE INDEX DeliveryEvent_companyId_deliveryId_sequence_key ON DeliveryEvent(companyId,deliveryId,sequence);
