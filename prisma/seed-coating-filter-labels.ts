/**
 * Backfill CoatingFilterLabel rows from distinct product coatings.
 * Safe to re-run (upsert by lensType + name). Skips hardcoat grades.
 *
 * Usage: npx tsx prisma/seed-coating-filter-labels.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { isHardcoatGradeCoating } from "../app/lib/lens-power-shape-filter";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type LensType = "single-vision" | "kryptok" | "progressive";

type CoatingCount = { coating: string; count: number };

function normalizeCoatings(
  rows: Array<{ coating: string | null; count: number }>
): string[] {
  const byKey = new Map<string, CoatingCount>();

  for (const row of rows) {
    const raw = row.coating?.trim() ?? "";
    if (!raw || isHardcoatGradeCoating(raw)) continue;
    const key = raw.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { coating: raw, count: row.count });
      continue;
    }
    existing.count += row.count;
    if (row.count > existing.count - row.count) {
      existing.coating = raw;
    }
  }

  return Array.from(byKey.values())
    .map((entry) => entry.coating)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function loadCoatingsForType(type: LensType): Promise<string[]> {
  if (type === "single-vision") {
    const groups = await prisma.singleVisionLens.groupBy({
      by: ["coating"],
      _count: { _all: true },
    });
    return normalizeCoatings(
      groups.map((g) => ({ coating: g.coating, count: g._count._all }))
    );
  }

  if (type === "progressive") {
    const groups = await prisma.progressiveLens.groupBy({
      by: ["coating"],
      _count: { _all: true },
    });
    return normalizeCoatings(
      groups.map((g) => ({ coating: g.coating, count: g._count._all }))
    );
  }

  const groups = await prisma.kryptokLens.groupBy({
    by: ["coating"],
    where: { coating: { not: null } },
    _count: { _all: true },
  });
  return normalizeCoatings(
    groups.map((g) => ({ coating: g.coating, count: g._count._all }))
  );
}

async function seedType(type: LensType): Promise<{ created: number; updated: number }> {
  const coatings = await loadCoatingsForType(type);
  let created = 0;
  let updated = 0;

  for (let index = 0; index < coatings.length; index += 1) {
    const name = coatings[index];
    const existing = await prisma.coatingFilterLabel.findUnique({
      where: {
        lensType_name: { lensType: type, name },
      },
    });

    if (existing) {
      await prisma.coatingFilterLabel.update({
        where: { id: existing.id },
        data: {
          sortOrder: existing.isSystem ? index : existing.sortOrder,
          isSystem: true,
        },
      });
      updated += 1;
    } else {
      // Prefer matching case-insensitive existing row under a different casing.
      const allForType = await prisma.coatingFilterLabel.findMany({
        where: { lensType: type },
        select: { id: true, name: true },
      });
      const caseMatch = allForType.find(
        (row) => row.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (caseMatch) {
        updated += 1;
        continue;
      }

      await prisma.coatingFilterLabel.create({
        data: {
          lensType: type,
          name,
          sortOrder: index,
          isSystem: true,
          isActive: true,
        },
      });
      created += 1;
    }
  }

  return { created, updated };
}

async function main() {
  const types: LensType[] = ["single-vision", "kryptok", "progressive"];
  let created = 0;
  let updated = 0;

  for (const type of types) {
    const result = await seedType(type);
    created += result.created;
    updated += result.updated;
    console.log(
      `${type}: ${result.created} created, ${result.updated} updated`
    );
  }

  console.log(
    `Coating filter labels: ${created} created, ${updated} updated total.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
