/**
 * Removes duplicate lens catalog rows (same product, multiple DB ids).
 *
 * For each duplicate group:
 *   - Keeps one row (highest quantity, then newest)
 *   - Sums quantities into the kept row
 *   - Reassigns orders from removed rows to the kept row
 *   - Deletes the extra rows
 *
 * Usage:
 *   npm run db:dedupe-lenses          # apply changes
 *   npm run db:dedupe-lenses:dry      # preview only
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const dryRun = process.argv.includes("--dry-run");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type MergeStats = {
  groups: number;
  removed: number;
  ordersReassigned: number;
};

function pickKeeper<T extends { id: string; quantity: number; createdAt: Date }>(rows: T[]): T {
  return rows.reduce((best, row) => {
    if (row.quantity > best.quantity) return row;
    if (row.quantity < best.quantity) return best;
    return row.createdAt > best.createdAt ? row : best;
  });
}

function groupByKey<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

function singleVisionKey(row: {
  category: string | null;
  brand: string;
  item: string | null;
  index: unknown;
  coating: string;
  sph: unknown;
  cyl: unknown | null;
  crossPower?: unknown | null;
}): string {
  return [
    row.category ?? "",
    row.brand,
    row.item ?? "",
    Number(row.index),
    row.coating,
    row.crossPower === null || row.crossPower === undefined ? "" : Number(row.crossPower),
    row.sph === null || row.sph === undefined ? "" : Number(row.sph),
    row.cyl === null || row.cyl === undefined ? "" : Number(row.cyl),
  ].join("|");
}

function kryptokKey(row: {
  category: string | null;
  brand: string | null;
  coating: string | null;
  sph: unknown;
  cyl: unknown | null;
  axis: number | null;
  add: unknown;
}): string {
  return [
    row.category ?? "",
    row.brand ?? "",
    row.coating ?? "",
    Number(row.sph),
    row.cyl === null || row.cyl === undefined ? "" : Number(row.cyl),
    row.axis ?? "",
    Number(row.add),
  ].join("|");
}

function progressiveKey(row: {
  category: string | null;
  item: string;
  brand: string;
  type: string;
  coating: string;
  index: unknown;
  sph: unknown;
  cyl: unknown | null;
  axis: number | null;
  add: unknown;
  eye: string;
}): string {
  return [
    row.category ?? "",
    row.item,
    row.brand,
    row.type,
    row.coating,
    Number(row.index),
    Number(row.sph),
    row.cyl === null || row.cyl === undefined ? "" : Number(row.cyl),
    row.axis ?? "",
    Number(row.add),
    row.eye,
  ].join("|");
}

async function mergeSingleVision(): Promise<MergeStats> {
  const stats: MergeStats = { groups: 0, removed: 0, ordersReassigned: 0 };
  const rows = await prisma.singleVisionLens.findMany();
  const groups = groupByKey(rows, singleVisionKey);

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    stats.groups += 1;
    const keeper = pickKeeper(group);
    const duplicates = group.filter((row) => row.id !== keeper.id);
    const mergedQuantity = group.reduce((sum, row) => sum + row.quantity, 0);

    console.log(`\n[Single Vision] ${key}`);
    console.log(`  Keep: ${keeper.id} (qty ${keeper.quantity} → ${mergedQuantity})`);
    for (const dup of duplicates) {
      console.log(`  Remove: ${dup.id} (qty ${dup.quantity})`);
    }

    if (dryRun) {
      stats.removed += duplicates.length;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const updated = await tx.order.updateMany({
          where: { singleVisionLensId: dup.id },
          data: { singleVisionLensId: keeper.id },
        });
        stats.ordersReassigned += updated.count;
      }

      await tx.singleVisionLens.update({
        where: { id: keeper.id },
        data: { quantity: mergedQuantity },
      });

      await tx.singleVisionLens.deleteMany({
        where: { id: { in: duplicates.map((d) => d.id) } },
      });
    });

    stats.removed += duplicates.length;
  }

  return stats;
}

async function mergeKryptok(): Promise<MergeStats> {
  const stats: MergeStats = { groups: 0, removed: 0, ordersReassigned: 0 };
  const rows = await prisma.kryptokLens.findMany();
  const groups = groupByKey(rows, kryptokKey);

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    stats.groups += 1;
    const keeper = pickKeeper(group);
    const duplicates = group.filter((row) => row.id !== keeper.id);
    const mergedQuantity = group.reduce((sum, row) => sum + row.quantity, 0);

    console.log(`\n[Kryptok] ${key}`);
    console.log(`  Keep: ${keeper.id} (qty ${keeper.quantity} → ${mergedQuantity})`);
    for (const dup of duplicates) {
      console.log(`  Remove: ${dup.id} (qty ${dup.quantity})`);
    }

    if (dryRun) {
      stats.removed += duplicates.length;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const updated = await tx.order.updateMany({
          where: { kryptokLensId: dup.id },
          data: { kryptokLensId: keeper.id },
        });
        stats.ordersReassigned += updated.count;
      }

      await tx.kryptokLens.update({
        where: { id: keeper.id },
        data: { quantity: mergedQuantity },
      });

      await tx.kryptokLens.deleteMany({
        where: { id: { in: duplicates.map((d) => d.id) } },
      });
    });

    stats.removed += duplicates.length;
  }

  return stats;
}

async function mergeProgressive(): Promise<MergeStats> {
  const stats: MergeStats = { groups: 0, removed: 0, ordersReassigned: 0 };
  const rows = await prisma.progressiveLens.findMany();
  const groups = groupByKey(rows, progressiveKey);

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    stats.groups += 1;
    const keeper = pickKeeper(group);
    const duplicates = group.filter((row) => row.id !== keeper.id);
    const mergedQuantity = group.reduce((sum, row) => sum + row.quantity, 0);

    console.log(`\n[Progressive] ${key}`);
    console.log(`  Keep: ${keeper.id} (qty ${keeper.quantity} → ${mergedQuantity})`);
    for (const dup of duplicates) {
      console.log(`  Remove: ${dup.id} (qty ${dup.quantity})`);
    }

    if (dryRun) {
      stats.removed += duplicates.length;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const dup of duplicates) {
        const updated = await tx.order.updateMany({
          where: { progressiveLensId: dup.id },
          data: { progressiveLensId: keeper.id },
        });
        stats.ordersReassigned += updated.count;
      }

      await tx.progressiveLens.update({
        where: { id: keeper.id },
        data: { quantity: mergedQuantity },
      });

      await tx.progressiveLens.deleteMany({
        where: { id: { in: duplicates.map((d) => d.id) } },
      });
    });

    stats.removed += duplicates.length;
  }

  return stats;
}

function printTableSummary(label: string, stats: MergeStats) {
  console.log(`\n${label}:`);
  console.log(`  Duplicate groups: ${stats.groups}`);
  console.log(`  Rows ${dryRun ? "to remove" : "removed"}: ${stats.removed}`);
  console.log(`  Orders ${dryRun ? "to reassign" : "reassigned"}: ${stats.ordersReassigned}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in .env");
  }

  console.log(dryRun ? "=== DRY RUN (no database changes) ===" : "=== Removing duplicate lenses ===");

  const sv = await mergeSingleVision();
  const kt = await mergeKryptok();
  const pg = await mergeProgressive();

  printTableSummary("Single Vision", sv);
  printTableSummary("Kryptok", kt);
  printTableSummary("Progressive", pg);

  const totalRemoved = sv.removed + kt.removed + pg.removed;
  const totalGroups = sv.groups + kt.groups + pg.groups;

  console.log("\n--- Total ---");
  console.log(`  Duplicate groups: ${totalGroups}`);
  console.log(`  Rows ${dryRun ? "to remove" : "removed"}: ${totalRemoved}`);

  if (dryRun && totalRemoved > 0) {
    console.log("\nRun without --dry-run to apply: npm run db:dedupe-lenses");
  } else if (!dryRun && totalRemoved === 0) {
    console.log("\nNo duplicates found.");
  } else if (!dryRun) {
    console.log("\nDone. Duplicate lens rows have been merged.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
