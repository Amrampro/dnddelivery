-- Additive reporting indexes; no historical data or previous migration is modified.
CREATE INDEX Delivery_report_created_idx ON Delivery(companyId,agencyId,createdAt);
CREATE INDEX Delivery_report_closed_idx ON Delivery(companyId,agencyId,closedAt);
CREATE INDEX Delivery_report_courier_closed_idx ON Delivery(companyId,courierId,closedAt);
CREATE INDEX Collection_report_created_idx ON Collection(companyId,agencyId,createdAt);
CREATE INDEX AuditLog_report_agency_created_idx ON AuditLog(companyId,agencyId,createdAt);
CREATE INDEX SubscriptionPayment_report_validated_idx ON SubscriptionPayment(status,validatedAt,companyId);
CREATE INDEX Stock_report_agency_shop_idx ON Stock(companyId,agencyId,shopId);
INSERT IGNORE INTO Permission(id,code,description) VALUES
  (UUID(),'reports.read','Lire les rapports dans le p�rim�tre autoris�'),
  (UUID(),'audit.read','Lire le journal d'audit dans le p�rim�tre autoris�');
INSERT IGNORE INTO RolePermission(roleId,permissionId)
SELECT r.id,p.id FROM Role r CROSS JOIN Permission p
WHERE r.code IN ('company_admin','agency_manager') AND p.code IN ('reports.read','audit.read');
