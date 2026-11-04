import { adminFetch } from "@/app/lib/admin-api";
import { formatReturnRequestStatusLabel } from "@/app/lib/return-request-status";
import type { Paginated } from "@/app/lib/types/api-client";

export type AdminReturnStatus =
  | "SUBMITTED"
  | "MORE_INFO_REQUIRED"
  | "ESCALATED_TO_ADMIN"
  | "AWAITING_MATERIAL"
  | "APPROVED_CREDIT"
  | "APPROVED_REPLACEMENT"
  | "REJECTED"
  | "CLOSED";

/** Order snapshot attached to return items / primary order (Orders-screen fields). */
export type AdminReturnOrderContext = {
  id: string;
  orderNumber: number | null;
  status: string;
  lineType: string;
  lensType: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  notes?: string | null;
  sph?: number | null;
  cyl?: number | null;
  axis?: number | null;
  add?: number | null;
  eye?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
    businessName?: string | null;
  } | null;
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  singleVisionLens?: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
  } | null;
  kryptokLens?: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
  } | null;
  progressiveLens?: {
    brand?: string | null;
    coating?: string | null;
    item?: string | null;
  } | null;
};

export type AdminReturnRequest = {
  id: string;
  requestNumber: string;
  requestType: "RETURN" | "REPLACEMENT";
  status: AdminReturnStatus;
  customerRemarks?: string | null;
  employeeRemarks?: string | null;
  adminRemarks?: string | null;
  rejectionReason?: string | null;
  approvedAmount?: number | null;
  /** Max credit admin may approve (null when not decidable). Server-computed. */
  eligibleCreditAmount?: number | null;
  replacementBatchId?: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string | null;
    email: string;
    businessName?: string | null;
    role?: string | null;
  };
  assignedEmployee?: {
    id: string;
    name: string | null;
    email: string;
    role?: string | null;
  } | null;
  primaryOrder?: AdminReturnOrderContext | null;
  items: Array<{
    id: string;
    originalOrderId: string;
    lensLabel: string;
    quantity: number;
    eye?: string | null;
    reason: string;
    itemRemarks?: string | null;
    originalSph?: number | null;
    originalCyl?: number | null;
    originalAxis?: number | null;
    originalAdd?: number | null;
    requestedSph?: number | null;
    requestedCyl?: number | null;
    requestedAxis?: number | null;
    requestedAdd?: number | null;
    originalOrder?: AdminReturnOrderContext | null;
  }>;
  images: Array<{
    id: string;
    imageUrl: string;
    createdAt: string;
  }>;
  timelineEvents: Array<{
    id: string;
    eventType: string;
    message: string;
    createdAt: string;
    actorUser?: {
      id: string;
      name: string | null;
      email: string;
      role?: string | null;
    } | null;
  }>;
  creditNote?: {
    id: string;
    creditNoteNumber: string;
    amount: number;
  } | null;
};

export function formatReturnOrderDisplayId(
  order: Pick<AdminReturnOrderContext, "id" | "orderNumber">
) {
  if (order.orderNumber != null) return `#${order.orderNumber}`;
  return `#${order.id.slice(0, 8).toUpperCase()}`;
}

export function formatReturnOrderCatalogSummary(
  order: AdminReturnOrderContext
): string {
  const lens =
    order.progressiveLens ?? order.kryptokLens ?? order.singleVisionLens ?? null;
  if (!lens) {
    return order.lensType
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  const parts = [lens.brand, lens.coating, lens.item]
    .map((part) => part?.trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return order.lensType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReturnMoney(value: number | string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatReturnOrderStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReturnStatus(status: string) {
  return formatReturnRequestStatusLabel(status);
}

export function formatReturnReason(reason: string) {
  return reason
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatReturnPowerLine(parts: {
  sph?: number | null;
  cyl?: number | null;
  add?: number | null;
  axis?: number | null;
}): string {
  const format = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    if (rounded === 0) return "0.00";
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded.toFixed(2)}`;
  };
  const labels = [
    parts.sph != null ? `SPH ${format(parts.sph)}` : null,
    parts.cyl != null ? `CYL ${format(parts.cyl)}` : null,
    parts.add != null ? `ADD ${format(parts.add)}` : null,
    parts.axis != null ? `AXIS ${parts.axis}` : null,
  ].filter(Boolean);
  return labels.length > 0 ? labels.join(" · ") : "—";
}

export function formatReturnDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function returnStatusBadgeClass(status: AdminReturnStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/50 bg-amber-500/15 text-amber-100";
    case "MORE_INFO_REQUIRED":
      return "border-sky-400/50 bg-sky-500/15 text-sky-100";
    case "ESCALATED_TO_ADMIN":
      return "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100";
    case "AWAITING_MATERIAL":
      return "border-indigo-400/50 bg-indigo-500/15 text-indigo-100";
    case "APPROVED_CREDIT":
    case "APPROVED_REPLACEMENT":
      return "border-emerald-400/50 bg-emerald-500/15 text-emerald-100";
    case "REJECTED":
      return "border-rose-400/50 bg-rose-500/15 text-rose-100";
    case "CLOSED":
      return "border-slate-400/50 bg-slate-500/15 text-slate-100";
  }
}

/** Persisted credit fields shown on Admin Returns detail (read-only). */
export type ApprovedCreditDisplayInput = {
  status: string;
  approvedAmount?: number | null;
  creditNote?: {
    creditNoteNumber?: string | null;
    amount?: number | null;
    allocations?: Array<{
      invoiceId?: string | null;
      amount?: number | null;
      taxableAmount?: number | null;
      invoice?: { invoiceNumber?: string | null } | null;
    }> | null;
  } | null;
};

export type ApprovedCreditAllocationDisplay = {
  invoiceId: string;
  invoiceNumber: string | null;
  amount: number;
  taxableAmount: number;
};

export type ApprovedCreditDisplay =
  | { show: false }
  | {
      show: true;
      needsReconciliation: boolean;
      approvedAmount: number | null;
      creditNoteNumber: string | null;
      creditNoteAmount: number | null;
      /** Empty for historical CNs issued before CreditNoteAllocation existed. */
      allocations: ApprovedCreditAllocationDisplay[];
    };

function persistedFiniteAmount(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve read-only Approved Credit panel state from API-persisted fields only.
 * Never invents amounts — missing required records → reconciliation flag.
 */
export function resolveApprovedCreditDisplay(
  input: ApprovedCreditDisplayInput
): ApprovedCreditDisplay {
  if (input.status !== "APPROVED_CREDIT") {
    return { show: false };
  }

  const approvedAmount = persistedFiniteAmount(input.approvedAmount);
  const creditNoteNumber =
    typeof input.creditNote?.creditNoteNumber === "string" &&
    input.creditNote.creditNoteNumber.trim()
      ? input.creditNote.creditNoteNumber.trim()
      : null;
  const creditNoteAmount = persistedFiniteAmount(input.creditNote?.amount);

  const allocations: ApprovedCreditAllocationDisplay[] = (
    input.creditNote?.allocations ?? []
  ).flatMap((row) => {
    const amount = persistedFiniteAmount(row.amount);
    const invoiceId =
      typeof row.invoiceId === "string" && row.invoiceId.trim()
        ? row.invoiceId.trim()
        : null;
    if (amount == null || !invoiceId) return [];
    return [
      {
        invoiceId,
        invoiceNumber:
          typeof row.invoice?.invoiceNumber === "string" &&
          row.invoice.invoiceNumber.trim()
            ? row.invoice.invoiceNumber.trim()
            : null,
        amount,
        taxableAmount: persistedFiniteAmount(row.taxableAmount) ?? 0,
      },
    ];
  });

  const needsReconciliation =
    approvedAmount == null || creditNoteNumber == null || creditNoteAmount == null;

  return {
    show: true,
    needsReconciliation,
    approvedAmount,
    creditNoteNumber,
    creditNoteAmount,
    allocations,
  };
}

export type ListAdminReturnsParams = {
  page?: number;
  limit?: number;
  status?: string;
  orderId?: string;
  q?: string;
};

export type PaginatedAdminReturns = Paginated<AdminReturnRequest>;

export function buildReturnsQueryString(params?: ListAdminReturnsParams): string {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.orderId?.trim()) qs.set("orderId", params.orderId.trim());
  if (params.q?.trim()) qs.set("q", params.q.trim());
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function normalizeReturnsListResponse(
  data: unknown
): PaginatedAdminReturns {
  if (Array.isArray(data)) {
    return {
      items: data as AdminReturnRequest[],
      page: 1,
      limit: data.length,
      hasMore: false,
      total: data.length,
    };
  }
  const body = data as Partial<PaginatedAdminReturns> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    page: typeof body?.page === "number" ? body.page : 1,
    limit: typeof body?.limit === "number" ? body.limit : items.length,
    hasMore: Boolean(body?.hasMore),
    total: typeof body?.total === "number" ? body.total : undefined,
  };
}

export async function listAdminReturns(
  params?: ListAdminReturnsParams
): Promise<PaginatedAdminReturns> {
  const data = await adminFetch<unknown>(
    `/api/returns${buildReturnsQueryString(params)}`
  );
  return normalizeReturnsListResponse(data);
}

export async function getAdminReturn(id: string): Promise<AdminReturnRequest> {
  return adminFetch<AdminReturnRequest>(`/api/returns/${id}`);
}

export type SubmitReturnDecisionPayload = {
  decision: "CREDIT" | "REPLACEMENT" | "REJECT";
  remarks: string;
  approvedAmount?: number;
  stockDisposition: string;
  assignedEmployeeId?: string;
};

export async function submitAdminReturnDecision(
  returnId: string,
  payload: SubmitReturnDecisionPayload
): Promise<void> {
  await adminFetch(`/api/returns/${returnId}/decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchAdminReturn(
  returnId: string,
  body: Record<string, unknown>
): Promise<void> {
  await adminFetch(`/api/returns/${returnId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function createAdminReturn(
  body: Record<string, unknown>
): Promise<{ id: string; requestNumber?: string }> {
  return adminFetch<{ id: string; requestNumber?: string }>("/api/returns", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function uploadAdminReturnImage(
  returnId: string,
  file: File
): Promise<void> {
  const { adminAuthFetch } = await import("@/app/lib/admin-auth-fetch");
  const formData = new FormData();
  formData.set("photo", file);
  const res = await adminAuthFetch(`/api/returns/${returnId}/images`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof (data as { error?: string })?.error === "string"
        ? (data as { error: string }).error
        : "Return created but photo upload failed."
    );
  }
}
