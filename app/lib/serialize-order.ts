/** Normalize prescription decimals for JSON clients (mobile app). */
export function serializeOrderPrescription(order: {
  sph?: unknown;
  cyl?: unknown;
  axis?: number | null;
  add?: unknown;
  eye?: string | null;
}) {
  return {
    sph: order.sph != null && order.sph !== "" ? Number(order.sph) : null,
    cyl: order.cyl != null && order.cyl !== "" ? Number(order.cyl) : null,
    axis: order.axis ?? null,
    add: order.add != null && order.add !== "" ? Number(order.add) : null,
    eye: order.eye ?? null,
  };
}

export function serializeWholesaleLineItem(line: {
  id: string;
  powerKey: string;
  quantity: number;
  reservedQuantity: number;
  unitPrice: unknown;
  totalAmount: unknown;
  sph: unknown;
  cyl?: unknown;
  axis?: number | null;
  add?: unknown;
  needsProcurement: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: line.id,
    powerKey: line.powerKey,
    quantity: line.quantity,
    reservedQuantity: line.reservedQuantity,
    unitPrice: Number(line.unitPrice),
    totalAmount: Number(line.totalAmount),
    sph: Number(line.sph),
    cyl: line.cyl != null && line.cyl !== "" ? Number(line.cyl) : null,
    axis: line.axis ?? null,
    add: line.add != null && line.add !== "" ? Number(line.add) : null,
    needsProcurement: line.needsProcurement,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  };
}
