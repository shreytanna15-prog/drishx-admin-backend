/**
 * Seed stock-wise reorder rules (procurement PDF §2.2, §3, §4).
 *
 * Idempotent: re-running updates the existing rule for a SKU rather than
 * creating duplicates. Only touches Single Vision / Kryptok / Progressive —
 * the lens families stock intake can actually move.
 *
 *   npm run db:seed-reorder-rules
 *
 * Optional environment overrides:
 *   REORDER_SEED_DRY_RUN=1        report what would change, write nothing
 *   REORDER_SEED_AUTO_PROCURE=0   create rules with auto procurement off
 */
import { LensType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = process.env.REORDER_SEED_DRY_RUN === "1";
const AUTO_PROCURE = process.env.REORDER_SEED_AUTO_PROCURE !== "0";

type RuleSeed = {
  lensType: LensType;
  /** Matched case-insensitively against brand / item / coating. */
  match: string[];
  minStock: number;
  targetStock: number;
  moq?: number;
};

/**
 * Thresholds mirror the worked example in the procurement spec: minimum is the
 * warning line, target is where stock should sit after replenishment.
 */
const RULES: RuleSeed[] = [
  {
    lensType: LensType.SINGLE_VISION,
    match: ["HC SV"],
    minStock: 20,
    targetStock: 100,
    moq: 50,
  },
  {
    lensType: LensType.SINGLE_VISION,
    match: ["WHITE SV", "WHITE 55MM"],
    minStock: 15,
    targetStock: 75,
  },
  {
    lensType: LensType.SINGLE_VISION,
    match: ["BLUE CUT SV"],
    minStock: 20,
    targetStock: 100,
  },
  {
    lensType: LensType.KRYPTOK,
    match: ["WHITE KT", "BLUE CUT KT"],
    minStock: 20,
    targetStock: 100,
  },
  {
    lensType: LensType.PROGRESSIVE,
    match: ["WHITE PROGRESSIVE", "PG BR HMC PROG"],
    minStock: 10,
    targetStock: 50,
  },
];

type CatalogRow = {
  id: string;
  brand: string | null;
  item: string | null;
  coating: string | null;
  quantity: number;
};

function haystack(row: CatalogRow): string {
  return [row.brand, row.item, row.coating]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function loadCatalog(lensType: LensType): Promise<CatalogRow[]> {
  const select = {
    id: true,
    brand: true,
    item: true,
    coating: true,
    quantity: true,
  } as const;

  if (lensType === LensType.SINGLE_VISION) {
    return prisma.singleVisionLens.findMany({ select });
  }
  if (lensType === LensType.KRYPTOK) {
    return prisma.kryptokLens.findMany({ select });
  }
  return prisma.progressiveLens.findMany({ select });
}

async function main() {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const rule of RULES) {
    const catalog = await loadCatalog(rule.lensType);
    const patterns = rule.match.map((m) => m.toLowerCase());

    const matched = catalog.filter((row) => {
      const text = haystack(row);
      return patterns.some((pattern) => text.includes(pattern));
    });

    if (matched.length === 0) {
      console.log(
        `⚠️  ${rule.lensType}: no catalogue rows matched ${rule.match.join(" / ")} — skipped`
      );
      continue;
    }

    for (const row of matched) {
      const data = {
        minStock: rule.minStock,
        targetStock: rule.targetStock,
        autoProcure: AUTO_PROCURE,
        moq: rule.moq ?? null,
      };

      const existing = await prisma.reorderRule.findUnique({
        where: {
          lensType_lensId: { lensType: rule.lensType, lensId: row.id },
        },
      });

      if (existing) {
        const same =
          existing.minStock === data.minStock &&
          existing.targetStock === data.targetStock &&
          existing.autoProcure === data.autoProcure &&
          existing.moq === data.moq;
        if (same) {
          unchanged += 1;
          continue;
        }
        if (!DRY_RUN) {
          await prisma.reorderRule.update({
            where: { id: existing.id },
            data,
          });
        }
        updated += 1;
      } else {
        if (!DRY_RUN) {
          await prisma.reorderRule.create({
            data: { lensType: rule.lensType, lensId: row.id, ...data },
          });
        }
        created += 1;
      }
    }

    console.log(
      `${DRY_RUN ? "[dry-run] " : ""}${rule.lensType}: ${matched.length} SKU(s) matched ${rule.match.join(" / ")}`
    );
  }

  console.log(
    `\n${DRY_RUN ? "Would apply" : "Applied"}: ${created} created, ${updated} updated, ${unchanged} unchanged.`
  );
  if (DRY_RUN) {
    console.log("Dry run — nothing was written.");
  }
}

main()
  .catch((error) => {
    console.error("seed-reorder-rules failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
