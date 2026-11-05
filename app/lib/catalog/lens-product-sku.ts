/**
 * RC-04 LensProductVariant SKU + name builders.
 *
 * SKU:  [MATERIAL-]BASE[-INDEX]-FAMILY[-COLOR][-ADD…][-D…][-LEFT|RIGHT]-S…-C…[-A{axis}]
 * Name: [Material] [Index] [Family] [Base] [Color] {max_SPH}/{max_CYL} [axis]
 * Coating is never included.
 */

import { formatPowerRangeCompact } from "./catalog-power-select-options";

export type LensProductSkuParts = {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  colorCode?: string | null;
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
   * Human color word for the name (e.g. `… Green -6.00/-2.00`).
   * Prefer attribute display name; fall back to `colorCode` if omitted.
   */
  colorLabel?: string | null;
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

/** Parent internal base code (no power segment). Not shown in Admin UI. */
export function buildLensProductBaseCode(parts: {
  familyCode: string;
  baseCode: string;
  materialCode?: string | null;
  indexCode?: string | null;
  colorCode?: string | null;
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
 * Compact `{max_SPH}/{max_CYL}` for names / catalog UI.
 * Only the extreme bounds (larger |value|); e.g. SPH −2…+4 → `+4.00`.
 */
export function buildPowerNameToken(
  sphMin: number,
  sphMax: number,
  cylMin: number,
  cylMax: number
): string {
  return formatPowerRangeCompact(sphMin, sphMax, cylMin, cylMax);
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
  if (
    parts.axisValue != null &&
    Number.isFinite(parts.axisValue) &&
    Math.trunc(parts.axisValue) === parts.axisValue
  ) {
    words.push(String(Math.trunc(parts.axisValue)));
  }
  return words.filter(Boolean).join(" ");
}
