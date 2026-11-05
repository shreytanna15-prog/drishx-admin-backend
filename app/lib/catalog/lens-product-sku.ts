/**
 * RC-04 LensProductVariant SKU + name builders.
 *
 * SKU:  [MATERIAL-]BASE[-INDEX]-FAMILY[-COLOR]-S{sphMin}T{sphMax}-C{cylMin}T{cylMax}
 * Name: [Material] [Index] [Family] [Base] [Color] {max_SPH}/{max_CYL}
 * Coating is never included.
 */

import {
  extremePowerBound,
  formatPowerRangeCompact,
  formatPowerRangeSpan,
  normalizePowerValue,
} from "./catalog-power-select-options";

export type LensProductSkuParts = {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  colorCode?: string | null;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
};

export type LensProductNameParts = {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  /**
   * Human color word for the name (CLIENT-PLAN: `… Green -6.00/-2.00`).
   * Prefer attribute display name; fall back to `colorCode` if omitted.
   */
  colorLabel?: string | null;
  /** @deprecated Prefer `colorLabel` for names; kept for older call sites. */
  colorCode?: string | null;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
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

/** Parent internal base code (no power segment). Not shown in Admin UI. */
export function buildLensProductBaseCode(parts: {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  colorCode?: string | null;
}): string {
  const family = sanitizeSkuCodePart(parts.familyCode);
  const base = sanitizeSkuCodePart(parts.baseCode);
  if (!family || !base) {
    throw new Error("familyCode and baseCode are required.");
  }

  const tokens: string[] = [];
  if (parts.materialCode != null && String(parts.materialCode).trim() !== "") {
    const m = sanitizeSkuCodePart(String(parts.materialCode));
    if (m) tokens.push(m);
  }
  tokens.push(base);
  if (parts.indexCode != null && String(parts.indexCode).trim() !== "") {
    const index = sanitizeSkuCodePart(String(parts.indexCode));
    if (index) tokens.push(index);
  }
  tokens.push(family);
  if (parts.colorCode != null && String(parts.colorCode).trim() !== "") {
    const c = sanitizeSkuCodePart(String(parts.colorCode));
    if (c) tokens.push(c);
  }
  return tokens.join("-");
}

export function buildLensProductSkuCode(parts: LensProductSkuParts): string {
  const base = buildLensProductBaseCode(parts);
  // SKU still encodes both bounds in numeric order for stable identity.
  const sphMin = Math.min(parts.sphMin, parts.sphMax);
  const sphMax = Math.max(parts.sphMin, parts.sphMax);
  const cylMin = Math.min(parts.cylMin, parts.cylMax);
  const cylMax = Math.max(parts.cylMin, parts.cylMax);

  return [
    base,
    `S${encodeSkuPower(sphMin)}T${encodeSkuPower(sphMax)}`,
    `C${encodeSkuPower(cylMin)}T${encodeSkuPower(cylMax)}`,
  ].join("-");
}

/**
 * Compact `{max_SPH}/{max_CYL}` for names.
 * When a bound is not plano→extreme (other end ≠ 0), append spans so two
 * ranges that share the same extremes still get unique names.
 */
export function buildPowerNameToken(
  sphMin: number,
  sphMax: number,
  cylMin: number,
  cylMax: number
): string {
  const compact = formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax);
  const sphExt = extremePowerBound(sphMin, sphMax);
  const cylExt = extremePowerBound(cylMin, cylMax);
  const sphOther =
    normalizePowerValue(sphMin) === sphExt
      ? normalizePowerValue(sphMax)
      : normalizePowerValue(sphMin);
  const cylOther =
    normalizePowerValue(cylMin) === cylExt
      ? normalizePowerValue(cylMax)
      : normalizePowerValue(cylMin);
  if (sphOther === 0 && cylOther === 0) return compact;
  return `${compact} (${formatPowerRangeSpan(sphMin, sphMax)} / ${formatPowerRangeSpan(cylMin, cylMax)})`;
}

/** Human-readable variant name; Admin does not type this. */
export function buildLensProductName(parts: LensProductNameParts): string {
  const words: string[] = [];
  if (parts.materialCode != null && String(parts.materialCode).trim() !== "") {
    words.push(String(parts.materialCode).trim());
  }
  if (parts.indexCode != null && String(parts.indexCode).trim() !== "") {
    words.push(String(parts.indexCode).trim());
  }
  words.push(
    String(parts.familyCode).trim(),
    String(parts.baseCode).trim()
  );
  const colorWord = String(parts.colorLabel ?? parts.colorCode ?? "").trim();
  if (colorWord) words.push(colorWord);
  words.push(
    buildPowerNameToken(parts.sphMin, parts.sphMax, parts.cylMin, parts.cylMax)
  );
  return words.filter(Boolean).join(" ");
}
