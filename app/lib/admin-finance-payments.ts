import { adminFetch } from "@/app/lib/admin-api";

export type FinancePaymentClaim = {
  id: string;
  amount: number | string;
  mode: string;
  reference: string | null;
  status: string;
  createdAt: string;
  customer: { name: string | null; email: string; businessName: string | null };
  items: Array<{ invoice: { invoiceNumber: string } }>;
};

export async function listPendingFinancePaymentClaims(): Promise<
  FinancePaymentClaim[]
> {
  const data = await adminFetch<{ items?: FinancePaymentClaim[] } | FinancePaymentClaim[]>(
    "/api/finance/payments?kind=claims&status=PENDING&page=1&limit=100"
  );
  if (Array.isArray(data)) return data;
  return Array.isArray(data.items) ? data.items : [];
}

export async function confirmFinancePaymentClaim(claimId: string): Promise<void> {
  await adminFetch("/api/finance/payments", {
    method: "POST",
    body: JSON.stringify({ action: "confirm-claim", claimId }),
  });
}

export async function rejectFinancePaymentClaim(
  claimId: string,
  reason: string
): Promise<void> {
  await adminFetch("/api/finance/payments", {
    method: "POST",
    body: JSON.stringify({ action: "reject-claim", claimId, reason }),
  });
}

export type RecordFinancePaymentPayload = {
  customerId: string;
  amount: number;
  mode: string;
  reference: string;
  allocations: Array<{ invoiceId: string; amount: number }>;
};

export async function recordFinancePayment(
  payload: RecordFinancePaymentPayload
): Promise<void> {
  await adminFetch("/api/finance/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
