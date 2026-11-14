-- Full regression revealed zero timestamps from the initial INSERT IGNORE on a fresh permission.
-- Repair only the reporting permissions/grants; retain all applied migration checksums.
UPDATE Permission SET updatedAt=createdAt
WHERE code IN ('reports.read','audit.read') AND updatedAt<'1000-01-01 00:00:00';
UPDATE RolePermission rp JOIN Permission p ON p.id=rp.permissionId
SET rp.updatedAt=rp.createdAt
WHERE p.code IN ('reports.read','audit.read') AND rp.updatedAt<'1000-01-01 00:00:00';
