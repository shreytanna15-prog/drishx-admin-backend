/**
 * Pure legacy overlap helpers (no Prisma).
 */

import type { LegacyLensLeaf } from "./legacy-leaves-types";
import {
  cellOverlapsRange,
  formatRangeLabel,
  rangesOverlap,
  suggestNonOverlappingBounds,
  type PowerCell,
  type SphCylRangeBounds,
} from "./range-math";

export type LegacyOverlapHit = {
  leafId: string;
  label: string;
  bounds: SphCylRangeBounds;
  suggestion: ReturnType<typeof suggestNonOverlappingBounds>;
};

function formatLegacyLabel(leaf: LegacyLensLeaf): string {
  if (leaf.bounds) {
    const sph = leaf.bounds.sph.end;
    const cyl = leaf.bounds.cyl?.end;
    if (cyl != null) return `${sph}×${cyl} (legacy ${leaf.id.slice(0, 8)})`;
    return `${sph} (legacy ${leaf.id.slice(0, 8)})`;
  }
  return `legacy ${leaf.id.slice(0, 8)}`;
}

/**
 * Check requested range against legacy leaves (bands or exact powers).
 */
export function findLegacyOverlaps(
  requested: SphCylRangeBounds,
  requestedCells: PowerCell[],
  legacyLeaves: LegacyLensLeaf[],
  extras?: { add?: number | null; axis?: number | null; eye?: string | null }
): LegacyOverlapHit | null {
  for (const leaf of legacyLeaves) {
    if (!leaf.bounds) continue;
    if (extras?.add != null && leaf.add != null && Number(leaf.add) !== Number(extras.add)) {
      continue;
    }
    if (extras?.axis != null && leaf.axis != null && leaf.axis !== extras.axis) {
      continue;
    }
    if (
      extras?.eye &&
      leaf.eye &&
      extras.eye.toUpperCase() !== leaf.eye.toUpperCase()
    ) {
      continue;
    }

    if (rangesOverlap(requested, leaf.bounds)) {
      const label = formatLegacyLabel(leaf);
      return {
        leafId: leaf.id,
        label,
        bounds: leaf.bounds,
        suggestion: suggestNonOverlappingBounds(requested, leaf.bounds, label),
      };
    }

    for (const cell of requestedCells) {
      if (cellOverlapsRange(cell, leaf.bounds)) {
        const label = formatLegacyLabel(leaf);
        return {
          leafId: leaf.id,
          label,
          bounds: leaf.bounds,
          suggestion: suggestNonOverlappingBounds(requested, leaf.bounds, label),
        };
      }
    }
  }
  return null;
}
