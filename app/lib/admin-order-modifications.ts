import { adminFetch } from "@/app/lib/admin-api";

export type AdminOrderModification = {
  id: string; orderId: string; requestedById: string;
  requestedQuantity: number; requestedPowerId: string | null;
  reason: string; status: "PENDING" | "APPROVED" | "REJECTED";
  decisionReason: string | null; goodsReturnedConfirmed: boolean;
  createdAt: string; decidedAt: string | null;
};

export function listAdminOrderModifications(orderId: string) {
  return adminFetch<{ items: AdminOrderModification[] }>(`/api/orders/${orderId}/modification`);
}

export function decideAdminOrderModification(input: {
  orderId: string; requestId: string; decision: "APPROVE" | "REJECT";
  reason: string; goodsReturnedConfirmed: boolean;
}) {
  return adminFetch<AdminOrderModification>(
    `/api/orders/${input.orderId}/modification/${input.requestId}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}
