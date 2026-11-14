CREATE INDEX `Company_createdAt_id_idx` ON `Company` (`createdAt`, `id`);
CREATE INDEX `Company_status_createdAt_idx` ON `Company` (`status`, `createdAt`);
CREATE INDEX `CompanyInvitation_createdAt_id_idx` ON `CompanyInvitation` (`createdAt`, `id`);
CREATE INDEX `AuditLog_action_createdAt_idx` ON `AuditLog` (`action`, `createdAt`);
