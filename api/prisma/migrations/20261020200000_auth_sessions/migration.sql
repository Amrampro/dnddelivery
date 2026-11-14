ALTER TABLE `Session`
 ADD COLUMN `clientType` VARCHAR(10) NOT NULL DEFAULT 'WEB',
 ADD COLUMN `deviceName` VARCHAR(120) NOT NULL DEFAULT 'Navigateur',
 ADD COLUMN `csrfHash` CHAR(64) NULL,
 ADD COLUMN `activeContext` JSON NULL,
 ADD COLUMN `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 ADD CONSTRAINT `chk_session_client` CHECK (`clientType` IN ('WEB','MOBILE'));
CREATE INDEX `Session_userId_revokedAt_expiresAt_idx` ON `Session` (`userId`,`revokedAt`,`expiresAt`);
