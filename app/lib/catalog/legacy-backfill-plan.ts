/**
 * Pure RW-09 legacy backfill planner (no Prisma / no DATABASE_URL).
 * Used by unit tests and by the DB-backed dry-run wrapper.
 */

import { CatalogLeafStorage, CatalogLensFamily, LensType } from "@prisma/client";
import type { LegacyLensLeaf, LegacyProductGroup } from "./legacy-leaves-types";
import { formatRangeLabel } from "./range-math";

export type BackfillRangePlan = {
  identityKey: string;
  label: string;
  lensId: string;
  lensType: LensType;
  leafStorage: typeof CatalogLeafStorage.LEGACY_BAND;
  sphStart: number;
  sphEnd: number;
  cylStart: number | null;
  cylEnd: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  price: number;
  costPrice: number | null;
  quantity: number;
  isDisabled: boolean;
  alreadyLinked: boolean;
  missingBounds: boolean;
};

export type BackfillProductPlan = {
  identityKey: string;
  lensFamily: CatalogLensFamily;
  category: string | null;
  brand: string;
  item: string | null;
  index: number | null;
  coating: string;
  progressiveType: string | null;
  leafCount: number;
  existingCatalogProductId: string | null;
  wouldCreateProduct: boolean;
  ranges: BackfillRangePlan[];
  rangesToLink: number;
  rangesAlreadyLinked: number;
  leavesMissingBounds: number;
  internalOverlaps: Array<{ a: string; b: string; labelA: string; labelB: string }>;
};

export type LegacyBackfillDryRunReport = {
  mode: "dry-run";
  inspectedLensRows: number;
  productGroupsIdentified: number;
  productsWouldCreate: number;
  productsAlreadyExist: number;
  rangesWouldLink: number;
  rangesAlreadyLinked: number;
  leavesMissingBounds: number;
  identityConflicts: Array<{ identityKey: string; reason: string }>;
  overlappingRangesWithinGroup: number;
  malformedMetadata: number;
  requiresManualReview: string[];
  products: BackfillProductPlan[];
};

function familyToLensType(family: CatalogLensFamily | string): LensType {
  if (family === "SINGLE_VISION") return LensType.SINGLE_VISION;
  if (family === "KRYPTOK") return LensType.KRYPTOK;
  return LensType.PROGRESSIVE;
}

function labelForLeaf(leaf: LegacyLensLeaf, used: Set<string>): string {
  const base = leaf.bounds
    ? formatRangeLabel(leaf.bounds).slice(0, 48)
    : `leaf-${leaf.id.slice(0, 8)}`;
  let label = base;
  if (used.has(label)) {
    label = `${base}-${leaf.id.slice(0, 6)}`.slice(0, 64);
  }
  used.add(label);
  return label;
}

function findInternalOverlaps(
  leaves: LegacyLensLeaf[]
): Array<{ a: string; b: string; labelA: string; labelB: string }> {
  const hits: Array<{ a: string; b: string; labelA: string; labelB: string }> =
    [];
  const withBounds = leaves.filter((l) => l.bounds);
  for (let i = 0; i < withBounds.length; i++) {
    for (let j = i + 1; j < withBounds.length; j++) {
      const a = withBounds[i]!;
      const b = withBounds[j]!;
      if (a.add != null && b.add != null && Number(a.add) !== Number(b.add)) {
        continue;
      }
      if (a.axis != null && b.axis != null && a.axis !== b.axis) continue;
      if (
        a.eye &&
        b.eye &&
        a.eye.toUpperCase() !== b.eye.toUpperCase()
      ) {
        continue;
      }
      const aLow = Math.min(a.bounds!.sph.start, a.bounds!.sph.end);
      const aHigh = Math.max(a.bounds!.sph.start, a.bounds!.sph.end);
      const bLow = Math.min(b.bounds!.sph.start, b.bounds!.sph.end);
      const bHigh = Math.max(b.bounds!.sph.start, b.bounds!.sph.end);
      const sphOverlap = aLow <= bHigh && bLow <= aHigh;
      const aCyl = a.bounds!.cyl;
      const bCyl = b.bounds!.cyl;
      let cylOverlap = true;
      if (aCyl && bCyl) {
        const acLow = Math.min(aCyl.start, aCyl.end);
        const acHigh = Math.max(aCyl.start, aCyl.end);
        const bcLow = Math.min(bCyl.start, bCyl.end);
        const bcHigh = Math.max(bCyl.start, bCyl.end);
        cylOverlap = acLow <= bcHigh && bcLow <= acHigh;
      }
      if (sphOverlap && cylOverlap) {
        hits.push({
          a: a.id,
          b: b.id,
          labelA: formatRangeLabel(a.bounds!),
          labelB: formatRangeLabel(b.bounds!),
        });
      }
    }
  }
  return hits;
}

export function planLegacyCatalogBackfill(input: {
  groups: LegacyProductGroup[];
  linkedLensKeys: Set<string>;
  existingProductsByIdentity: Map<string, string>;
}): LegacyBackfillDryRunReport {
  const products: BackfillProductPlan[] = [];
  const identityConflicts: Array<{ identityKey: string; reason: string }> = [];
  const requiresManualReview: string[] = [];
  let inspectedLensRows = 0;
  let rangesWouldLink = 0;
  let rangesAlreadyLinked = 0;
  let leavesMissingBounds = 0;
  let overlappingRangesWithinGroup = 0;
  let malformedMetadata = 0;
  let productsWouldCreate = 0;
  let productsAlreadyExist = 0;

  for (const group of input.groups) {
    inspectedLensRows += group.leafCount;
    const existingId =
      input.existingProductsByIdentity.get(group.identityKey) ?? null;
    if (existingId) productsAlreadyExist += 1;
    else productsWouldCreate += 1;

    const usedLabels = new Set<string>();
    const ranges: BackfillRangePlan[] = [];
    let groupMissingBounds = 0;
    let groupAlready = 0;
    let groupToLink = 0;

    for (const leaf of group.leaves) {
      const lensType = familyToLensType(group.lensFamily);
      const linkKey = `${lensType}:${leaf.id}`;
      const alreadyLinked = input.linkedLensKeys.has(linkKey);
      const missingBounds = !leaf.bounds;
      if (missingBounds) {
        groupMissingBounds += 1;
        leavesMissingBounds += 1;
        malformedMetadata += 1;
      }
      if (alreadyLinked) {
        groupAlready += 1;
        rangesAlreadyLinked += 1;
      } else if (!missingBounds) {
        groupToLink += 1;
        rangesWouldLink += 1;
      }

      const label = labelForLeaf(leaf, usedLabels);
      ranges.push({
        identityKey: group.identityKey,
        label,
        lensId: leaf.id,
        lensType,
        leafStorage: CatalogLeafStorage.LEGACY_BAND,
        sphStart: leaf.bounds?.sph.start ?? 0,
        sphEnd: leaf.bounds?.sph.end ?? leaf.sph ?? 0,
        cylStart: leaf.bounds?.cyl?.start ?? null,
        cylEnd: leaf.bounds?.cyl?.end ?? null,
        add: leaf.add,
        axis: leaf.axis,
        eye: leaf.eye,
        price: leaf.price,
        costPrice: leaf.costPrice,
        quantity: leaf.quantity,
        isDisabled: leaf.isDisabled,
        alreadyLinked,
        missingBounds,
      });
    }

    const internalOverlaps = findInternalOverlaps(group.leaves);
    overlappingRangesWithinGroup += internalOverlaps.length;
    if (internalOverlaps.length > 0) {
      requiresManualReview.push(
        `${group.identityKey}: ${internalOverlaps.length} internal SPH×CYL overlap(s) among legacy leaves — review before apply`
      );
    }
    if (groupMissingBounds > 0) {
      requiresManualReview.push(
        `${group.identityKey}: ${groupMissingBounds} leaf(ves) missing SPH bounds (cross/malformed)`
      );
    }

    if (existingId && !group.brand.trim()) {
      identityConflicts.push({
        identityKey: group.identityKey,
        reason: "Empty brand after normalize — skip",
      });
    }

    products.push({
      identityKey: group.identityKey,
      lensFamily: group.lensFamily as CatalogLensFamily,
      category: group.category,
      brand: group.brand,
      item: group.item,
      index: group.index,
      coating: group.coating,
      progressiveType: group.progressiveType,
      leafCount: group.leafCount,
      existingCatalogProductId: existingId,
      wouldCreateProduct: !existingId,
      ranges,
      rangesToLink: groupToLink,
      rangesAlreadyLinked: groupAlready,
      leavesMissingBounds: groupMissingBounds,
      internalOverlaps,
    });
  }

  return {
    mode: "dry-run",
    inspectedLensRows,
    productGroupsIdentified: input.groups.length,
    productsWouldCreate,
    productsAlreadyExist,
    rangesWouldLink,
    rangesAlreadyLinked,
    leavesMissingBounds,
    identityConflicts,
    overlappingRangesWithinGroup,
    malformedMetadata,
    requiresManualReview,
    products,
  };
}
