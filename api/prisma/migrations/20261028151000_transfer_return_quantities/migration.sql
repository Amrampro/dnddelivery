ALTER TABLE TransferItem ADD COLUMN returnedQuantity INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE TransferItem DROP CHECK TransferItem_received_check;
ALTER TABLE TransferItem ADD CONSTRAINT TransferItem_received_check CHECK(receivedQuantity+lostQuantity+returnedQuantity<=quantity);
