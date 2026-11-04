import { adminFetch } from "@/app/lib/admin-api";

export type AdminDeliveryService = {
  id: string;
  courierCompany: string;
  serviceName: string;
  serviceType: string;
  isActive?: boolean;
  customerRate: number;
  billingMethod: string;
  flatCharge: number;
  minCharge: number;
  minWeight: number;
  weightRounding: string;
  internalCostRate: number;
  internalMinCost: number;
  etaText?: string | null;
};

export type DeliveryServiceOption = Pick<
  AdminDeliveryService,
  | "id"
  | "courierCompany"
  | "serviceName"
  | "serviceType"
  | "customerRate"
  | "etaText"
  | "isActive"
>;

export async function listDeliveryServices(opts?: {
  all?: boolean;
}): Promise<AdminDeliveryService[]> {
  const qs = opts?.all ? "?all=1" : "";
  const data = await adminFetch<AdminDeliveryService[]>(
    `/api/delivery-services${qs}`
  );
  return Array.isArray(data) ? data : [];
}

export async function listActiveDeliveryServiceOptions(): Promise<
  DeliveryServiceOption[]
> {
  const data = await adminFetch<
    DeliveryServiceOption[] | { services?: DeliveryServiceOption[] }
  >("/api/delivery-services");
  const list = Array.isArray(data) ? data : (data.services ?? []);
  return list.filter((s) => s.isActive !== false);
}

export type DeliveryServiceWritePayload = {
  courierCompany: string;
  serviceName: string;
  serviceType: string;
  customerRate: number;
  billingMethod: string;
  flatCharge: number;
  minCharge: number;
  minWeight: number;
  weightRounding: string;
  internalCostRate: number;
  internalMinCost: number;
  etaText: string | null;
  isActive?: boolean;
};

export async function createDeliveryService(
  payload: DeliveryServiceWritePayload
): Promise<void> {
  await adminFetch("/api/delivery-services", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDeliveryService(
  id: string,
  payload: Partial<DeliveryServiceWritePayload>
): Promise<void> {
  await adminFetch(`/api/delivery-services/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteDeliveryService(id: string): Promise<void> {
  await adminFetch(`/api/delivery-services/${id}`, { method: "DELETE" });
}
