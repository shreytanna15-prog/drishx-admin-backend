/**
 * RW-09 legacy catalog backfill CLI.
 *
 * Default: dry-run only (read inventory + CatalogProduct, print JSON summary).
 * Apply requires BOTH --apply and CATALOG_BACKFILL_ALLOW_WRITE=1, and still
 * refuses NODE_ENV=production unless ALLOW_PRODUCTION_CATALOG_BACKFILL=1.
 *
 * Usage:
 *   npx tsx scripts/catalog-legacy-backfill.ts
 *   npx tsx scripts/catalog-legacy-backfill.ts --dry-run
 *   CATALOG_BACKFILL_ALLOW_WRITE=1 npx tsx scripts/catalog-legacy-backfill.ts --apply
 *
 * Do NOT run --apply against production without explicit approval.
 */
import "dotenv/config";
import {
  applyLegacyCatalogBackfill,
  runLegacyCatalogBackfillDryRun,
} from "../app/lib/catalog/legacy-backfill";

const wantApply = process.argv.includes("--apply");
const dryRunFlag =
  process.argv.includes("--dry-run") || !wantApply;

async function main() {
  if (wantApply && !dryRunFlag) {
    console.error(
      "APPLY MODE requested. Refusing unless CATALOG_BACKFILL_ALLOW_WRITE=1."
    );
    const result = await applyLegacyCatalogBackfill({ allowWrite: true });
    console.log(JSON.stringify({ mode: "apply", ...result }, null, 2));
    return;
  }

  console.error("Dry-run only — no CatalogProduct / CatalogRange writes.");
  const report = await runLegacyCatalogBackfillDryRun();
  const summary = {
    mode: report.mode,
    inspectedLensRows: report.inspectedLensRows,
    productGroupsIdentified: report.productGroupsIdentified,
    productsWouldCreate: report.productsWouldCreate,
    productsAlreadyExist: report.productsAlreadyExist,
    rangesWouldLink: report.rangesWouldLink,
    rangesAlreadyLinked: report.rangesAlreadyLinked,
    leavesMissingBounds: report.leavesMissingBounds,
    overlappingRangesWithinGroup: report.overlappingRangesWithinGroup,
    malformedMetadata: report.malformedMetadata,
    identityConflicts: report.identityConflicts,
    requiresManualReview: report.requiresManualReview,
    sampleProducts: report.products.slice(0, 20).map((p) => ({
      identityKey: p.identityKey,
      leafCount: p.leafCount,
      wouldCreateProduct: p.wouldCreateProduct,
      rangesToLink: p.rangesToLink,
      rangesAlreadyLinked: p.rangesAlreadyLinked,
      leavesMissingBounds: p.leavesMissingBounds,
      internalOverlaps: p.internalOverlaps.length,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // prisma disconnect via process exit; avoid mutating DB here.
  });
