import { mapColorLensTypeToPrisma, parseEyePower } from "./color-lens-order";

export type RxOrderFor = "both" | "right" | "left";

export type RxEyePower = {
  sph: number;
  cyl: number;
  axis: number;
  add?: number | null;
  diameter?: string | null;
};

export type RxOrderRequest = {
  lensType?: string | null;
  orderFor?: RxOrderFor | null;
  quantity?: number | null;
  samePowerForBothEyes?: boolean | null;
  prescription?: {
    right?: RxEyePower | null;
    left?: RxEyePower | null;
  } | null;
  feature?: string | null;
  lensIndex?: string | null;
  coating?: string | null;
  productName?: string | null;
  remarks?: string | null;
  remarkTags?: string[] | null;
  prescriptionImageUrl?: string | null;
};

function formatPower(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
}

function formatEyeLine(
  label: string,
  eye: RxEyePower,
  includeAdd: boolean,
  includeDiameter: boolean
): string {
  const parts = [
    `SPH ${formatPower(eye.sph)}`,
    `CYL ${formatPower(eye.cyl)}`,
    `AXIS ${Math.round(eye.axis)}`,
  ];
  if (includeAdd && eye.add != null) {
    parts.push(`ADD ${formatPower(eye.add)}`);
  }
  if (includeDiameter && eye.diameter?.trim()) {
    parts.push(`Diameter ${eye.diameter.trim()} mm`);
  }
  return `${label}: ${parts.join(", ")}`;
}

export function parseRxEyePower(raw: unknown): RxEyePower | null {
  const base = parseEyePower(raw);
  if (!base) return null;
  const eye = raw as Record<string, unknown>;
  const diameter =
    typeof eye.diameter === "string"
      ? eye.diameter.trim()
      : eye.diameter != null
        ? String(eye.diameter).trim()
        : null;
  return {
    ...base,
    diameter: diameter || null,
  };
}

export function mapRxOrderForToEye(orderFor: RxOrderFor | null | undefined): string | null {
  switch (orderFor) {
    case "both":
      return "BOTH";
    case "right":
      return "OD";
    case "left":
      return "OS";
    default:
      return null;
  }
}

export function buildRxOrderNotes(payload: RxOrderRequest): string {
  const lensType = payload.lensType?.trim() || "single-vision";
  const orderFor = payload.orderFor ?? "both";
  const quantity = payload.quantity != null && Number.isFinite(payload.quantity) ? payload.quantity : 1;
  const feature = payload.feature?.trim() || "Clear";
  const lensIndex = payload.lensIndex?.trim() || "1.56";
  const coating = payload.coating?.trim() || "HMC";
  const includeAdd = lensType === "progressive" || lensType === "kryptok";
  const productName = payload.productName?.trim();
  const remarks = payload.remarks?.trim();
  const tags = (payload.remarkTags ?? []).filter((tag) => tag?.trim());

  const lines = [
    "[RX Order]",
    `Lens type: ${lensType}`,
    `Order for: ${orderFor}`,
    `Quantity: ${quantity} lens(es)`,
    payload.samePowerForBothEyes ? "Same power for both eyes: Yes" : null,
    `Feature: ${feature}`,
    `Index: ${lensIndex}`,
    `Coating: ${coating}`,
    productName ? `Product name: ${productName}` : null,
  ].filter(Boolean) as string[];

  const right = payload.prescription?.right;
  const left = payload.prescription?.left;

  if (orderFor === "both" || orderFor === "right") {
    if (right) {
      lines.push(formatEyeLine("OD", right, includeAdd, true));
    }
  }
  if (orderFor === "both" || orderFor === "left") {
    if (left) {
      lines.push(formatEyeLine("OS", left, includeAdd, true));
    }
  }

  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(", ")}`);
  }
  if (remarks) {
    lines.push(`Remarks: ${remarks}`);
  }
  if (payload.prescriptionImageUrl?.trim()) {
    lines.push("Prescription image attached.");
  }

  return lines.join("\n");
}

export { mapColorLensTypeToPrisma };
