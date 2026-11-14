-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `status` ENUM('ACTIVE', 'DISABLED', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `emailVerifiedAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `scope` ENUM('GLOBAL', 'COMPANY', 'AGENCY', 'SHOP') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    UNIQUE INDEX `Role_id_scope_key`(`id`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Permission` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Permission_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `id` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `permissionId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RolePermission_roleId_permissionId_key`(`roleId`, `permissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GlobalRoleGrant` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `roleScope` ENUM('GLOBAL', 'COMPANY', 'AGENCY', 'SHOP') NOT NULL DEFAULT 'GLOBAL',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GlobalRoleGrant_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Company` (
    `id` CHAR(36) NOT NULL,
    `reference` VARCHAR(50) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(120) NOT NULL,
    `countryCode` CHAR(2) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'INACTIVE',
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Company_reference_key`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyMembership` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `roleScope` ENUM('GLOBAL', 'COMPANY', 'AGENCY', 'SHOP') NOT NULL DEFAULT 'COMPANY',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CompanyMembership_companyId_userId_key`(`companyId`, `userId`),
    UNIQUE INDEX `CompanyMembership_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agency` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `reference` VARCHAR(50) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(120) NOT NULL,
    `zone` VARCHAR(120) NULL,
    `email` VARCHAR(254) NULL,
    `phone` VARCHAR(32) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Agency_companyId_status_idx`(`companyId`, `status`),
    UNIQUE INDEX `Agency_companyId_reference_key`(`companyId`, `reference`),
    UNIQUE INDEX `Agency_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgencyMembership` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `roleScope` ENUM('GLOBAL', 'COMPANY', 'AGENCY', 'SHOP') NOT NULL DEFAULT 'AGENCY',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgencyMembership_companyId_agencyId_userId_key`(`companyId`, `agencyId`, `userId`),
    UNIQUE INDEX `AgencyMembership_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shop` (
    `id` CHAR(36) NOT NULL,
    `reference` VARCHAR(50) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Shop_reference_key`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShopMembership` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `roleScope` ENUM('GLOBAL', 'COMPANY', 'AGENCY', 'SHOP') NOT NULL DEFAULT 'SHOP',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShopMembership_shopId_userId_key`(`shopId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyShop` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED') NOT NULL DEFAULT 'PENDING',
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CompanyShop_shopId_status_idx`(`shopId`, `status`),
    UNIQUE INDEX `CompanyShop_companyId_shopId_key`(`companyId`, `shopId`),
    UNIQUE INDEX `CompanyShop_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `sku` VARCHAR(80) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `unit` VARCHAR(30) NOT NULL DEFAULT 'piece',
    `weightGrams` INTEGER UNSIGNED NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_shopId_id_key`(`shopId`, `id`),
    UNIQUE INDEX `Product_shopId_sku_key`(`shopId`, `sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `refreshTokenHash` CHAR(64) NOT NULL,
    `familyId` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `replacedById` CHAR(36) NULL,
    `userAgent` VARCHAR(255) NULL,
    `ipHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_refreshTokenHash_key`(`refreshTokenHash`),
    UNIQUE INDEX `Session_replacedById_key`(`replacedById`),
    INDEX `Session_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `Session_familyId_idx`(`familyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccountToken` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `purpose` ENUM('EMAIL_VERIFICATION', 'PASSWORD_RESET') NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AccountToken_tokenHash_key`(`tokenHash`),
    INDEX `AccountToken_userId_purpose_expiresAt_idx`(`userId`, `purpose`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthEvent` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `type` ENUM('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'TOKEN_REVOKED', 'PASSWORD_RESET', 'PERMISSIONS_CHANGED') NOT NULL,
    `ipHash` CHAR(64) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuthEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Stock` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `physicalQuantity` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `reservedQuantity` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `alertThreshold` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Stock_companyId_shopId_idx`(`companyId`, `shopId`),
    UNIQUE INDEX `Stock_companyId_agencyId_shopId_productId_key`(`companyId`, `agencyId`, `shopId`, `productId`),
    UNIQUE INDEX `Stock_companyId_id_shopId_productId_key`(`companyId`, `id`, `shopId`, `productId`),
    UNIQUE INDEX `Stock_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transfer` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `originAgencyId` CHAR(36) NOT NULL,
    `destinationAgencyId` CHAR(36) NOT NULL,
    `initiatedById` CHAR(36) NOT NULL,
    `carrierId` CHAR(36) NULL,
    `status` ENUM('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `departedAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Transfer_companyId_status_idx`(`companyId`, `status`),
    UNIQUE INDEX `Transfer_companyId_reference_key`(`companyId`, `reference`),
    UNIQUE INDEX `Transfer_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferItem` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `transferId` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TransferItem_companyId_transferId_shopId_productId_key`(`companyId`, `transferId`, `shopId`, `productId`),
    UNIQUE INDEX `TransferItem_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `transferId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TransferEvent_companyId_transferId_createdAt_idx`(`companyId`, `transferId`, `createdAt`),
    UNIQUE INDEX `TransferEvent_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recipient` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `city` VARCHAR(120) NOT NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Recipient_companyId_email_idx`(`companyId`, `email`),
    UNIQUE INDEX `Recipient_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `publicNumber` VARCHAR(80) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `recipientId` CHAR(36) NULL,
    `createdById` CHAR(36) NOT NULL,
    `type` ENUM('ONE_OFF', 'FROM_STOCK') NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED') NOT NULL DEFAULT 'PENDING',
    `recipientName` VARCHAR(160) NOT NULL,
    `recipientEmail` VARCHAR(254) NOT NULL,
    `recipientPhone` VARCHAR(32) NOT NULL,
    `recipientAddress` VARCHAR(500) NOT NULL,
    `recipientCity` VARCHAR(120) NOT NULL,
    `recipientLatitude` DECIMAL(10, 7) NULL,
    `recipientLongitude` DECIMAL(10, 7) NULL,
    `amountToCollect` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `notes` TEXT NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_publicNumber_key`(`publicNumber`),
    INDEX `Order_companyId_agencyId_status_createdAt_idx`(`companyId`, `agencyId`, `status`, `createdAt`),
    INDEX `Order_companyId_shopId_createdAt_idx`(`companyId`, `shopId`, `createdAt`),
    UNIQUE INDEX `Order_companyId_id_shopId_key`(`companyId`, `id`, `shopId`),
    UNIQUE INDEX `Order_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NULL,
    `sku` VARCHAR(80) NULL,
    `name` VARCHAR(200) NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrderItem_companyId_id_shopId_productId_key`(`companyId`, `id`, `shopId`, `productId`),
    UNIQUE INDEX `OrderItem_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockReservation` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `stockId` CHAR(36) NOT NULL,
    `orderItemId` CHAR(36) NOT NULL,
    `shopId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL,
    `releasedAt` DATETIME(3) NULL,
    `consumedAt` DATETIME(3) NULL,
    `idempotencyKey` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StockReservation_companyId_idempotencyKey_key`(`companyId`, `idempotencyKey`),
    UNIQUE INDEX `StockReservation_companyId_orderItemId_stockId_key`(`companyId`, `orderItemId`, `stockId`),
    UNIQUE INDEX `StockReservation_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `StockReservation_companyId_id_stockId_key`(`companyId`, `id`, `stockId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `stockId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `type` ENUM('DEPOSIT', 'ISSUE', 'RESERVE', 'RELEASE', 'ADJUSTMENT', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL,
    `physicalDelta` INTEGER NOT NULL,
    `reservedDelta` INTEGER NOT NULL,
    `physicalAfter` INTEGER UNSIGNED NOT NULL,
    `reservedAfter` INTEGER UNSIGNED NOT NULL,
    `reservationId` CHAR(36) NULL,
    `transferId` CHAR(36) NULL,
    `operationKey` VARCHAR(120) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_companyId_stockId_createdAt_idx`(`companyId`, `stockId`, `createdAt`),
    UNIQUE INDEX `StockMovement_companyId_operationKey_key`(`companyId`, `operationKey`),
    UNIQUE INDEX `StockMovement_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'IN_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderEvent_companyId_orderId_createdAt_idx`(`companyId`, `orderId`, `createdAt`),
    UNIQUE INDEX `OrderEvent_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Delivery` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `orderId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `assignedAt` DATETIME(3) NULL,
    `pickedUpAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `failureReason` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Delivery_companyId_agencyId_status_idx`(`companyId`, `agencyId`, `status`),
    INDEX `Delivery_companyId_courierId_status_idx`(`companyId`, `courierId`, `status`),
    UNIQUE INDEX `Delivery_companyId_orderId_key`(`companyId`, `orderId`),
    UNIQUE INDEX `Delivery_companyId_id_courierId_key`(`companyId`, `id`, `courierId`),
    UNIQUE INDEX `Delivery_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryAssignment` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `assignedById` CHAR(36) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryAssignment_companyId_deliveryId_createdAt_idx`(`companyId`, `deliveryId`, `createdAt`),
    UNIQUE INDEX `DeliveryAssignment_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'CANCELLED') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeliveryEvent_companyId_deliveryId_createdAt_idx`(`companyId`, `deliveryId`, `createdAt`),
    UNIQUE INDEX `DeliveryEvent_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryOtp` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `codeHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER UNSIGNED NOT NULL DEFAULT 5,
    `status` ENUM('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED') NOT NULL DEFAULT 'PENDING',
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DeliveryOtp_companyId_deliveryId_status_idx`(`companyId`, `deliveryId`, `status`),
    UNIQUE INDEX `DeliveryOtp_companyId_id_deliveryId_courierId_key`(`companyId`, `id`, `deliveryId`, `courierId`),
    UNIQUE INDEX `DeliveryOtp_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryProof` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `otpId` CHAR(36) NULL,
    `method` ENUM('OTP', 'AUTHORIZED_EXCEPTION') NOT NULL,
    `exceptionAuthorizedById` CHAR(36) NULL,
    `exceptionReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DeliveryProof_otpId_key`(`otpId`),
    UNIQUE INDEX `DeliveryProof_companyId_deliveryId_key`(`companyId`, `deliveryId`),
    UNIQUE INDEX `DeliveryProof_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FileAsset` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` BIGINT UNSIGNED NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `checksumSha256` CHAR(64) NOT NULL,
    `uploadedById` CHAR(36) NOT NULL,
    `visibility` ENUM('PRIVATE', 'COMPANY') NOT NULL DEFAULT 'PRIVATE',
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FileAsset_storageKey_key`(`storageKey`),
    UNIQUE INDEX `FileAsset_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProofPhoto` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `proofId` CHAR(36) NOT NULL,
    `fileId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProofPhoto_companyId_proofId_fileId_key`(`companyId`, `proofId`, `fileId`),
    UNIQUE INDEX `ProofPhoto_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Collection` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `deliveryId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `expectedAmount` DECIMAL(19, 4) NOT NULL,
    `declaredAmount` DECIMAL(19, 4) NULL,
    `currency` CHAR(3) NOT NULL,
    `method` ENUM('CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'OTHER') NULL,
    `status` ENUM('PENDING', 'DECLARED', 'VERIFIED', 'DISPUTED', 'VOIDED') NOT NULL DEFAULT 'PENDING',
    `declaredAt` DATETIME(3) NULL,
    `verifiedById` CHAR(36) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Collection_companyId_courierId_status_idx`(`companyId`, `courierId`, `status`),
    UNIQUE INDEX `Collection_companyId_deliveryId_key`(`companyId`, `deliveryId`),
    UNIQUE INDEX `Collection_companyId_id_courierId_agencyId_currency_key`(`companyId`, `id`, `courierId`, `agencyId`, `currency`),
    UNIQUE INDEX `Collection_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Remittance` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `declaredAmount` DECIMAL(19, 4) NOT NULL,
    `confirmedAmount` DECIMAL(19, 4) NULL,
    `currency` CHAR(3) NOT NULL,
    `status` ENUM('DECLARED', 'CONFIRMED', 'DISPUTED', 'CANCELLED') NOT NULL DEFAULT 'DECLARED',
    `declaredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedById` CHAR(36) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Remittance_companyId_reference_key`(`companyId`, `reference`),
    UNIQUE INDEX `Remittance_companyId_id_courierId_agencyId_currency_key`(`companyId`, `id`, `courierId`, `agencyId`, `currency`),
    UNIQUE INDEX `Remittance_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RemittanceItem` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `remittanceId` CHAR(36) NOT NULL,
    `collectionId` CHAR(36) NOT NULL,
    `courierId` CHAR(36) NOT NULL,
    `agencyId` CHAR(36) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RemittanceItem_companyId_collectionId_key`(`companyId`, `collectionId`),
    UNIQUE INDEX `RemittanceItem_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectionEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `collectionId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'DECLARED', 'VERIFIED', 'DISPUTED', 'VOIDED') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CollectionEvent_companyId_collectionId_createdAt_idx`(`companyId`, `collectionId`, `createdAt`),
    UNIQUE INDEX `CollectionEvent_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RemittanceEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `remittanceId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `status` ENUM('DECLARED', 'CONFIRMED', 'DISPUTED', 'CANCELLED') NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RemittanceEvent_companyId_remittanceId_createdAt_idx`(`companyId`, `remittanceId`, `createdAt`),
    UNIQUE INDEX `RemittanceEvent_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPlan` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `referenceSlot` TINYINT UNSIGNED NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `period` ENUM('MONTHLY') NOT NULL DEFAULT 'MONTHLY',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPlan_code_key`(`code`),
    UNIQUE INDEX `SubscriptionPlan_referenceSlot_key`(`referenceSlot`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPrice` (
    `id` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL,
    `effectiveUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPrice_planId_effectiveFrom_key`(`planId`, `effectiveFrom`),
    UNIQUE INDEX `SubscriptionPrice_id_planId_currency_key`(`id`, `planId`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `startedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `suspendedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Subscription_companyId_key`(`companyId`),
    UNIQUE INDEX `Subscription_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `Subscription_companyId_id_planId_key`(`companyId`, `id`, `planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPayment` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `subscriptionId` CHAR(36) NOT NULL,
    `declaredById` CHAR(36) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `method` ENUM('CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'OTHER') NOT NULL,
    `externalReference` VARCHAR(120) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `validatedById` CHAR(36) NULL,
    `validatedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SubscriptionPayment_companyId_status_idx`(`companyId`, `status`),
    UNIQUE INDEX `SubscriptionPayment_companyId_id_subscriptionId_key`(`companyId`, `id`, `subscriptionId`),
    UNIQUE INDEX `SubscriptionPayment_companyId_id_key`(`companyId`, `id`),
    UNIQUE INDEX `SubscriptionPayment_companyId_id_subscriptionId_currency_key`(`companyId`, `id`, `subscriptionId`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPeriod` (
    `planId` CHAR(36) NOT NULL,
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `subscriptionId` CHAR(36) NOT NULL,
    `priceId` CHAR(36) NOT NULL,
    `paymentId` CHAR(36) NULL,
    `amountApplied` DECIMAL(19, 4) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SubscriptionPeriod_paymentId_key`(`paymentId`),
    UNIQUE INDEX `SubscriptionPeriod_companyId_subscriptionId_startsAt_key`(`companyId`, `subscriptionId`, `startsAt`),
    UNIQUE INDEX `SubscriptionPeriod_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionEvent` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `subscriptionId` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SubscriptionEvent_companyId_subscriptionId_createdAt_idx`(`companyId`, `subscriptionId`, `createdAt`),
    UNIQUE INDEX `SubscriptionEvent_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserDevice` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `pushToken` VARCHAR(255) NOT NULL,
    `platform` VARCHAR(20) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserDevice_pushToken_key`(`pushToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NOT NULL,
    `recipientUserId` CHAR(36) NULL,
    `channel` ENUM('EMAIL', 'PUSH') NOT NULL,
    `recipientAddress` VARCHAR(255) NOT NULL,
    `sourceEvent` VARCHAR(100) NOT NULL,
    `sourceId` VARCHAR(100) NOT NULL,
    `template` VARCHAR(100) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER UNSIGNED NOT NULL DEFAULT 5,
    `availableAt` DATETIME(3) NOT NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(100) NULL,
    `sentAt` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `dedupeKey` VARCHAR(190) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
    INDEX `Notification_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `Notification_companyId_recipientUserId_createdAt_idx`(`companyId`, `recipientUserId`, `createdAt`),
    UNIQUE INDEX `Notification_companyId_id_key`(`companyId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `companyId` CHAR(36) NULL,
    `agencyId` CHAR(36) NULL,
    `actorId` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(100) NOT NULL,
    `requestId` VARCHAR(100) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `AuditLog_companyId_entityType_entityId_idx`(`companyId`, `entityType`, `entityId`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GlobalRoleGrant` ADD CONSTRAINT `GlobalRoleGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `GlobalRoleGrant` ADD CONSTRAINT `GlobalRoleGrant_roleId_roleScope_fkey` FOREIGN KEY (`roleId`, `roleScope`) REFERENCES `Role`(`id`, `scope`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CompanyMembership` ADD CONSTRAINT `CompanyMembership_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CompanyMembership` ADD CONSTRAINT `CompanyMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CompanyMembership` ADD CONSTRAINT `CompanyMembership_roleId_roleScope_fkey` FOREIGN KEY (`roleId`, `roleScope`) REFERENCES `Role`(`id`, `scope`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Agency` ADD CONSTRAINT `Agency_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AgencyMembership` ADD CONSTRAINT `AgencyMembership_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AgencyMembership` ADD CONSTRAINT `AgencyMembership_companyId_userId_fkey` FOREIGN KEY (`companyId`, `userId`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AgencyMembership` ADD CONSTRAINT `AgencyMembership_companyId_agencyId_fkey` FOREIGN KEY (`companyId`, `agencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AgencyMembership` ADD CONSTRAINT `AgencyMembership_roleId_roleScope_fkey` FOREIGN KEY (`roleId`, `roleScope`) REFERENCES `Role`(`id`, `scope`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ShopMembership` ADD CONSTRAINT `ShopMembership_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ShopMembership` ADD CONSTRAINT `ShopMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ShopMembership` ADD CONSTRAINT `ShopMembership_roleId_roleScope_fkey` FOREIGN KEY (`roleId`, `roleScope`) REFERENCES `Role`(`id`, `scope`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CompanyShop` ADD CONSTRAINT `CompanyShop_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CompanyShop` ADD CONSTRAINT `CompanyShop_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_replacedById_fkey` FOREIGN KEY (`replacedById`) REFERENCES `Session`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccountToken` ADD CONSTRAINT `AccountToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuthEvent` ADD CONSTRAINT `AuthEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Stock` ADD CONSTRAINT `Stock_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Stock` ADD CONSTRAINT `Stock_companyId_shopId_fkey` FOREIGN KEY (`companyId`, `shopId`) REFERENCES `CompanyShop`(`companyId`, `shopId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Stock` ADD CONSTRAINT `Stock_companyId_agencyId_fkey` FOREIGN KEY (`companyId`, `agencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Stock` ADD CONSTRAINT `Stock_shopId_productId_fkey` FOREIGN KEY (`shopId`, `productId`) REFERENCES `Product`(`shopId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_companyId_originAgencyId_fkey` FOREIGN KEY (`companyId`, `originAgencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_companyId_destinationAgencyId_fkey` FOREIGN KEY (`companyId`, `destinationAgencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_companyId_initiatedById_fkey` FOREIGN KEY (`companyId`, `initiatedById`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Transfer` ADD CONSTRAINT `Transfer_companyId_carrierId_fkey` FOREIGN KEY (`companyId`, `carrierId`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferItem` ADD CONSTRAINT `TransferItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferItem` ADD CONSTRAINT `TransferItem_companyId_transferId_fkey` FOREIGN KEY (`companyId`, `transferId`) REFERENCES `Transfer`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferItem` ADD CONSTRAINT `TransferItem_companyId_shopId_fkey` FOREIGN KEY (`companyId`, `shopId`) REFERENCES `CompanyShop`(`companyId`, `shopId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferItem` ADD CONSTRAINT `TransferItem_shopId_productId_fkey` FOREIGN KEY (`shopId`, `productId`) REFERENCES `Product`(`shopId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferEvent` ADD CONSTRAINT `TransferEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferEvent` ADD CONSTRAINT `TransferEvent_companyId_transferId_fkey` FOREIGN KEY (`companyId`, `transferId`) REFERENCES `Transfer`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TransferEvent` ADD CONSTRAINT `TransferEvent_companyId_actorId_fkey` FOREIGN KEY (`companyId`, `actorId`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Recipient` ADD CONSTRAINT `Recipient_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_companyId_shopId_fkey` FOREIGN KEY (`companyId`, `shopId`) REFERENCES `CompanyShop`(`companyId`, `shopId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_companyId_agencyId_fkey` FOREIGN KEY (`companyId`, `agencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_companyId_recipientId_fkey` FOREIGN KEY (`companyId`, `recipientId`) REFERENCES `Recipient`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_companyId_orderId_shopId_fkey` FOREIGN KEY (`companyId`, `orderId`, `shopId`) REFERENCES `Order`(`companyId`, `id`, `shopId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_shopId_productId_fkey` FOREIGN KEY (`shopId`, `productId`) REFERENCES `Product`(`shopId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockReservation` ADD CONSTRAINT `StockReservation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockReservation` ADD CONSTRAINT `StockReservation_companyId_stockId_shopId_productId_fkey` FOREIGN KEY (`companyId`, `stockId`, `shopId`, `productId`) REFERENCES `Stock`(`companyId`, `id`, `shopId`, `productId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockReservation` ADD CONSTRAINT `StockReservation_companyId_orderItemId_shopId_productId_fkey` FOREIGN KEY (`companyId`, `orderItemId`, `shopId`, `productId`) REFERENCES `OrderItem`(`companyId`, `id`, `shopId`, `productId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_companyId_stockId_fkey` FOREIGN KEY (`companyId`, `stockId`) REFERENCES `Stock`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_companyId_reservationId_stockId_fkey` FOREIGN KEY (`companyId`, `reservationId`, `stockId`) REFERENCES `StockReservation`(`companyId`, `id`, `stockId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_companyId_transferId_fkey` FOREIGN KEY (`companyId`, `transferId`) REFERENCES `Transfer`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderEvent` ADD CONSTRAINT `OrderEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderEvent` ADD CONSTRAINT `OrderEvent_companyId_orderId_fkey` FOREIGN KEY (`companyId`, `orderId`) REFERENCES `Order`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OrderEvent` ADD CONSTRAINT `OrderEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_companyId_orderId_fkey` FOREIGN KEY (`companyId`, `orderId`) REFERENCES `Order`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_companyId_agencyId_fkey` FOREIGN KEY (`companyId`, `agencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_companyId_agencyId_courierId_fkey` FOREIGN KEY (`companyId`, `agencyId`, `courierId`) REFERENCES `AgencyMembership`(`companyId`, `agencyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_companyId_agencyId_courierId_fkey` FOREIGN KEY (`companyId`, `agencyId`, `courierId`) REFERENCES `AgencyMembership`(`companyId`, `agencyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_companyId_assignedById_fkey` FOREIGN KEY (`companyId`, `assignedById`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryEvent` ADD CONSTRAINT `DeliveryEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryEvent` ADD CONSTRAINT `DeliveryEvent_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryEvent` ADD CONSTRAINT `DeliveryEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `DeliveryOtp_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `DeliveryOtp_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryOtp` ADD CONSTRAINT `DeliveryOtp_companyId_courierId_fkey` FOREIGN KEY (`companyId`, `courierId`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_companyId_deliveryId_courierId_fkey` FOREIGN KEY (`companyId`, `deliveryId`, `courierId`) REFERENCES `Delivery`(`companyId`, `id`, `courierId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_companyId_courierId_fkey` FOREIGN KEY (`companyId`, `courierId`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_companyId_otpId_deliveryId_courierId_fkey` FOREIGN KEY (`companyId`, `otpId`, `deliveryId`, `courierId`) REFERENCES `DeliveryOtp`(`companyId`, `id`, `deliveryId`, `courierId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DeliveryProof` ADD CONSTRAINT `DeliveryProof_companyId_exceptionAuthorizedById_fkey` FOREIGN KEY (`companyId`, `exceptionAuthorizedById`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FileAsset` ADD CONSTRAINT `FileAsset_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FileAsset` ADD CONSTRAINT `FileAsset_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProofPhoto` ADD CONSTRAINT `ProofPhoto_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProofPhoto` ADD CONSTRAINT `ProofPhoto_companyId_proofId_fkey` FOREIGN KEY (`companyId`, `proofId`) REFERENCES `DeliveryProof`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProofPhoto` ADD CONSTRAINT `ProofPhoto_companyId_fileId_fkey` FOREIGN KEY (`companyId`, `fileId`) REFERENCES `FileAsset`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_companyId_deliveryId_fkey` FOREIGN KEY (`companyId`, `deliveryId`) REFERENCES `Delivery`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_companyId_agencyId_courierId_fkey` FOREIGN KEY (`companyId`, `agencyId`, `courierId`) REFERENCES `AgencyMembership`(`companyId`, `agencyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Collection` ADD CONSTRAINT `Collection_companyId_verifiedById_fkey` FOREIGN KEY (`companyId`, `verifiedById`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Remittance` ADD CONSTRAINT `Remittance_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Remittance` ADD CONSTRAINT `Remittance_companyId_agencyId_courierId_fkey` FOREIGN KEY (`companyId`, `agencyId`, `courierId`) REFERENCES `AgencyMembership`(`companyId`, `agencyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Remittance` ADD CONSTRAINT `Remittance_companyId_agencyId_confirmedById_fkey` FOREIGN KEY (`companyId`, `agencyId`, `confirmedById`) REFERENCES `AgencyMembership`(`companyId`, `agencyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceItem` ADD CONSTRAINT `RemittanceItem_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceItem` ADD CONSTRAINT `RemittanceItem_companyId_remittanceId_courierId_agencyId_cu_fkey` FOREIGN KEY (`companyId`, `remittanceId`, `courierId`, `agencyId`, `currency`) REFERENCES `Remittance`(`companyId`, `id`, `courierId`, `agencyId`, `currency`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceItem` ADD CONSTRAINT `RemittanceItem_companyId_collectionId_courierId_agencyId_cu_fkey` FOREIGN KEY (`companyId`, `collectionId`, `courierId`, `agencyId`, `currency`) REFERENCES `Collection`(`companyId`, `id`, `courierId`, `agencyId`, `currency`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CollectionEvent` ADD CONSTRAINT `CollectionEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CollectionEvent` ADD CONSTRAINT `CollectionEvent_companyId_collectionId_fkey` FOREIGN KEY (`companyId`, `collectionId`) REFERENCES `Collection`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CollectionEvent` ADD CONSTRAINT `CollectionEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceEvent` ADD CONSTRAINT `RemittanceEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceEvent` ADD CONSTRAINT `RemittanceEvent_companyId_remittanceId_fkey` FOREIGN KEY (`companyId`, `remittanceId`) REFERENCES `Remittance`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RemittanceEvent` ADD CONSTRAINT `RemittanceEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPrice` ADD CONSTRAINT `SubscriptionPrice_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_companyId_subscriptionId_fkey` FOREIGN KEY (`companyId`, `subscriptionId`) REFERENCES `Subscription`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_companyId_declaredById_fkey` FOREIGN KEY (`companyId`, `declaredById`) REFERENCES `CompanyMembership`(`companyId`, `userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPayment` ADD CONSTRAINT `SubscriptionPayment_validatedById_fkey` FOREIGN KEY (`validatedById`) REFERENCES `GlobalRoleGrant`(`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `SubscriptionPeriod_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `SubscriptionPeriod_companyId_subscriptionId_planId_fkey` FOREIGN KEY (`companyId`, `subscriptionId`, `planId`) REFERENCES `Subscription`(`companyId`, `id`, `planId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `SubscriptionPeriod_priceId_planId_currency_fkey` FOREIGN KEY (`priceId`, `planId`, `currency`) REFERENCES `SubscriptionPrice`(`id`, `planId`, `currency`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionPeriod` ADD CONSTRAINT `SubscriptionPeriod_companyId_paymentId_subscriptionId_curre_fkey` FOREIGN KEY (`companyId`, `paymentId`, `subscriptionId`, `currency`) REFERENCES `SubscriptionPayment`(`companyId`, `id`, `subscriptionId`, `currency`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionEvent` ADD CONSTRAINT `SubscriptionEvent_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionEvent` ADD CONSTRAINT `SubscriptionEvent_companyId_subscriptionId_fkey` FOREIGN KEY (`companyId`, `subscriptionId`) REFERENCES `Subscription`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SubscriptionEvent` ADD CONSTRAINT `SubscriptionEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `GlobalRoleGrant`(`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `UserDevice` ADD CONSTRAINT `UserDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_recipientUserId_fkey` FOREIGN KEY (`recipientUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_companyId_agencyId_fkey` FOREIGN KEY (`companyId`, `agencyId`) REFERENCES `Agency`(`companyId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
