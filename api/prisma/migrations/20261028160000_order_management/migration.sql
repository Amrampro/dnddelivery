ALTER TABLE `Recipient` ADD COLUMN shopId CHAR(36) NULL, ADD COLUMN country VARCHAR(120) NOT NULL DEFAULT '', ADD COLUMN details JSON NULL, ADD COLUMN version INT NOT NULL DEFAULT 1;
CREATE INDEX Recipient_companyId_shopId_name_idx ON Recipient(companyId,shopId,name);
ALTER TABLE `Recipient` ADD CONSTRAINT Recipient_shopId_fkey FOREIGN KEY (shopId) REFERENCES Shop(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `Order` ADD COLUMN isDraft BOOLEAN NOT NULL DEFAULT false, ADD COLUMN version INT NOT NULL DEFAULT 1, ADD COLUMN submittedAt DATETIME(3) NULL, ADD COLUMN clientKey VARCHAR(100) NULL, ADD COLUMN requestHash CHAR(64) NULL, ADD COLUMN recipientCountry VARCHAR(120) NOT NULL DEFAULT '', ADD COLUMN recipientDetails JSON NULL, ADD COLUMN pickup JSON NULL, ADD COLUMN parcelDescription VARCHAR(2000) NULL, ADD COLUMN collectionRequired BOOLEAN NOT NULL DEFAULT false, ADD COLUMN financialNotes VARCHAR(1000) NULL, ADD COLUMN cancellationReason VARCHAR(1000) NULL, ADD COLUMN cancelledAt DATETIME(3) NULL;
UPDATE `Order` SET collectionRequired=(amountToCollect>0),submittedAt=createdAt;
CREATE UNIQUE INDEX Order_companyId_createdById_clientKey_key ON `Order`(companyId,createdById,clientKey);
CREATE INDEX Order_companyId_shopId_isDraft_createdAt_idx ON `Order`(companyId,shopId,isDraft,createdAt);
ALTER TABLE OrderItem ADD COLUMN active BOOLEAN NOT NULL DEFAULT true, ADD COLUMN description VARCHAR(1000) NULL, ADD COLUMN instructions VARCHAR(1000) NULL, ADD COLUMN declaredValue DECIMAL(19,4) NULL;
ALTER TABLE OrderItem ADD CONSTRAINT chk_order_item_value CHECK (declaredValue IS NULL OR declaredValue>=0);
ALTER TABLE `Order` ADD CONSTRAINT chk_order_collection CHECK ((collectionRequired=true AND amountToCollect>0) OR (collectionRequired=false AND amountToCollect=0));
ALTER TABLE OrderEvent ADD COLUMN action VARCHAR(60) NOT NULL DEFAULT 'LEGACY', ADD COLUMN previousStatus ENUM('PENDING','CONFIRMED','PREPARING','READY','IN_DELIVERY','DELIVERED','FAILED','CANCELLED','RETURNED') NULL, ADD COLUMN metadata JSON NULL;
DROP TRIGGER Order_snapshot_immutable;
CREATE TRIGGER Order_snapshot_immutable BEFORE UPDATE ON `Order` FOR EACH ROW
BEGIN
 IF OLD.isDraft=false AND (NOT (NEW.recipientName <=> OLD.recipientName) OR NOT (NEW.recipientEmail <=> OLD.recipientEmail) OR NOT (NEW.recipientPhone <=> OLD.recipientPhone) OR NOT (NEW.recipientAddress <=> OLD.recipientAddress) OR NOT (NEW.recipientCity <=> OLD.recipientCity) OR NOT (NEW.recipientLatitude <=> OLD.recipientLatitude) OR NOT (NEW.recipientLongitude <=> OLD.recipientLongitude) OR NOT (NEW.recipientCountry <=> OLD.recipientCountry) OR NOT (NEW.recipientDetails <=> OLD.recipientDetails)) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order recipient snapshot is immutable';
 END IF;
END;
INSERT IGNORE INTO Permission(id,code,description) VALUES
(UUID(),'orders.create','Créer une commande'),(UUID(),'orders.edit','Modifier une commande préalable'),(UUID(),'orders.cancel','Annuler une commande préalable'),(UUID(),'shop.orders.read','Lire les commandes de sa boutique'),(UUID(),'shop.orders.create','Créer pour sa boutique'),(UUID(),'shop.orders.edit','Modifier pour sa boutique'),(UUID(),'shop.orders.cancel','Annuler pour sa boutique');
INSERT IGNORE INTO RolePermission(roleId,permissionId)
SELECT r.id,p.id FROM Role r JOIN Permission p ON
(r.code IN ('company_admin','agency_manager') AND p.code IN ('orders.read','orders.create','orders.edit','orders.cancel')) OR
(r.code='agency_employee' AND p.code IN ('orders.read','orders.create','orders.edit')) OR
(r.code IN ('shop_owner','shop_manager') AND p.code IN ('orders.read','shop.orders.read','shop.orders.create','shop.orders.edit','shop.orders.cancel')) OR
(r.code='shop_employee' AND p.code IN ('orders.read','shop.orders.read','shop.orders.create','shop.orders.edit'));
