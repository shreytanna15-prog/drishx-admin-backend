import { adminFetch } from "@/app/lib/admin-api";
import type { AdminOrder } from "@/app/lib/admin-orders";

export type DispatchStats = {
  days: number;
  stats: Array<{
    courierCompany: string;
    orders: number;
    totalCustomerCharge: number;
    totalInternalCost: number;
    margin: number;
  }>;
  totals: {
    orders: number;
    totalCustomerCharge: number;
    totalInternalCost: number;
    margin: number;
  };
};

export async function listPendingDispatches(): Promise<AdminOrder[]> {
  const data = await adminFetch<{ orders: AdminOrder[] }>(
    "/api/dispatch/pending"
  );
  return Array.isArray(data.orders) ? data.orders : [];
}

export async function getDispatchStats(days = 30): Promise<DispatchStats> {
  return adminFetch<DispatchStats>(`/api/dispatch/stats?days=${days}`);
}

export async function dispatchOrder(
  orderId: string,
  input: { courierName: string; trackingNumber: string }
): Promise<void> {
  await adminFetch(`/api/orders/${orderId}/dispatch`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function overrideDispatchCutoff(
  orderId: string,
  reason: string
): Promise<void> {
  await adminFetch(`/api/orders/${orderId}/dispatch-override`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
