export type DeliveryServiceRow = {
  customerRate: unknown;
  flatCharge: unknown;
  minCharge: unknown;
  minWeight: unknown;
  internalCostRate: unknown;
  internalMinCost: unknown;
  [k: string]: unknown;
};

export function serializeDeliveryService(s: DeliveryServiceRow) {
  return {
    ...s,
    customerRate: Number(s.customerRate ?? 0),
    flatCharge: Number(s.flatCharge ?? 0),
    minCharge: Number(s.minCharge ?? 0),
    minWeight: Number(s.minWeight ?? 0),
    internalCostRate: Number(s.internalCostRate ?? 0),
    internalMinCost: Number(s.internalMinCost ?? 0),
  };
}
