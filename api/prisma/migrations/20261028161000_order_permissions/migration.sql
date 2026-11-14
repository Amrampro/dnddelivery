INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES
(UUID(),'orders.create','Cr�er une commande',NOW(3),NOW(3)),(UUID(),'orders.edit','Modifier une commande pr�alable',NOW(3),NOW(3)),(UUID(),'orders.cancel','Annuler une commande pr�alable',NOW(3),NOW(3)),(UUID(),'shop.orders.read','Lire les commandes de sa boutique',NOW(3),NOW(3)),(UUID(),'shop.orders.create','Cr�er pour sa boutique',NOW(3),NOW(3)),(UUID(),'shop.orders.edit','Modifier pour sa boutique',NOW(3),NOW(3)),(UUID(),'shop.orders.cancel','Annuler pour sa boutique',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt)
SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON
(r.code IN ('company_admin','agency_manager') AND p.code IN ('orders.read','orders.create','orders.edit','orders.cancel')) OR
(r.code='agency_employee' AND p.code IN ('orders.read','orders.create','orders.edit')) OR
(r.code IN ('shop_owner','shop_manager') AND p.code IN ('orders.read','shop.orders.read','shop.orders.create','shop.orders.edit','shop.orders.cancel')) OR
(r.code='shop_employee' AND p.code IN ('orders.read','shop.orders.read','shop.orders.create','shop.orders.edit'))
ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
