ALTER TABLE CompanyMembership ADD COLUMN organizationRole VARCHAR(30) NOT NULL DEFAULT 'employee', ADD COLUMN employmentStatus VARCHAR(12) NOT NULL DEFAULT 'ACTIVE', ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE CompanyMembership ADD CONSTRAINT chk_employment_status CHECK(employmentStatus IN ('ACTIVE','SUSPENDED','INACTIVE')), ADD CONSTRAINT chk_member_version CHECK(version>0);
ALTER TABLE Agency ADD COLUMN countryCode CHAR(2) NULL, ADD COLUMN locationNotes VARCHAR(1000) NULL, ADD COLUMN primaryManagerUserId CHAR(36) NULL, ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Agency ADD CONSTRAINT chk_agency_version CHECK(version>0), ADD CONSTRAINT fk_agency_primary_manager FOREIGN KEY(companyId,id,primaryManagerUserId) REFERENCES AgencyMembership(companyId,agencyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE CompanyInvitation ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'ADMIN', ADD COLUMN staffRole VARCHAR(30) NULL, ADD COLUMN agencyIds JSON NULL;
ALTER TABLE CompanyInvitation ADD CONSTRAINT chk_invitation_kind CHECK(kind IN ('ADMIN','STAFF'));
CREATE TABLE DriverProfile (
 id CHAR(36) NOT NULL, companyId CHAR(36) NOT NULL, userId CHAR(36) NOT NULL,
 employeeNumber VARCHAR(50) NULL, status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE', availability VARCHAR(12) NOT NULL DEFAULT 'UNAVAILABLE', availabilityChangedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 transport VARCHAR(12) NULL, notes VARCHAR(2000) NULL, version INTEGER NOT NULL DEFAULT 1,
 createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updatedAt DATETIME(3) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY DriverProfile_companyId_userId_key(companyId,userId),UNIQUE KEY DriverProfile_companyId_employeeNumber_key(companyId,employeeNumber),INDEX DriverProfile_companyId_status_availability_idx(companyId,status,availability),
 CONSTRAINT DriverProfile_companyId_userId_fkey FOREIGN KEY(companyId,userId) REFERENCES CompanyMembership(companyId,userId) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT chk_driver_status CHECK(status IN ('ACTIVE','SUSPENDED','INACTIVE')),
 CONSTRAINT chk_driver_availability CHECK(availability IN ('AVAILABLE','UNAVAILABLE')),
 CONSTRAINT chk_driver_available_active CHECK(status='ACTIVE' OR availability='UNAVAILABLE'),
 CONSTRAINT chk_driver_transport CHECK(transport IS NULL OR transport IN ('MOTORBIKE','BICYCLE','CAR','VAN','OTHER')),
 CONSTRAINT chk_driver_version CHECK(version>0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Reference roles and permissions appended from the same audited map as the seed.
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'company_admin','company_admin','COMPANY',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.read','company.profile.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.read' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.write','company.profile.write',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.write' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.read','agencies.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.read' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.create','agencies.create',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.create' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.update','agencies.update',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.update' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.status','agencies.status',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.status' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'employees.read','employees.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='employees.read' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'employees.invite','employees.invite',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='employees.invite' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'employees.manage','employees.manage',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='employees.manage' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'employees.remove','employees.remove',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='employees.remove' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'drivers.read','drivers.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='drivers.read' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'drivers.manage','drivers.manage',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='drivers.manage' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.self.read','organization.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.self.read' WHERE r.code='company_admin';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.audit.read','organization.audit.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.audit.read' WHERE r.code='company_admin';
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'company_member','company_member','COMPANY',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='company_member';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.read','company.profile.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.read' WHERE r.code='company_member';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.self.read','organization.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.self.read' WHERE r.code='company_member';
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'agency_manager','agency_manager','AGENCY',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='agency_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.read','company.profile.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.read' WHERE r.code='agency_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.read','agencies.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.read' WHERE r.code='agency_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'employees.read','employees.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='employees.read' WHERE r.code='agency_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'drivers.read','drivers.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='drivers.read' WHERE r.code='agency_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.self.read','organization.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.self.read' WHERE r.code='agency_manager';
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'stock_manager','stock_manager','AGENCY',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='stock_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.read','company.profile.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.read' WHERE r.code='stock_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.read','agencies.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.read' WHERE r.code='stock_manager';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.self.read','organization.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.self.read' WHERE r.code='stock_manager';
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'courier','courier','AGENCY',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='courier';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.read','company.profile.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.read' WHERE r.code='courier';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.read','agencies.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.read' WHERE r.code='courier';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.self.read','organization.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.self.read' WHERE r.code='courier';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'drivers.self.read','drivers.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='drivers.self.read' WHERE r.code='courier';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'drivers.availability.write','drivers.availability.write',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='drivers.availability.write' WHERE r.code='courier';
INSERT INTO Role(id,code,name,scope,createdAt,updatedAt) VALUES(UUID(),'agency_employee','agency_employee','AGENCY',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'workspace.access','workspace.access',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='workspace.access' WHERE r.code='agency_employee';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'company.profile.read','company.profile.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='company.profile.read' WHERE r.code='agency_employee';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'agencies.read','agencies.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='agencies.read' WHERE r.code='agency_employee';
INSERT INTO Permission(id,code,description,createdAt,updatedAt) VALUES(UUID(),'organization.self.read','organization.self.read',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE code=code;
INSERT IGNORE INTO RolePermission(id,roleId,permissionId,createdAt,updatedAt) SELECT UUID(),r.id,p.id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3) FROM Role r JOIN Permission p ON p.code='organization.self.read' WHERE r.code='agency_employee';
