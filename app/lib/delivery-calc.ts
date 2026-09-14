export type WeightRounding = "ACTUAL" | "NEXT_1KG" | "NEXT_0_5KG";

export type DeliveryPricingInput = {
  actualWeight: number;
  customerRate: number;
  internalCostRate: number;
  weightRounding?: WeightRounding | string | null;
  minWeight?: number | null;
  minCharge?: number | null;
  internalMinCost?: number | null;
  billingMethod?: string | null;
  flatCharge?: number | null;
};

export type DeliveryPricingResult = {
  actualWeight: number;
  chargeableWeight: number;
  customerCharge: number;
  internalCost: number;
  margin: number;
};

const EPS = 1e-9;

export function toChargeableWeight(
  actualWeight: number,
  rounding: WeightRounding | string | null | undefined,
  minWeight?: number | null
): number {
  if (!Number.isFinite(actualWeight) || actualWeight <= 0) {
    throw new Error("actualWeight must be a positive number.");
  }
  const min = Number.isFinite(Number(minWeight)) && Number(minWeight) > 0 ? Number(minWeight) : 0;
  let w = actualWeight;
  const rule = (rounding ?? "NEXT_1KG").toString().toUpperCase();
  if (rule === "NEXT_1KG") {
    w = Math.ceil(w - EPS);
  } else if (rule === "NEXT_0_5KG" || rule === "NEXT_0.5KG" || rule === "HALF_KG") {
    w = Math.ceil(w * 2 - EPS) / 2;
  } else {
    w = Math.round(w * 1000) / 1000; // ACTUAL
  }
  if (min > 0 && w < min) w = min;
  return Math.round(w * 1000) / 1000;
}

export function calcDeliveryPricing(input: DeliveryPricingInput): DeliveryPricingResult {
  const actual = Number(input.actualWeight);
  if (!Number.isFinite(actual) || actual <= 0) {
    throw new Error("actualWeight must be a positive number.");
  }
  const method = (input.billingMethod ?? "PER_KG").toString().toUpperCase();
  const chargeable = toChargeableWeight(actual, input.weightRounding, input.minWeight);

  let customerCharge: number;
  let internalCost: number;
  if (method === "FLAT") {
    customerCharge = Number(input.flatCharge ?? 0);
    internalCost = Number(input.internalMinCost ?? input.internalCostRate ?? 0);
  } else {
    customerCharge = chargeable * Number(input.customerRate ?? 0);
    internalCost = chargeable * Number(input.internalCostRate ?? 0);
  }
  const minCharge = Number(input.minCharge ?? 0);
  const minCost = Number(input.internalMinCost ?? 0);
  if (Number.isFinite(minCharge) && minCharge > 0) customerCharge = Math.max(customerCharge, minCharge);
  if (Number.isFinite(minCost) && minCost > 0) internalCost = Math.max(internalCost, minCost);

  customerCharge = Math.round(customerCharge * 100) / 100;
  internalCost = Math.round(internalCost * 100) / 100;
  const margin = Math.round((customerCharge - internalCost) * 100) / 100;

  return { actualWeight: actual, chargeableWeight: chargeable, customerCharge, internalCost, margin };
}

export function sumPackageWeights(packages: Array<{ weight?: number | null }>): number {
  const total = (packages ?? []).reduce((s, p) => s + (Number(p?.weight) || 0), 0);
  return Math.round(total * 1000) / 1000;
}
