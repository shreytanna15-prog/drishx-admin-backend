/**
 * RW-09 product identity — must stay aligned with sibling grouping:
 * - SV: category|brand|item|index|coating  (lens-power-range productKey)
 * - KT: category|brand|coating             (kryptokProductKey; item optional in facade)
 * - PROG: category|brand|item|index|type|coating
 */

export type CatalogLensFamily = "SINGLE_VISION" | "KRYPTOK" | "PROGRESSIVE";

export type CatalogProductIdentityInput = {
  lensFamily: CatalogLensFamily;
  category?: string | null;
  brand: string;
  item?: string | null;
  index?: number | null;
  coating: string;
  /** Progressive "type" field (e.g. material / design label). */
  progressiveType?: string | null;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function roundIndex(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Stable unique key for CatalogProduct.identityKey and overlap "same product".
 */
export function buildCatalogIdentityKey(input: CatalogProductIdentityInput): string {
  const family = input.lensFamily;
  const category = norm(input.category);
  const brand = norm(input.brand);
  const item = norm(input.item);
  const coating = norm(input.coating);
  const index = roundIndex(input.index ?? null);
  const progressiveType = norm(input.progressiveType);

  if (!brand) {
    throw new Error("brand is required for product identity.");
  }
  if (!coating) {
    throw new Error("coating is required for product identity.");
  }

  switch (family) {
    case "SINGLE_VISION":
      if (!index) throw new Error("index is required for Single Vision products.");
      return ["SV", category, brand, item, index, coating].join("|");
    case "KRYPTOK":
      // Match shop kryptokProductKey; keep item in facade but not in uniqueness.
      return ["KT", category, brand, coating].join("|");
    case "PROGRESSIVE":
      if (!index) throw new Error("index is required for Progressive products.");
      if (!item) throw new Error("item is required for Progressive products.");
      if (!progressiveType) {
        throw new Error("progressive type is required for Progressive products.");
      }
      return ["PG", category, brand, item, index, progressiveType, coating].join("|");
    default:
      throw new Error(`Unsupported lens family: ${family}`);
  }
}

export function lensTypeForFamily(
  family: CatalogLensFamily
): "SINGLE_VISION" | "KRYPTOK" | "PROGRESSIVE" {
  return family;
}

export function apiLensPathForFamily(
  family: CatalogLensFamily
): "single-vision" | "kryptok" | "progressive" {
  switch (family) {
    case "SINGLE_VISION":
      return "single-vision";
    case "KRYPTOK":
      return "kryptok";
    case "PROGRESSIVE":
      return "progressive";
  }
}
