/** Client-side types + fetch helpers for stock-wise procurement. */

import { ProcurementRequestStatus } from "@prisma/client";
import { adminFetch } from "@/app/lib/admin-api";

export type LensPowerInfo = {
  sph: number | null;
  cyl: number | null;
  crossPower: number | null;
  add: number | null;
  eye: string | null;
};

export type ProcurementLensInfo = {
  id: string;
  lensType: string;
  quantity: number;
  brand: string | null;
  item: string | null;
  coating: string | null;
  sph: number | null;
  cyl: number | null;
  crossPower: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  costPrice: number | null;
  price: number | null;
  isDisabled: boolean;
};

export type StockPositionInfo = {
  onHand: number;
  committed: number;
  available: number;
  incoming: number;
};

export type ReorderRuleRow = {
  id: string;
  lensType: string;
  lensId: string;
  minStock: number;
  targetStock: number;
  autoProcure: boolean;
  preferredSupplierId: string | null;
  preferredSupplier: { id: string; name: string } | null;
  moq: number | null;
  isActive: boolean;
  updatedAt: string;
  lens: ProcurementLensInfo | null;
  position: StockPositionInfo;
  belowMin: boolean;
  hasOpenRequest: boolean;
};

export type SupplierOption = { id: string; name: string };

export type ReorderRulesResponse = {
  rules: ReorderRuleRow[];
  suppliers: SupplierOption[];
  canEdit: boolean;
  supportedLensTypes: string[];
  unconfigured?: Array<{
    lensType: string;
    lensId: string;
    lens: ProcurementLensInfo;
    position: StockPositionInfo;
  }>;
};

export type ProcurementRequestRow = {
  id: string;
  publicId: string;
  lensType: string;
  lensId: string;
  source: string;
  status: string;
  priority: string;
  requiredQuantity: number;
  requestedQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  orderId: string | null;
  triggerReason: string | null;
  createdAt: string;
  lensLabel: string | null;
  power: LensPowerInfo | null;
  order: { id: string; orderNumber: string; status: string } | null;
  reorderRule: { id: string; minStock: number; targetStock: number } | null;
  stockAtTrigger: number | null;
  minStockAtTrigger: number | null;
  targetStockAtTrigger: number | null;
  availableAtTrigger: number | null;
  incomingAtTrigger: number | null;
  approvedAt: string | null;
  resolutionReason: string | null;
};

export type ProcurementRequestsResponse = {
  requests: ProcurementRequestRow[];
  summary: {
    open: number;
    underReview: number;
    approved: number;
    critical: number;
  };
  count: number;
};

export type ReorderCheckResponse = {
  scanned: number;
  created: number;
  suppressed: number;
  notNeeded: number;
  results: Array<{
    lensType: string;
    lensId: string;
    outcome: string;
    publicId?: string;
  }>;
};

export const PROCUREMENT_SOURCES = [
  { value: "", label: "All sources" },
  { value: "ORDER_SHORTAGE", label: "Order shortage" },
  { value: "MINIMUM_STOCK_THRESHOLD", label: "Minimum stock threshold" },
  { value: "MANUAL", label: "Manual" },
] as const;

/**
 * Dropdown options must match Prisma `ProcurementRequestStatus` exactly.
 * Receiving progress is NOT a PR status — it lives on `receivedQuantity`
 * (and PO `PARTIALLY_RECEIVED`). Full receipt closes the PR as RESOLVED.
 */
export const PROCUREMENT_REQUEST_STATUS_LABELS: Record<
  ProcurementRequestStatus,
  string
> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
  RESOLVED: "Resolved",
};

export const PROCUREMENT_STATUSES = [
  { value: "", label: "All statuses" },
  ...(
    Object.values(ProcurementRequestStatus) as ProcurementRequestStatus[]
  ).map((value) => ({
    value,
    label: PROCUREMENT_REQUEST_STATUS_LABELS[value],
  })),
] as const;

export const PROCUREMENT_PRIORITIES = [
  { value: "", label: "Any priority" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOW", label: "Low" },
] as const;

export const LENS_TYPE_LABELS: Record<string, string> = {
  SINGLE_VISION: "Single Vision",
  KRYPTOK: "Kryptok",
  PROGRESSIVE: "Progressive",
  ORI_VISION: "Ori Vision",
  MAGNUS: "Magnus",
  BIFOCAL: "Bifocal",
};

export const PRIORITY_BADGE_CLASS: Record<string, string> = {
  CRITICAL: "border-red-300 bg-red-50 text-red-700",
  HIGH: "border-amber-300 bg-amber-50 text-amber-800",
  NORMAL: "border-(--brand-card-border) bg-(--brand-muted) text-(--brand-text)",
  LOW: "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted)",
};

export const STATUS_BADGE_CLASS: Record<string, string> = {
  OPEN: "border-amber-300 bg-amber-50 text-amber-800",
  UNDER_REVIEW: "border-sky-300 bg-sky-50 text-sky-800",
  APPROVED: "border-indigo-300 bg-indigo-50 text-indigo-800",
  CANCELLED: "border-(--brand-card-border) bg-(--brand-muted) text-(--brand-text-muted)",
  RESOLVED: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

/** Compact power label, e.g. `-2.00`, `SPH -2.00 / CYL -0.50`, `cross -2`. */
export function formatPowerValue(power: LensPowerInfo | null): string {
  if (!power) return "—";
  if (power.crossPower !== null && power.crossPower !== undefined) {
    return `cross ${trimZero(power.crossPower)}`;
  }
  const parts: string[] = [];
  if (power.sph !== null && power.sph !== undefined) parts.push(`SPH ${trimZero(power.sph)}`);
  if (power.cyl !== null && power.cyl !== undefined) parts.push(`CYL ${trimZero(power.cyl)}`);
  if (parts.length === 0) return "PLANO";
  let label = parts.join(" / ");
  if (power.add !== null && power.add !== undefined && Number(power.add) !== 0) {
    label += ` / ADD ${trimZero(power.add)}`;
  }
  if (power.eye) label += ` · ${power.eye}`;
  return label;
}

function trimZero(value: number): string {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

export function formatLensName(lens: ProcurementLensInfo | null): string {
  if (!lens) return "—";
  return [lens.brand, lens.item, lens.coating].filter(Boolean).join(" ") || "—";
}

export function formatProcDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "ORDER_SHORTAGE":
      return "Order shortage";
    case "MINIMUM_STOCK_THRESHOLD":
      return "Min stock threshold";
    case "MANUAL":
      return "Manual";
    default:
      return source;
  }
}

export async function listProcurementRequests(
  params: URLSearchParams,
  init?: RequestInit
): Promise<ProcurementRequestsResponse> {
  return adminFetch<ProcurementRequestsResponse>(
    `/api/procurement/requests?${params.toString()}`,
    init
  );
}

export async function procurementRequestAction(
  requestId: string,
  action: "approve" | "cancel",
  body?: Record<string, unknown>
): Promise<void> {
  await adminFetch(`/api/procurement/requests/${requestId}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}
