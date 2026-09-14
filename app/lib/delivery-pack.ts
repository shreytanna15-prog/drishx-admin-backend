import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { calcDeliveryPricing, sumPackageWeights } from "./delivery-calc";

export type PackageInput = { no?: number; weight: number };

export function parsePackages(value: unknown): PackageInput[] | null {
  if (!Array.isArray(value)) return null;
  const pkgs: PackageInput[] = [];
  for (let i = 0; i < value.length; i++) {
    const w = Number((value[i] as Record<string, unknown>)?.weight);
    if (!Number.isFinite(w) || w <= 0 || w > 1000) return null;
    pkgs.push({ no: i + 1, weight: Math.round(w * 1000) / 1000 });
  }
  if (pkgs.length === 0 || pkgs.length > 20) return null;
  return pkgs;
}

export async function resolveActiveDeliveryService(id: string) {
  const service = await prisma.deliveryService.findUnique({ where: { id } });
  if (!service || !service.isActive) return null;
  return service;
}

/** Validate an incoming deliveryServiceId (from any checkout body). Returns id or null. Throws on invalid. */
export async function resolveCheckoutDeliveryServiceId(raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const service = await prisma.deliveryService.findUnique({ where: { id: raw.trim() } });
  if (!service || !service.isActive) throw new Error("Selected delivery service is not available.");
  return service.id;
}

/** Compute pricing + upsert OrderDelivery. Appends weight history on change. */
export async function recordPackingDelivery(input: {
  orderId: string;
  deliveryServiceId: string;
  actualWeight?: number | null;
  packages?: PackageInput[] | null;
  enteredBy: string;
  reason?: string | null;
}) {
  const service = await prisma.deliveryService.findUnique({
    where: { id: input.deliveryServiceId },
  });
  if (!service || !service.isActive) throw new Error("Selected delivery service is not available.");

  let actual = Number(input.actualWeight);
  if (input.packages && input.packages.length > 0) {
    actual = sumPackageWeights(input.packages);
  }
  if (!Number.isFinite(actual) || actual <= 0 || actual > 10000) {
    throw new Error("Enter a valid packed weight (kg) greater than 0.");
  }

  const pricing = calcDeliveryPricing({
    actualWeight: actual,
    customerRate: Number(service.customerRate),
    internalCostRate: Number(service.internalCostRate),
    weightRounding: service.weightRounding,
    minWeight: Number(service.minWeight),
    minCharge: Number(service.minCharge),
    internalMinCost: Number(service.internalMinCost),
    billingMethod: service.billingMethod,
    flatCharge: Number(service.flatCharge),
  });

  const existing = await prisma.orderDelivery.findUnique({ where: { orderId: input.orderId } });
  const history = Array.isArray((existing?.weightHistory as unknown[]) ?? null)
    ? ([...(existing!.weightHistory as unknown[])] as Record<string, unknown>[])
    : [];
  if (existing) {
    history.push({
      from: Number(existing.actualWeight),
      to: pricing.actualWeight,
      by: input.enteredBy,
      at: new Date().toISOString(),
      reason: input.reason ?? null,
    });
  }

  const delivery = await prisma.orderDelivery.upsert({
    where: { orderId: input.orderId },
    create: {
      orderId: input.orderId,
      deliveryServiceId: service.id,
      actualWeight: pricing.actualWeight,
      chargeableWeight: pricing.chargeableWeight,
      customerCharge: pricing.customerCharge,
      internalCost: pricing.internalCost,
      margin: pricing.margin,
      packages: (input.packages ?? undefined) as Prisma.InputJsonValue | undefined,
      weightEnteredBy: input.enteredBy,
      weightEnteredAt: new Date(),
      weightHistory: (history.length > 0 ? history : undefined) as Prisma.InputJsonValue | undefined,
    },
    update: {
      deliveryServiceId: service.id,
      actualWeight: pricing.actualWeight,
      chargeableWeight: pricing.chargeableWeight,
      customerCharge: pricing.customerCharge,
      internalCost: pricing.internalCost,
      margin: pricing.margin,
      packages: (input.packages ?? undefined) as Prisma.InputJsonValue | undefined,
      weightEnteredBy: input.enteredBy,
      weightEnteredAt: new Date(),
      weightHistory: history as Prisma.InputJsonValue,
    },
  });

  await prisma.order.update({
    where: { id: input.orderId },
    data: { deliveryServiceId: service.id },
  });

  return { delivery, pricing, service };
}

export function serializeDeliveryForRole(
  delivery: Record<string, unknown> | null | undefined,
  role: string
) {
  if (!delivery) return null;
  const d = {
    ...delivery,
    actualWeight: Number((delivery as { actualWeight: unknown }).actualWeight ?? 0),
    chargeableWeight: Number((delivery as { chargeableWeight: unknown }).chargeableWeight ?? 0),
    customerCharge: Number((delivery as { customerCharge: unknown }).customerCharge ?? 0),
    internalCost: Number((delivery as { internalCost: unknown }).internalCost ?? 0),
    margin: Number((delivery as { margin: unknown }).margin ?? 0),
  } as Record<string, unknown>;
  if (role === "CUSTOMER") {
    delete d.internalCost;
    delete d.margin;
  }
  return d;
}
