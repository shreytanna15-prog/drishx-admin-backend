import { LensType, ProcurementPriority } from "@prisma/client";

/**
 * Pure procurement domain rules — no database access.
 *
 * Replenishment math, threshold validation and display formatting live here so
 * they can be unit-tested without a live connection and reused by both the API
 * routes and the admin UI.
 */

/**
 * Lens families that procurement / stock intake can actually move today.
 *
 * `applyStockIntake` (app/lib/stock-intake.ts) and `decrementLensStock`
 * (app/lib/cart-reservations.ts) only handle SINGLE_VISION, KRYPTOK and
 * PROGRESSIVE. OriVision / Magnus / Bifocal rows have no `costPrice` and are
 * silently skipped, so a reorder rule on them would raise requests that can
 * never be received. Reorder rules are blocked for those types instead.
 */
export const PROCUREMENT_LENS_TYPES: readonly LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
] as const;

export const PROCUREMENT_REQUEST_STATUSES_OPEN = [
  "OPEN",
  "UNDER_REVIEW",
  "APPROVED",
] as const;

export function isProcurementLensType(value: unknown): value is LensType {
  return (
    typeof value === "string" &&
    (PROCUREMENT_LENS_TYPES as readonly string[]).includes(value)
  );
}

/** Order relation field holding the lens id, per lens family. */
export function orderLensIdField(
  lensType: LensType
):
  | "singleVisionLensId"
  | "kryptokLensId"
  | "progressiveLensId"
  | "oriVisionLensId"
  | "magnusLensId"
  | "bifocalLensId" {
  switch (lensType) {
    case LensType.SINGLE_VISION:
      return "singleVisionLensId";
    case LensType.KRYPTOK:
      return "kryptokLensId";
    case LensType.PROGRESSIVE:
      return "progressiveLensId";
    case LensType.ORI_VISION:
      return "oriVisionLensId";
    case LensType.MAGNUS:
      return "magnusLensId";
    case LensType.BIFOCAL:
      return "bifocalLensId";
    default:
      return "progressiveLensId";
  }
}

/**
 * How many units to request (procurement PDF §4).
 *
 *   required = target - available - incoming
 *
 * Returns 0 when no reorder is needed. When an MOQ is configured the result is
 * rounded up to the next MOQ multiple rather than ordering a fraction of a
 * carton (PDF §28).
 */
export function calculateRequiredQuantity(input: {
  available: number;
  targetStock: number;
  incoming: number;
  moq?: number | null;
}): number {
  const { available, targetStock, incoming } = input;
  const base = Math.trunc(targetStock - available - incoming);
  if (base <= 0) return 0;

  const moq = input.moq ?? null;
  if (moq && moq > 0) {
    // Always round up to a whole MOQ multiple — suppliers ship cartons, so
    // "81 needed, MOQ 50" becomes 100 (procurement PDF §28).
    return Math.ceil(base / moq) * moq;
  }
  return base;
}

/**
 * Recompute priority from how far below the threshold stock has fallen.
 * Out of stock is always CRITICAL so it surfaces on the admin dashboard.
 */
export function deriveReorderPriority(
  available: number,
  minStock: number
): ProcurementPriority {
  if (available <= 0) return ProcurementPriority.CRITICAL;
  if (minStock > 0 && available * 2 <= minStock) return ProcurementPriority.HIGH;
  return ProcurementPriority.NORMAL;
}

/**
 * Configured-rule low-stock predicate used by Reorder Rules list / banner.
 * Matches Run Reorder's stock gate: available ≤ minStock (including minStock = 0 → only when available is 0).
 * Unconfigured SKUs have no minimum and must not be treated as "below minimum".
 */
export function isAtOrBelowMinimum(
  available: number,
  minStock: number
): boolean {
  return available <= minStock;
}

/**
 * Whether Run Reorder would even consider this rule for raising a request
 * (stock + auto flags). Open-PO / existing-request suppression is applied later.
 */
export function isReorderCheckCandidate(input: {
  available: number;
  minStock: number;
  autoProcure: boolean;
  isActive: boolean;
}): boolean {
  return (
    input.isActive &&
    input.autoProcure &&
    isAtOrBelowMinimum(input.available, input.minStock)
  );
}

/** Validate a reorder rule payload. Returns an error string, or null when valid. */
export function validateReorderRule(input: {
  lensType?: unknown;
  lensId?: unknown;
  minStock?: unknown;
  targetStock?: unknown;
  moq?: unknown;
}): string | null {
  if (!isProcurementLensType(input.lensType)) {
    return `lensType must be one of: ${PROCUREMENT_LENS_TYPES.join(", ")}.`;
  }
  if (typeof input.lensId !== "string" || !input.lensId.trim()) {
    return "lensId is required.";
  }

  const minStock = Number(input.minStock);
  const targetStock = Number(input.targetStock);

  if (!Number.isInteger(minStock) || minStock < 0) {
    return "minStock must be a whole number greater than or equal to 0.";
  }
  if (!Number.isInteger(targetStock) || targetStock < 0) {
    return "targetStock must be a whole number greater than or equal to 0.";
  }
  if (targetStock <= minStock) {
    return "targetStock must be greater than minStock.";
  }

  if (input.moq !== undefined && input.moq !== null && input.moq !== "") {
    const moq = Number(input.moq);
    if (!Number.isInteger(moq) || moq <= 0) {
      return "moq must be a whole number greater than 0.";
    }
  }

  return null;
}

function fmtPower(value: number | null): string {
  if (value === null) return "";
  return value.toFixed(2).replace(/\.00$/, "");
}

/** Compact "power" label, e.g. `-2`, `SPH -2 / CYL -0.5`, `cross -2`. */
export function formatLensPower(lens: {
  sph?: number | null;
  cyl?: number | null;
  crossPower?: number | null;
  add?: number | null;
  eye?: string | null;
}): string {
  if (lens.crossPower !== null && lens.crossPower !== undefined) {
    return `cross ${fmtPower(lens.crossPower)}`;
  }
  const parts: string[] = [];
  if (lens.sph !== null && lens.sph !== undefined) {
    parts.push(`SPH ${fmtPower(lens.sph)}`);
  }
  if (lens.cyl !== null && lens.cyl !== undefined) {
    parts.push(`CYL ${fmtPower(lens.cyl)}`);
  }
  if (parts.length === 0) return "PLANO";
  let label = parts.join(" / ");
  if (lens.add !== null && lens.add !== undefined && Number(lens.add) !== 0) {
    label += ` / ADD ${fmtPower(lens.add)}`;
  }
  if (lens.eye) label += ` · ${lens.eye}`;
  return label;
}

/** Human label for a lens row, e.g. `HC SV · SPH -2`. */
export function formatLensLabel(
  lensType: LensType,
  lens: {
    brand?: string | null;
    item?: string | null;
    coating?: string | null;
  } & Parameters<typeof formatLensPower>[0]
): string {
  const name = [lens.brand, lens.item, lens.coating].filter(Boolean).join(" ");
  const power = formatLensPower(lens);
  return [name, power].filter(Boolean).join(" · ");
}

// ─── Idempotency reference derivation ───────────────────────────────────────

const MAX_REFERENCE_LENGTH = 60;

/**
 * Strip anything awkward in a `Transaction.reference` and keep it short.
 * Returns "" when the input carries no usable characters.
 */
export function sanitizeReferenceSegment(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_REFERENCE_LENGTH);
}

/** Deterministic expense reference for a single-item intake. */
export function procurementReferenceFor(clientRequestId: string): string {
  return `PROC-${sanitizeReferenceSegment(clientRequestId)}`;
}

/** Deterministic batch reference prefix; each line gets `-<n>` appended. */
export function procurementBatchReferenceFor(clientRequestId: string): string {
  return `PROC-BATCH-${sanitizeReferenceSegment(clientRequestId)}`;
}
