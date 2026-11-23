/**
 * Stock S3 — pure helpers for PO / receipt line identity (legacy vs catalog leaf).
 * No Prisma / Node-only imports — safe for unit tests and client bundles.
 */

import { encodeStockLeafKey, normalizeStockPower } from "@/app/lib/catalog/lens-product-stock-core";

export type PoLineIdentityInput = {
  lensType?: string | null;
  lensId?: string | null;
  lensProductPowerId?: string | null;
  lensProductVariantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
};

/** Stable key for draft duplicate detection and receipt matching. */
export function draftPowerIdentityKey(line: PoLineIdentityInput): string | null {
  const powerId = line.lensProductPowerId?.trim();
  if (powerId) return `power:${powerId}`;

  const variantId = line.lensProductVariantId?.trim();
  if (
    variantId &&
    line.sph != null &&
    Number.isFinite(line.sph) &&
    line.cyl != null &&
    Number.isFinite(line.cyl)
  ) {
    return `leaf:${encodeStockLeafKey(variantId, line.sph, line.cyl)}`;
  }

  const lensType = line.lensType?.trim();
  const lensId = line.lensId?.trim();
  // Keep legacy key shape identical to historical powerKey for Excel action maps.
  if (lensType && lensId) return `${lensType}::${lensId}`;

  return null;
}

export function hasCatalogIdentity(line: PoLineIdentityInput): boolean {
  if (line.lensProductPowerId?.trim()) return true;
  return Boolean(
    line.lensProductVariantId?.trim() &&
      line.sph != null &&
      Number.isFinite(line.sph) &&
      line.cyl != null &&
      Number.isFinite(line.cyl)
  );
}

export function hasLegacyIdentity(line: PoLineIdentityInput): boolean {
  return Boolean(line.lensType?.trim() && line.lensId?.trim());
}

export function hasAnyPoIdentity(line: PoLineIdentityInput): boolean {
  return hasCatalogIdentity(line) || hasLegacyIdentity(line);
}

/** Detect duplicate powers within a draft (catalog and/or legacy keys). */
export function findDuplicatePoIdentitiesInDraft(
  lines: PoLineIdentityInput[]
): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const line of lines) {
    const key = draftPowerIdentityKey(line);
    if (!key) continue;
    if (seen.has(key)) dupes.add(key);
    else seen.add(key);
  }
  return [...dupes];
}

export function formatCatalogPowerLabel(sph: number, cyl: number): string {
  const s = normalizeStockPower(sph);
  const c = normalizeStockPower(cyl);
  const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
  return `SPH ${fmt(s)} / CYL ${fmt(c)}`;
}
