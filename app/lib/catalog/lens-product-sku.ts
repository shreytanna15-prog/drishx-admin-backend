/**
 * Deterministic LensProduct SKU from attribute codes + power range (interim format).
 * Format: FAMILY-BASE[-MATERIAL][-INDEX][-COATING][-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}[-CROSS]
 * Material is optional (RC-03) and omitted when absent.
 */

export type LensProductSkuParts = {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  coatingCode?: string | null;
  colorCode?: string | null;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  rangeType?: string | null;
};

/** SKU-safe token from an attribute code (uppercase, `.` → `P`, strip other junk). */
export function sanitizeSkuCodePart(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/\./g, "P")
    .replace(/[^A-Z0-9]+/g, "");
}

/** Encode a diopter bound for SKU: `-6` → `M6`, `0.25` → `0P25`, `10` → `10`. */
export function encodeSkuPower(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid power for SKU: ${value}`);
  }
  const v = Number(value.toFixed(2));
  const sign = v < 0 ? "M" : "";
  const abs = Math.abs(v);
  const body = Number.isInteger(abs)
    ? String(abs)
    : String(abs).replace(".", "P");
  return `${sign}${body}`;
}

export function buildLensProductSkuCode(parts: LensProductSkuParts): string {
  const family = sanitizeSkuCodePart(parts.familyCode);
  const base = sanitizeSkuCodePart(parts.baseCode);
  if (!family || !base) {
    throw new Error("familyCode and baseCode are required for SKU.");
  }

  const tokens = [family, base];
  for (const optional of [
    parts.materialCode,
    parts.indexCode,
    parts.coatingCode,
    parts.colorCode,
  ]) {
    if (optional == null || String(optional).trim() === "") continue;
    const token = sanitizeSkuCodePart(String(optional));
    if (token) tokens.push(token);
  }

  const sphMin = Math.min(parts.sphMin, parts.sphMax);
  const sphMax = Math.max(parts.sphMin, parts.sphMax);
  const cylMin = Math.min(parts.cylMin, parts.cylMax);
  const cylMax = Math.max(parts.cylMin, parts.cylMax);

  tokens.push(
    `S${encodeSkuPower(sphMin)}T${encodeSkuPower(sphMax)}`
  );
  tokens.push(
    `C${encodeSkuPower(cylMin)}T${encodeSkuPower(cylMax)}`
  );

  const rangeType = (parts.rangeType ?? "NORMAL").trim().toUpperCase();
  if (rangeType === "CROSS") {
    tokens.push("CROSS");
  }

  return tokens.join("-");
}
