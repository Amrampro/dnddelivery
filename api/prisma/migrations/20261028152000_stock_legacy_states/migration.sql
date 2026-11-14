-- Populate only newly introduced derived state; physical balances and movement history stay untouched.
UPDATE StockReservation SET status=CASE WHEN consumedAt IS NOT NULL THEN 'CONSUMED' WHEN releasedAt IS NOT NULL THEN 'RELEASED' ELSE 'ACTIVE' END WHERE status='ACTIVE' AND (consumedAt IS NOT NULL OR releasedAt IS NOT NULL);
UPDATE TransferItem i JOIN Transfer t ON t.companyId=i.companyId AND t.id=i.transferId SET i.receivedQuantity=i.quantity WHERE t.status='RECEIVED' AND i.receivedQuantity=0 AND i.lostQuantity=0 AND i.returnedQuantity=0;
CREATE UNIQUE INDEX StockDeposit_context_key ON StockDeposit(companyId,id,shopId);
ALTER TABLE StockDepositItem ADD CONSTRAINT StockDepositItem_context_fk FOREIGN KEY(companyId,depositId,shopId) REFERENCES StockDeposit(companyId,id,shopId) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX TransferItem_incident_context_key ON TransferItem(companyId,id,transferId,shopId,productId);
ALTER TABLE TransferIncident ADD CONSTRAINT TransferIncident_item_context_fk FOREIGN KEY(companyId,itemId,transferId,shopId,productId) REFERENCES TransferItem(companyId,id,transferId,shopId,productId) ON DELETE RESTRICT ON UPDATE RESTRICT;
