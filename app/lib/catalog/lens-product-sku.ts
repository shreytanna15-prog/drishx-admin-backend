/**
 * RC-04 LensProductVariant SKU + name builders.
 *
 * SKU:  [MATERIAL-]BASE[-INDEX]-FAMILY[-COATING][-PROGTYPE][-COLOR][-ADD…][-D…][-LEFT|RIGHT]-S…-C…[-A{axis}]
 * Name: [Material] [Index] [Family] [Base] [Coating] [Color] {max_SPH}/{max_CYL} [axis]
 * Progressive type is in SKU/baseCode only — not in the human name.
 * Coating distinguishes products that share the same power-range matrix.
 * Legacy products without a coating retain their existing codes and names.
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
  coatingCode?: string | null;
  progressiveTypeCode?: string | null;
  additionCode?: string | null;
  diameterCode?: string | null;
  eye?: "LEFT" | "RIGHT" | null;
  axisValue?: number | null;
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
  coatingLabel?: string | null;
  /** @deprecated Prefer `colorLabel` for names; kept for older call sites. */
  colorCode?: string | null;
  axisValue?: number | null;
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

/**
 * Parent internal base code (no power / ADD / eye / axis).
 * Diameter may be included when set on the parent.
 */
export function buildLensProductBaseCode(parts: {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  colorCode?: string | null;
  coatingCode?: string | null;
  progressiveTypeCode?: string | null;
  additionCode?: string | null;
  diameterCode?: string | null;
  eye?: "LEFT" | "RIGHT" | null;
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
  if (parts.coatingCode?.trim()) {
    const coating = sanitizeSkuCodePart(parts.coatingCode);
    if (coating) tokens.push(coating);
  }
  if (
    parts.progressiveTypeCode != null &&
    String(parts.progressiveTypeCode).trim() !== ""
  ) {
    const pt = sanitizeSkuCodePart(String(parts.progressiveTypeCode));
    if (pt) tokens.push(pt);
  }
  if (parts.colorCode != null && String(parts.colorCode).trim() !== "") {
    const c = sanitizeSkuCodePart(String(parts.colorCode));
    if (c) tokens.push(c);
  }
  if (parts.additionCode != null && String(parts.additionCode).trim() !== "") {
    const a = sanitizeSkuCodePart(String(parts.additionCode));
    if (a) tokens.push(a);
  }
  if (parts.diameterCode != null && String(parts.diameterCode).trim() !== "") {
    const d = sanitizeSkuCodePart(String(parts.diameterCode));
    if (d) tokens.push(d);
  }
  if (parts.eye === "LEFT" || parts.eye === "RIGHT") {
    tokens.push(parts.eye);
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

  const tokens = [
    base,
    `S${encodeSkuPower(sphMin)}T${encodeSkuPower(sphMax)}`,
    `C${encodeSkuPower(cylMin)}T${encodeSkuPower(cylMax)}`,
  ];
  if (
    parts.axisValue != null &&
    Number.isFinite(parts.axisValue) &&
    Math.trunc(parts.axisValue) === parts.axisValue
  ) {
    tokens.push(`A${Math.trunc(parts.axisValue)}`);
  }
  return tokens.join("-");
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

function lensProductNameAttrWords(
  parts: Pick<
    LensProductNameParts,
    | "materialCode"
    | "indexCode"
    | "familyCode"
    | "baseCode"
    | "coatingLabel"
    | "colorLabel"
    | "colorCode"
  >
): string[] {
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
  const coatingWord = String(parts.coatingLabel ?? "").trim();
  if (coatingWord) words.push(coatingWord);
  const colorWord = String(parts.colorLabel ?? parts.colorCode ?? "").trim();
  if (colorWord) words.push(colorWord);
  return words;
}

/** Human-readable variant name; Admin does not type this. */
export function buildLensProductName(parts: LensProductNameParts): string {
  const words = lensProductNameAttrWords(parts);
  words.push(
    buildPowerNameToken(parts.sphMin, parts.sphMax, parts.cylMin, parts.cylMax)
  );
  if (
    parts.axisValue != null &&
    Number.isFinite(parts.axisValue) &&
    Math.trunc(parts.axisValue) === parts.axisValue
  ) {
    words.push(String(Math.trunc(parts.axisValue)));
  }
  return words.filter(Boolean).join(" ");
}

/**
 * Flat list labels — same attribute order as {@link buildLensProductName},
 * compact power only (no span). Parent omits axis; leaf includes axis.
 */
export function buildLensProductFlatGroupName(
  parts: Omit<LensProductNameParts, "axisValue">
): string {
  const words = lensProductNameAttrWords(parts);
  words.push(
    formatPowerRangeCompact(
      parts.sphMin,
      parts.sphMax,
      parts.cylMin,
      parts.cylMax
    )
  );
  return words.filter(Boolean).join(" ");
}

export function buildLensProductFlatLeafName(
  parts: LensProductNameParts
): string {
  const words = lensProductNameAttrWords(parts);
  words.push(
    formatPowerRangeCompact(
      parts.sphMin,
      parts.sphMax,
      parts.cylMin,
      parts.cylMax
    )
  );
  if (
    parts.axisValue != null &&
    Number.isFinite(parts.axisValue) &&
    Math.trunc(parts.axisValue) === parts.axisValue
  ) {
    words.push(String(Math.trunc(parts.axisValue)));
  }
  return words.filter(Boolean).join(" ");
}
