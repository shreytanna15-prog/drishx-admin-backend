-- Forward-only fix: LoyaltyTransaction.type/status were created as TEXT
-- (20260831100000_loyalty_points) while prisma/schema.prisma expects native
-- PostgreSQL enums. Prisma Client casts to these types → 42704 on loyalty queries.
--
-- Explicit BEGIN/COMMIT for atomic enum create + column convert (Prisma 7 / PostgreSQL).
--
-- Preconditions (confirmed by inspection): 0 rows; TEXT columns; enums missing.
-- Does not drop tables or rewrite applied migration history.

BEGIN;

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM (
  'POINTS_EARNED',
  'ADVANCE_BONUS',
  'POINTS_REDEEMED',
  'POINTS_EXPIRED',
  'POINTS_REVERSED',
  'POINTS_ADJUSTED',
  'POINTS_CANCELLED'
);

-- CreateEnum
CREATE TYPE "LoyaltyTransactionStatus" AS ENUM (
  'PENDING',
  'AVAILABLE',
  'REDEEMED',
  'EXPIRED',
  'REVERSED',
  'CANCELLED'
);

-- Drop TEXT default before type change (avoids default expression cast failures).
ALTER TABLE "LoyaltyTransaction" ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable: TEXT → enum (USING casts existing values; safe with 0 rows).
ALTER TABLE "LoyaltyTransaction"
  ALTER COLUMN "type" TYPE "LoyaltyTransactionType"
    USING ("type"::"LoyaltyTransactionType"),
  ALTER COLUMN "status" TYPE "LoyaltyTransactionStatus"
    USING ("status"::"LoyaltyTransactionStatus");

-- Restore NOT NULL default as typed enum literal (matches original 'PENDING').
ALTER TABLE "LoyaltyTransaction"
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"LoyaltyTransactionStatus";

COMMIT;
