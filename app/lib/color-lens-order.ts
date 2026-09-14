import { LensType } from "@prisma/client";

export const COLOR_LENS_DIAMETER_MM = 70;

export const COLOR_LENS_MATERIAL_LABELS: Record<string, string> = {
  "poly-tintable-brc": "Poly Tintable BRC",
  "tintable-brc": "Tintable BRC",
  hc: "HC",
  uc: "UC",
  tintable: "Tintable",
};

export type ColorLensEyePower = {
  sph: number;
  cyl: number;
  axis: number;
  add?: number | null;
};

export type ColorLensOrderRequest = {
  colorId?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  lensType?: string | null;
  materialId?: string | null;
  coating?: string | null;
  tintStrength?: number | null;
  lensIndex?: string | null;
  referenceImageUrl?: string | null;
  prescription?: {
    right?: ColorLensEyePower | null;
    left?: ColorLensEyePower | null;
  } | null;
};

function formatPower(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
}

function formatEyeLine(label: string, eye: ColorLensEyePower, includeAdd: boolean): string {
  const parts = [
    `SPH ${formatPower(eye.sph)}`,
    `CYL ${formatPower(eye.cyl)}`,
    `AXIS ${Math.round(eye.axis)}`,
  ];
  if (includeAdd && eye.add != null) {
    parts.push(`ADD ${formatPower(eye.add)}`);
  }
  return `${label}: ${parts.join(", ")}`;
}

export function mapColorLensTypeToPrisma(lensType: string | null | undefined): LensType | null {
  switch (lensType) {
    case "single-vision":
      return LensType.SINGLE_VISION;
    case "kryptok":
      return LensType.KRYPTOK;
    case "progressive":
      return LensType.PROGRESSIVE;
    default:
      return null;
  }
}

export function materialLabelForId(materialId: string | null | undefined): string {
  if (!materialId?.trim()) return "Tintable BRC";
  return COLOR_LENS_MATERIAL_LABELS[materialId] ?? materialId;
}

export function buildColorLensOrderNotes(payload: ColorLensOrderRequest): string {
  const colorName = payload.colorName?.trim() || "Tinted lens";
  const colorHex = payload.colorHex?.trim();
  const lensType = payload.lensType?.trim() || "single-vision";
  const material = materialLabelForId(payload.materialId);
  const coating = payload.coating?.trim() || "Anti-Reflective";
  const tintStrength =
    payload.tintStrength != null && Number.isFinite(payload.tintStrength)
      ? `${Math.round(payload.tintStrength)}%`
      : "50%";
  const lensIndex = payload.lensIndex?.trim() || "1.56";
  const includeAdd = lensType === "progressive" || lensType === "kryptok";

  const lines = [
    "[Color Lens]",
    `Color: ${colorName}${colorHex ? ` (${colorHex})` : ""}`,
    payload.colorId?.trim() ? `Color mode: ${payload.colorId.trim()}` : null,
    `Lens type: ${lensType}`,
    `Material: ${material}`,
    `Index: ${lensIndex}`,
    `Diameter: ${COLOR_LENS_DIAMETER_MM} mm`,
    `Coating: ${coating}`,
    `Tint strength: ${tintStrength}`,
  ].filter(Boolean) as string[];

  const right = payload.prescription?.right;
  const left = payload.prescription?.left;
  if (right) {
    lines.push(formatEyeLine("OD", right, includeAdd));
  }
  if (left) {
    lines.push(formatEyeLine("OS", left, includeAdd));
  }

  if (payload.referenceImageUrl?.trim()) {
    lines.push("Reference image attached.");
  }

  return lines.join("\n");
}

export function parseEyePower(raw: unknown): ColorLensEyePower | null {
  if (!raw || typeof raw !== "object") return null;
  const eye = raw as Record<string, unknown>;
  const sph = Number(eye.sph);
  const cyl = Number(eye.cyl);
  const axis = Number(eye.axis);
  if (!Number.isFinite(sph) || !Number.isFinite(cyl) || !Number.isFinite(axis)) {
    return null;
  }
  const addRaw = eye.add;
  const add = addRaw == null ? null : Number(addRaw);
  return {
    sph,
    cyl,
    axis: Math.round(axis),
    add: add != null && Number.isFinite(add) ? add : null,
  };
}
