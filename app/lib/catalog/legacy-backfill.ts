/**
 * RW-09 legacy catalog backfill — DB dry-run + gated apply.
 * Pure planner lives in legacy-backfill-plan.ts (safe for unit tests).
 */

import {
  CatalogLeafStorage,
  CatalogProductStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../prisma";
import { discoverLegacyProductGroups } from "./legacy-leaves";
import {
  planLegacyCatalogBackfill,
  type LegacyBackfillDryRunReport,
} from "./legacy-backfill-plan";

export {
  planLegacyCatalogBackfill,
  type BackfillProductPlan,
  type BackfillRangePlan,
  type LegacyBackfillDryRunReport,
} from "./legacy-backfill-plan";

/** Load DB state and produce a dry-run report. Read-only. */
export async function runLegacyCatalogBackfillDryRun(options?: {
  takePerFamily?: number;
}): Promise<LegacyBackfillDryRunReport> {
  const [groups, existingProducts, linkedLeaves] = await Promise.all([
    discoverLegacyProductGroups({ takePerFamily: options?.takePerFamily }),
    prisma.catalogProduct.findMany({
      select: { id: true, identityKey: true },
    }),
    prisma.catalogRangeLeaf.findMany({
      select: { lensType: true, lensId: true },
    }),
  ]);

  const existingProductsByIdentity = new Map(
    existingProducts.map((p) => [p.identityKey, p.id])
  );
  const linkedLensKeys = new Set(
    linkedLeaves.map((l) => `${l.lensType}:${l.lensId}`)
  );

  return planLegacyCatalogBackfill({
    groups,
    linkedLensKeys,
    existingProductsByIdentity,
  });
}

/**
 * Apply backfill. Gated — see env guards. Do not run against production
 * without explicit approval.
 */
export async function applyLegacyCatalogBackfill(options: {
  allowWrite: boolean;
  takePerFamily?: number;
  dryRunReport?: LegacyBackfillDryRunReport;
}): Promise<{ createdProducts: number; linkedRanges: number }> {
  if (!options.allowWrite) {
    throw new Error("applyLegacyCatalogBackfill refused: allowWrite is false.");
  }
  if (process.env.CATALOG_BACKFILL_ALLOW_WRITE !== "1") {
    throw new Error(
      "applyLegacyCatalogBackfill refused: set CATALOG_BACKFILL_ALLOW_WRITE=1."
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_CATALOG_BACKFILL !== "1"
  ) {
    throw new Error(
      "applyLegacyCatalogBackfill refused: production guard. Set ALLOW_PRODUCTION_CATALOG_BACKFILL=1 only after explicit approval."
    );
  }

  const report =
    options.dryRunReport ??
    (await runLegacyCatalogBackfillDryRun({
      takePerFamily: options.takePerFamily,
    }));

  let createdProducts = 0;
  let linkedRanges = 0;

  for (const plan of report.products) {
    await prisma.$transaction(async (tx) => {
      let productId = plan.existingCatalogProductId;
      if (!productId) {
        const price = plan.ranges.find((r) => r.price > 0)?.price ?? 1;
        const created = await tx.catalogProduct.create({
          data: {
            lensFamily: plan.lensFamily,
            category: plan.category,
            brand: plan.brand,
            item: plan.item,
            index: plan.index != null ? new Prisma.Decimal(plan.index) : null,
            coating: plan.coating,
            progressiveType: plan.progressiveType,
            defaultPrice: price,
            identityKey: plan.identityKey,
            status: CatalogProductStatus.ACTIVE,
            notes: "Linked from legacy inventory backfill",
          },
        });
        productId = created.id;
        createdProducts += 1;
      }

      for (const range of plan.ranges) {
        if (range.alreadyLinked || range.missingBounds) continue;
        const existingLeaf = await tx.catalogRangeLeaf.findUnique({
          where: {
            lensType_lensId: {
              lensType: range.lensType,
              lensId: range.lensId,
            },
          },
        });
        if (existingLeaf) continue;

        let label = range.label;
        const clash = await tx.catalogRange.findUnique({
          where: {
            productId_label: { productId: productId!, label },
          },
        });
        if (clash) {
          label = `${label}-${range.lensId.slice(0, 6)}`.slice(0, 64);
        }

        const createdRange = await tx.catalogRange.create({
          data: {
            productId: productId!,
            label,
            sphStart: range.sphStart,
            sphEnd: range.sphEnd,
            cylStart: range.cylStart,
            cylEnd: range.cylEnd,
            add: range.add,
            axis: range.axis,
            eye:
              range.eye === "LEFT" || range.eye === "RIGHT" ? range.eye : null,
            price: range.price > 0 ? range.price : 1,
            costPrice: range.costPrice,
            powerCount: 1,
            leafStorage: CatalogLeafStorage.LEGACY_BAND,
            lensType: range.lensType,
            lensId: range.lensId,
          },
        });
        await tx.catalogRangeLeaf.create({
          data: {
            rangeId: createdRange.id,
            lensType: range.lensType,
            lensId: range.lensId,
          },
        });
        linkedRanges += 1;
      }
    });
  }

  return { createdProducts, linkedRanges };
}
