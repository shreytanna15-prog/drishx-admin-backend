/**
 * TEMPORARY / READ-ONLY — inspect LoyaltyTransaction TEXT vs Prisma enum drift.
 *
 * SELECT queries only. Does not INSERT/UPDATE/DELETE/DDL.
 * Never prints DATABASE_URL or credentials.
 *
 * Usage (from repo root):
 *   npx tsx scripts/inspect-loyalty-enum-drift.ts
 */

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "../app/lib/prisma";

const EXPECTED_TYPES = [
  "POINTS_EARNED",
  "ADVANCE_BONUS",
  "POINTS_REDEEMED",
  "POINTS_EXPIRED",
  "POINTS_REVERSED",
  "POINTS_ADJUSTED",
  "POINTS_CANCELLED",
] as const;

const EXPECTED_STATUSES = [
  "PENDING",
  "AVAILABLE",
  "REDEEMED",
  "EXPIRED",
  "REVERSED",
  "CANCELLED",
] as const;

function section(title: string) {
  console.log("\n" + "=".repeat(72));
  console.log(title);
  console.log("=".repeat(72));
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function main() {
  console.log("Loyalty enum drift inspection (READ-ONLY)");
  console.log("Connected via app Prisma pool (credentials not printed).");

  // 1) Distinct values + counts
  section("1) Distinct LoyaltyTransaction.type / status (with counts)");

  const typeCounts = await prisma.$queryRawUnsafe<
    Array<{ type: string | null; row_count: bigint | number }>
  >(
    `SELECT "type"::text AS type, COUNT(*)::bigint AS row_count
     FROM "LoyaltyTransaction"
     GROUP BY "type"
     ORDER BY "type" NULLS LAST`
  );

  const statusCounts = await prisma.$queryRawUnsafe<
    Array<{ status: string | null; row_count: bigint | number }>
  >(
    `SELECT "status"::text AS status, COUNT(*)::bigint AS row_count
     FROM "LoyaltyTransaction"
     GROUP BY "status"
     ORDER BY "status" NULLS LAST`
  );

  const totalRows = await prisma.$queryRawUnsafe<
    Array<{ total: bigint | number }>
  >(`SELECT COUNT(*)::bigint AS total FROM "LoyaltyTransaction"`);

  console.log("Total rows:", String(asRows(totalRows)[0]?.total ?? 0));
  console.log("type distribution:");
  console.table(
    asRows(typeCounts).map((r) => ({
      type: r.type,
      count: Number(r.row_count),
      in_schema_enum: r.type != null && EXPECTED_TYPES.includes(r.type as (typeof EXPECTED_TYPES)[number]),
    }))
  );
  console.log("status distribution:");
  console.table(
    asRows(statusCounts).map((r) => ({
      status: r.status,
      count: Number(r.row_count),
      in_schema_enum:
        r.status != null &&
        EXPECTED_STATUSES.includes(r.status as (typeof EXPECTED_STATUSES)[number]),
    }))
  );

  const unknownTypes = asRows(typeCounts)
    .map((r) => r.type)
    .filter(
      (t): t is string =>
        t != null && !EXPECTED_TYPES.includes(t as (typeof EXPECTED_TYPES)[number])
    );
  const unknownStatuses = asRows(statusCounts)
    .map((r) => r.status)
    .filter(
      (s): s is string =>
        s != null &&
        !EXPECTED_STATUSES.includes(s as (typeof EXPECTED_STATUSES)[number])
    );

  console.log(
    "Unknown type values (block enum ALTER if any):",
    unknownTypes.length ? unknownTypes : "(none)"
  );
  console.log(
    "Unknown status values (block enum ALTER if any):",
    unknownStatuses.length ? unknownStatuses : "(none)"
  );

  // 2) Column types / defaults
  section("2) PostgreSQL column types and defaults (LoyaltyTransaction)");

  const columns = await prisma.$queryRawUnsafe<
    Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      column_default: string | null;
      is_nullable: string;
    }>
  >(
    `SELECT column_name, data_type, udt_name, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'LoyaltyTransaction'
       AND column_name IN ('type', 'status')
     ORDER BY column_name`
  );
  console.table(asRows(columns));

  // 3) Enum type existence
  section("3) Existence of Prisma enum types in PostgreSQL");

  const enumTypes = await prisma.$queryRawUnsafe<
    Array<{ typname: string; nspname: string }>
  >(
    `SELECT t.typname, n.nspname
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname IN ('LoyaltyTransactionType', 'LoyaltyTransactionStatus')
     ORDER BY t.typname`
  );

  const found = new Set(asRows(enumTypes).map((r) => r.typname));
  console.log(
    "LoyaltyTransactionType exists:",
    found.has("LoyaltyTransactionType") ? "YES" : "NO"
  );
  console.log(
    "LoyaltyTransactionStatus exists:",
    found.has("LoyaltyTransactionStatus") ? "YES" : "NO"
  );
  if (asRows(enumTypes).length) {
    console.table(asRows(enumTypes));
  }

  const enumLabels = await prisma.$queryRawUnsafe<
    Array<{ enum_type: string; label: string; sortorder: number }>
  >(
    `SELECT t.typname AS enum_type, e.enumlabel AS label, e.enumsortorder AS sortorder
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typname IN ('LoyaltyTransactionType', 'LoyaltyTransactionStatus')
     ORDER BY t.typname, e.enumsortorder`
  );
  if (asRows(enumLabels).length) {
    console.log("Existing enum labels:");
    console.table(asRows(enumLabels));
  } else {
    console.log("No enum labels (types missing or empty).");
  }

  // 4) Migration history (loyalty-related + recent)
  section("4) Prisma migration history (loyalty-related + summary)");

  const loyaltyMigrations = await prisma.$queryRawUnsafe<
    Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      started_at: Date | null;
      applied_steps_count: number | null;
    }>
  >(
    `SELECT migration_name, finished_at, rolled_back_at, started_at, applied_steps_count
     FROM "_prisma_migrations"
     WHERE migration_name ILIKE '%loyalty%'
        OR migration_name ILIKE '%20260831100000%'
     ORDER BY started_at NULLS LAST, migration_name`
  );
  console.log("Loyalty-related rows in _prisma_migrations:");
  console.table(
    asRows(loyaltyMigrations).map((m) => ({
      migration_name: m.migration_name,
      finished_at: m.finished_at,
      rolled_back_at: m.rolled_back_at,
      started_at: m.started_at,
      applied_steps_count: m.applied_steps_count,
    }))
  );

  const recentMigrations = await prisma.$queryRawUnsafe<
    Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
      started_at: Date | null;
    }>
  >(
    `SELECT migration_name, finished_at, rolled_back_at, started_at
     FROM "_prisma_migrations"
     ORDER BY started_at DESC NULLS LAST
     LIMIT 15`
  );
  console.log("Most recent 15 migrations:");
  console.table(
    asRows(recentMigrations).map((m) => ({
      migration_name: m.migration_name,
      finished_at: m.finished_at,
      rolled_back_at: m.rolled_back_at,
      started_at: m.started_at,
    }))
  );

  section("Summary");
  const typeCol = asRows(columns).find((c) => c.column_name === "type");
  const statusCol = asRows(columns).find((c) => c.column_name === "status");
  const drift =
    !found.has("LoyaltyTransactionType") ||
    !found.has("LoyaltyTransactionStatus") ||
    typeCol?.data_type === "text" ||
    statusCol?.data_type === "text" ||
    typeCol?.udt_name === "text" ||
    statusCol?.udt_name === "text";

  console.log(
    drift
      ? "LIKELY DRIFT: Prisma expects native enums; DB types/columns do not fully match."
      : "Enums appear present; still verify labels match schema.prisma."
  );
  console.log("Repo migration that created TEXT columns: 20260831100000_loyalty_points");
  console.log("Expected schema enums: LoyaltyTransactionType, LoyaltyTransactionStatus");
  console.log("Done. No data was modified.");
}

main()
  .catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    // Avoid dumping full error objects that might embed connection details.
    console.error("Inspection failed:", message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
