-- Audit & Logs module + soft-delete support

-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'VOIDED';

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

-- AlterTable lens SKUs
ALTER TABLE "SingleVisionLens" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "KryptokLens" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProgressiveLens" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('HUMAN', 'SYSTEM', 'AUTOMATION', 'INTEGRATION');
CREATE TYPE "AuditSource" AS ENUM ('WEB', 'MOBILE', 'ADMIN', 'SYSTEM', 'API');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVED', 'SOLD', 'RESERVED', 'RELEASED', 'ADJUSTED', 'PICKED', 'RESTORED', 'RETURNED', 'DAMAGED', 'WRITTEN_OFF');

-- CreateTable AuditSequence
CREATE TABLE "AuditSequence" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AuditSequence_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AuditSequence" ("id", "value") VALUES ('default', 0) ON CONFLICT DO NOTHING;

-- CreateTable AuditEvent
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'HUMAN',
    "actorUserId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "isHighRisk" BOOLEAN NOT NULL DEFAULT false,
    "source" "AuditSource" NOT NULL DEFAULT 'API',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "correlationId" TEXT,
    "clientRequestId" TEXT,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "changes" JSONB,
    "context" JSONB,
    "relatedRefs" JSONB,
    "message" TEXT,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditEvent_publicId_key" ON "AuditEvent"("publicId");
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");
CREATE INDEX "AuditEvent_actorUserId_occurredAt_idx" ON "AuditEvent"("actorUserId", "occurredAt");
CREATE INDEX "AuditEvent_module_action_idx" ON "AuditEvent"("module", "action");
CREATE INDEX "AuditEvent_entityType_entityId_occurredAt_idx" ON "AuditEvent"("entityType", "entityId", "occurredAt");
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");
CREATE INDEX "AuditEvent_isHighRisk_occurredAt_idx" ON "AuditEvent"("isHighRisk", "occurredAt");

-- CreateTable SecurityEvent
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "source" "AuditSource" NOT NULL DEFAULT 'API',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "context" JSONB,
    "message" TEXT,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_occurredAt_idx" ON "SecurityEvent"("occurredAt");
CREATE INDEX "SecurityEvent_action_occurredAt_idx" ON "SecurityEvent"("action", "occurredAt");
CREATE INDEX "SecurityEvent_actorEmail_occurredAt_idx" ON "SecurityEvent"("actorEmail", "occurredAt");

-- CreateTable SystemErrorLog
CREATE TABLE "SystemErrorLog" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'error',
    "code" TEXT,
    "message" TEXT NOT NULL,
    "route" TEXT,
    "correlationId" TEXT,
    "context" JSONB,
    CONSTRAINT "SystemErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SystemErrorLog_occurredAt_idx" ON "SystemErrorLog"("occurredAt");
CREATE INDEX "SystemErrorLog_route_occurredAt_idx" ON "SystemErrorLog"("route", "occurredAt");

-- CreateTable ActivityEvent
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "auditEventId" TEXT,
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityEvent_occurredAt_idx" ON "ActivityEvent"("occurredAt");
CREATE INDEX "ActivityEvent_entityType_entityId_occurredAt_idx" ON "ActivityEvent"("entityType", "entityId", "occurredAt");
CREATE INDEX "ActivityEvent_actorUserId_occurredAt_idx" ON "ActivityEvent"("actorUserId", "occurredAt");

-- CreateTable ProcessedClientRequest
CREATE TABLE "ProcessedClientRequest" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "auditEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedClientRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcessedClientRequest_clientRequestId_key" ON "ProcessedClientRequest"("clientRequestId");

-- CreateTable StockMovement
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantityDelta" DOUBLE PRECISION NOT NULL,
    "quantityBefore" DOUBLE PRECISION NOT NULL,
    "quantityAfter" DOUBLE PRECISION NOT NULL,
    "sourceType" TEXT,
    "referenceId" TEXT,
    "orderId" TEXT,
    "actorUserId" TEXT,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_lensType_lensId_createdAt_idx" ON "StockMovement"("lensType", "lensId", "createdAt");
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");
CREATE INDEX "StockMovement_referenceId_idx" ON "StockMovement"("referenceId");
