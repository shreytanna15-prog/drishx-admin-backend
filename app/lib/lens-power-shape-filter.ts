import type { Prisma } from "@prisma/client";

/** Shop product power-shape facet (SPH-only / CYL-only / both). */
export type PowerShapeFilter = "sph" | "cyl" | "compound";

const POWER_SHAPE_VALUES = new Set<PowerShapeFilter>(["sph", "cyl", "compound"]);

const POWER_EPS = 1e-9;

export function parsePowerShapeFilter(raw: string | null | undefined): PowerShapeFilter | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase() as PowerShapeFilter;
  return POWER_SHAPE_VALUES.has(value) ? value : null;
}

/**
 * Hardcoat / grade-only labels that are not useful as color/coating chips.
 * When every coating in a subcategory is grade-only (or empty), the shop UI
 * falls back to SPH / CYL / Compound power filters.
 */
export function isHardcoatGradeCoating(coating: string | null | undefined): boolean {
  const raw = coating?.trim() ?? "";
  if (!raw) return true;
  const norm = raw
    .toUpperCase()
    .replace(/[./_\-\s]+/g, " ")
    .trim();
  const compact = norm.replace(/\s+/g, "");
  return (
    compact === "HC" ||
    compact === "HMC" ||
    compact === "SHMC" ||
    compact === "UC" ||
    compact === "HARDCOAT" ||
    compact === "HARDCOATED" ||
    norm === "HARD COAT" ||
    norm === "HARD COATED"
  );
}

export type PowerShapeFieldNullability = {
  /** Single Vision: sph is optional. Kryptok/Progressive: sph is required Decimal. */
  sphNullable?: boolean;
  /** All shop types currently have optional cyl; kept for clarity. */
  cylNullable?: boolean;
};

/**
 * Non-zero power comparisons only — avoid `{ field: { not: null } }` / `{ field: null }`
 * when the column is required Decimal. Prisma rejects null filters on non-nullable fields
 * (Kryptok & Progressive `sph`), which previously 500'd `/api/lenses/coatings` for those types.
 */
function nonZeroPower(field: "sph" | "cyl"): Record<string, unknown> {
  return {
    OR: [{ [field]: { lt: -POWER_EPS } }, { [field]: { gt: POWER_EPS } }],
  };
}

function nearZeroPower(field: "sph" | "cyl"): Record<string, unknown> {
  return {
    AND: [{ [field]: { gte: -POWER_EPS } }, { [field]: { lte: POWER_EPS } }],
  };
}

/** SPH has a non-zero power value (null rows never match numeric filters). */
function hasSphWhere(): Record<string, unknown> {
  return nonZeroPower("sph");
}

/** CYL has a non-zero power value. */
function hasCylWhere(): Record<string, unknown> {
  return nonZeroPower("cyl");
}

/** SPH is missing or effectively zero. */
function noSphWhere(sphNullable: boolean): Record<string, unknown> {
  if (!sphNullable) {
    return nearZeroPower("sph");
  }
  return {
    OR: [{ sph: null }, nearZeroPower("sph")],
  };
}

/** CYL is missing or effectively zero. */
function noCylWhere(cylNullable: boolean): Record<string, unknown> {
  if (!cylNullable) {
    return nearZeroPower("cyl");
  }
  return {
    OR: [{ cyl: null }, nearZeroPower("cyl")],
  };
}

/**
 * Prisma where fragment for a power-shape filter.
 * Works for Single Vision, Kryptok, and Progressive (all have sph/cyl fields).
 *
 * Pass nullability matching the model so Prisma never receives invalid null checks
 * on required decimals (KT/progressive sph).
 */
export function buildPowerShapeWhere(
  shape: PowerShapeFilter | null | undefined,
  nullability: PowerShapeFieldNullability = { sphNullable: true, cylNullable: true }
): Record<string, unknown> | null {
  if (!shape) return null;

  const sphNullable = nullability.sphNullable !== false;
  const cylNullable = nullability.cylNullable !== false;

  switch (shape) {
    case "sph":
      // Only SPH: has sphere, no cylinder
      return { AND: [hasSphWhere(), noCylWhere(cylNullable)] };
    case "cyl":
      // Only CYL: has cylinder, no sphere
      return { AND: [hasCylWhere(), noSphWhere(sphNullable)] };
    case "compound":
      // Both SPH and CYL present
      return { AND: [hasSphWhere(), hasCylWhere()] };
    default:
      return null;
  }
}

/** Nullability per shop product type (mirrors Prisma schema). */
export function powerShapeNullabilityForType(
  type: "single-vision" | "kryptok" | "progressive"
): PowerShapeFieldNullability {
  if (type === "single-vision") {
    return { sphNullable: true, cylNullable: true };
  }
  // Kryptok + Progressive: sph is required Decimal; cyl optional
  return { sphNullable: false, cylNullable: true };
}

export type PowerShapeWhere =
  | Prisma.SingleVisionLensWhereInput
  | Prisma.KryptokLensWhereInput
  | Prisma.ProgressiveLensWhereInput;
