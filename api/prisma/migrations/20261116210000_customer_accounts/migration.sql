ALTER TABLE `User` ADD COLUMN `customerEnabled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Order` ADD COLUMN `customerUserId` CHAR(36) NULL;
CREATE INDEX `Order_customerUserId_isDraft_createdAt_idx` ON `Order` (`customerUserId`, `isDraft`, `createdAt`);
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerUserId_fkey` FOREIGN KEY (`customerUserId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE `CustomerRegistration` (
 `id` CHAR(36) NOT NULL, `tokenHash` CHAR(64) NOT NULL,
 `email` VARCHAR(254) NOT NULL, `fullName` VARCHAR(160) NOT NULL, `phone` VARCHAR(32) NOT NULL,
 `expiresAt` DATETIME(3) NOT NULL, `usedAt` DATETIME(3) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`), UNIQUE INDEX `CustomerRegistration_tokenHash_key` (`tokenHash`),
 INDEX `CustomerRegistration_email_createdAt_idx` (`email`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
