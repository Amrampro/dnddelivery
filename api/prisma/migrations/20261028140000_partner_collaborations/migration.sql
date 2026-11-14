ALTER TABLE Shop ADD COLUMN legalName VARCHAR(160) NULL, ADD COLUMN description VARCHAR(2000) NULL, ADD COLUMN countryCode CHAR(2) NULL, ADD COLUMN city VARCHAR(120) NULL, ADD COLUMN district VARCHAR(120) NULL, ADD COLUMN logoKey VARCHAR(80) NULL, ADD COLUMN registrationKey VARCHAR(254) NULL, ADD COLUMN version INT NOT NULL DEFAULT 1, ADD COLUMN termsAcceptedAt DATETIME(3) NULL, ADD COLUMN termsVersion VARCHAR(40) NULL;
CREATE UNIQUE INDEX Shop_registrationKey_key ON Shop(registrationKey);
CREATE INDEX Shop_name_id_idx ON Shop(name,id);
ALTER TABLE ShopMembership ADD COLUMN version INT NOT NULL DEFAULT 1, ADD COLUMN affiliationStatus VARCHAR(12) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE CompanyShop MODIFY COLUMN status ENUM('PENDING','ACTIVE','SUSPENDED','REJECTED','ENDED') NOT NULL DEFAULT 'PENDING', ADD COLUMN origin VARCHAR(12) NOT NULL DEFAULT 'COMPANY', ADD COLUMN version INT NOT NULL DEFAULT 1, ADD COLUMN requestedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ADD COLUMN acceptedAt DATETIME(3) NULL, ADD COLUMN suspendedAt DATETIME(3) NULL, ADD COLUMN initiatorUserId CHAR(36) NULL, ADD COLUMN decisionUserId CHAR(36) NULL, ADD COLUMN reason VARCHAR(500) NULL, ADD COLUMN observations VARCHAR(1000) NULL, ADD COLUMN allowedAgencyIds JSON NULL;
CREATE INDEX CompanyShop_companyId_status_createdAt_idx ON CompanyShop(companyId,status,createdAt);
ALTER TABLE CompanyShop ADD CONSTRAINT CompanyShop_origin_check CHECK(origin IN ('COMPANY','SHOP')), ADD CONSTRAINT CompanyShop_version_check CHECK(version>0);
ALTER TABLE ShopMembership ADD CONSTRAINT ShopMembership_affiliationStatus_check CHECK(affiliationStatus IN ('ACTIVE','SUSPENDED','INACTIVE'));
CREATE TABLE ShopInvitation (
 id CHAR(36) NOT NULL PRIMARY KEY, kind VARCHAR(20) NOT NULL, shopId CHAR(36) NULL, companyId CHAR(36) NULL, email VARCHAR(254) NOT NULL, fullName VARCHAR(160) NOT NULL, role VARCHAR(30) NULL, tokenHash CHAR(64) NOT NULL, payload JSON NOT NULL, senderId CHAR(36) NULL, expiresAt DATETIME(3) NOT NULL, acceptedAt DATETIME(3) NULL, revokedAt DATETIME(3) NULL, deliveryStatus VARCHAR(12) NOT NULL DEFAULT 'PENDING', createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updatedAt DATETIME(3) NOT NULL,
 UNIQUE INDEX ShopInvitation_tokenHash_key(tokenHash), INDEX ShopInvitation_shopId_createdAt_idx(shopId,createdAt), INDEX ShopInvitation_companyId_createdAt_idx(companyId,createdAt), INDEX ShopInvitation_email_kind_expiresAt_idx(email,kind,expiresAt),
 CONSTRAINT ShopInvitation_shop_fk FOREIGN KEY(shopId) REFERENCES Shop(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ShopInvitation_company_fk FOREIGN KEY(companyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ShopInvitation_sender_fk FOREIGN KEY(senderId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ShopInvitation_kind_check CHECK(kind IN ('REGISTRATION','USER','PARTNER')),
 CONSTRAINT ShopInvitation_delivery_check CHECK(deliveryStatus IN ('PENDING','SENT','FAILED'))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'partners.read','partners.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='partners.read' WHERE r.code='company_admin' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'partners.manage','partners.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='partners.manage' WHERE r.code='company_admin' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'shop_owner','Propriétaire boutique','SHOP',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.profile.read','shop.profile.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.profile.read' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.profile.write','shop.profile.write',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.profile.write' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.users.read','shop.users.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.users.read' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.users.manage','shop.users.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.users.manage' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.collaborations.read','shop.collaborations.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.collaborations.read' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.collaborations.manage','shop.collaborations.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.collaborations.manage' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.history.read','shop.history.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.history.read' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.notifications.read','shop.notifications.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.notifications.read' WHERE r.code='shop_owner' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'shop_manager','Gestionnaire boutique','SHOP',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.profile.read','shop.profile.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.profile.read' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.profile.write','shop.profile.write',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.profile.write' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.users.read','shop.users.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.users.read' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.collaborations.read','shop.collaborations.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.collaborations.read' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.collaborations.manage','shop.collaborations.manage',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.collaborations.manage' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.history.read','shop.history.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.history.read' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.notifications.read','shop.notifications.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.notifications.read' WHERE r.code='shop_manager' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'shop_employee','Employé boutique','SHOP',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.profile.read','shop.profile.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.profile.read' WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.collaborations.read','shop.collaborations.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.collaborations.read' WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'shop.notifications.read','shop.notifications.read',NOW(3),NOW(3)) ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,NOW(3),NOW(3) FROM Role r JOIN Permission p ON p.code='shop.notifications.read' WHERE r.code='shop_employee' ON DUPLICATE KEY UPDATE roleId=VALUES(roleId);
