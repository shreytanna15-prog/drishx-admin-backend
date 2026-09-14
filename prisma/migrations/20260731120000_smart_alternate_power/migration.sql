-- Smart Alternate Power (retail)

CREATE TYPE "PowerVersionSource" AS ENUM ('ORIGINAL', 'ALTERNATE');
CREATE TYPE "PowerVersionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'POWER_NOT_AVAILABLE', 'FINAL_FULFILLED');
CREATE TYPE "AlternateAvailability" AS ENUM ('WAREHOUSE', 'SUPPLIER');
CREATE TYPE "AlternateSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALTERNATE_POWER_SUGGESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALTERNATE_POWER_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ALTERNATE_POWER_REJECTED';

CREATE TABLE "OrderPowerVersion" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sph" DECIMAL(65,30),
    "cyl" DECIMAL(65,30),
    "axis" INTEGER,
    "add" DECIMAL(65,30),
    "eye" TEXT,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT,
    "source" "PowerVersionSource" NOT NULL DEFAULT 'ORIGINAL',
    "status" "PowerVersionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFinalFulfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPowerVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AlternatePowerSuggestion" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "forVersionId" TEXT NOT NULL,
    "sph" DECIMAL(65,30) NOT NULL,
    "cyl" DECIMAL(65,30),
    "axis" INTEGER,
    "add" DECIMAL(65,30),
    "eye" TEXT,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "availability" "AlternateAvailability" NOT NULL,
    "etaDays" INTEGER,
    "distanceScore" DOUBLE PRECISION NOT NULL,
    "status" "AlternateSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlternatePowerSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderPowerVersion_orderId_versionNumber_key" ON "OrderPowerVersion"("orderId", "versionNumber");
CREATE INDEX "OrderPowerVersion_orderId_status_idx" ON "OrderPowerVersion"("orderId", "status");
CREATE INDEX "OrderPowerVersion_orderId_isFinalFulfilled_idx" ON "OrderPowerVersion"("orderId", "isFinalFulfilled");

CREATE INDEX "AlternatePowerSuggestion_orderId_status_idx" ON "AlternatePowerSuggestion"("orderId", "status");
CREATE INDEX "AlternatePowerSuggestion_forVersionId_idx" ON "AlternatePowerSuggestion"("forVersionId");

CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

ALTER TABLE "OrderPowerVersion" ADD CONSTRAINT "OrderPowerVersion_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderPowerVersion" ADD CONSTRAINT "OrderPowerVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderPowerVersion" ADD CONSTRAINT "OrderPowerVersion_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AlternatePowerSuggestion" ADD CONSTRAINT "AlternatePowerSuggestion_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlternatePowerSuggestion" ADD CONSTRAINT "AlternatePowerSuggestion_forVersionId_fkey" FOREIGN KEY ("forVersionId") REFERENCES "OrderPowerVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
