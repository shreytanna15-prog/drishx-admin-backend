import { adminFetch } from "@/app/lib/admin-api";

export type FinanceCompanySettings = {
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string;
  stateCode: string;
  gstin: string | null;
  pan: string | null;
  invoiceSeriesPrefix: string;
  defaultHsnCode: string;
  defaultGstRatePercent: number | string;
  paymentTermsDays: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  invoiceFooterNotes: string | null;
};

export async function getFinanceSettings(): Promise<FinanceCompanySettings> {
  return adminFetch<FinanceCompanySettings>("/api/finance/settings");
}

export async function updateFinanceSettings(
  form: FinanceCompanySettings
): Promise<FinanceCompanySettings> {
  return adminFetch<FinanceCompanySettings>("/api/finance/settings", {
    method: "PUT",
    body: JSON.stringify({
      ...form,
      defaultGstRatePercent: Number(form.defaultGstRatePercent),
      paymentTermsDays: Number(form.paymentTermsDays),
    }),
  });
}

export type PayablesSummary = {
  totalPayable: number;
  hasMore?: boolean;
  bills: Array<{
    id: string;
    billNumber: string;
    amountOutstanding: number | string;
    supplier: { name: string };
  }>;
};

export async function getFinancePayables(): Promise<PayablesSummary> {
  return adminFetch<PayablesSummary>(
    "/api/finance/purchases?resource=payables&page=1&limit=100"
  );
}

export type ReceivablesSummary = {
  totalReceivable: number;
  dueToday: number;
  overdue: number;
  aging: Record<string, number>;
  pendingClaims: number;
  hasMore?: boolean;
  total?: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    amountOutstanding: number | string;
    status: string;
    issuedAt: string | null;
    user: { businessName: string | null; name: string | null; email: string };
  }>;
};

export async function getFinanceReceivables(): Promise<ReceivablesSummary> {
  return adminFetch<ReceivablesSummary>(
    "/api/finance/receivables?page=1&limit=100"
  );
}
