-- Production deployments run migrations, not the development seed.
-- Restore the built-in company administrator's base grants from prisma/seed.ts.
-- Never change memberships, organisation status, custom roles or global grants.
INSERT INTO Permission (id, code, description, createdAt, updatedAt)
VALUES
 (UUID(), 'workspace.access', 'workspace.access', NOW(3), NOW(3)),
 (UUID(), 'orders.read', 'orders.read', NOW(3), NOW(3)),
 (UUID(), 'stocks.reserve', 'stocks.reserve', NOW(3), NOW(3)),
 (UUID(), 'company.manage', 'company.manage', NOW(3), NOW(3)),
 (UUID(), 'companies.read', 'companies.read', NOW(3), NOW(3)),
 (UUID(), 'agencies.read', 'agencies.read', NOW(3), NOW(3)),
 (UUID(), 'partners.read', 'partners.read', NOW(3), NOW(3)),
 (UUID(), 'users.read', 'users.read', NOW(3), NOW(3)),
 (UUID(), 'subscriptions.read', 'subscriptions.read', NOW(3), NOW(3)),
 (UUID(), 'subscriptions.declare', 'subscriptions.declare', NOW(3), NOW(3)),
 (UUID(), 'stocks.read', 'stocks.read', NOW(3), NOW(3)),
 (UUID(), 'deliveries.read', 'deliveries.read', NOW(3), NOW(3)),
 (UUID(), 'collections.read', 'collections.read', NOW(3), NOW(3)),
 (UUID(), 'notifications.read', 'notifications.read', NOW(3), NOW(3)),
 (UUID(), 'reports.read', 'reports.read', NOW(3), NOW(3)),
 (UUID(), 'audit.read', 'audit.read', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE code = VALUES(code);

INSERT INTO RolePermission (id, roleId, permissionId, createdAt, updatedAt)
SELECT UUID(), r.id, p.id, NOW(3), NOW(3)
FROM Role r JOIN Permission p ON p.code IN (
 'workspace.access', 'orders.read', 'stocks.reserve', 'company.manage',
 'companies.read', 'agencies.read', 'partners.read', 'users.read',
 'subscriptions.read', 'subscriptions.declare', 'stocks.read',
 'deliveries.read', 'collections.read', 'notifications.read', 'reports.read', 'audit.read'
)
WHERE r.code = 'company_admin' AND r.scope = 'COMPANY'
ON DUPLICATE KEY UPDATE roleId = VALUES(roleId);
