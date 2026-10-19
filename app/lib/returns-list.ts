import type { Prisma } from "@prisma/client";
import {
  parseExactReturnRequestStatus,
  ReturnRequestStatus,
  statusesMatchingDisplayLabel,
} from "./return-request-status";

export const RETURNS_LIST_DEFAULT_LIMIT = 30;
export const RETURNS_LIST_MAX_LIMIT = 100;

/** Slim order context for return list rows (no images / timeline). */
export const returnsListOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  lineType: true,
  lensType: true,
  quantity: true,
  unitPrice: true,
  totalAmount: true,
  notes: true,
  sph: true,
  cyl: true,
  axis: true,
  add: true,
  eye: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, businessName: true },
  },
  assignedTo: {
    select: { id: true, name: true, email: true },
  },
  singleVisionLens: {
    select: { brand: true, coating: true, item: true },
  },
  kryptokLens: {
    select: { brand: true, coating: true, item: true },
  },
  progressiveLens: {
    select: { brand: true, coating: true, item: true },
  },
} as const;

export const returnsListInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      businessName: true,
      role: true,
    },
  },
  assignedEmployee: {
    select: { id: true, name: true, email: true, role: true },
  },
  primaryOrder: { select: returnsListOrderSelect },
  items: {
    select: {
      id: true,
      originalOrderId: true,
      lensLabel: true,
      quantity: true,
      eye: true,
      reason: true,
      itemRemarks: true,
      originalSph: true,
      originalCyl: true,
      originalAxis: true,
      originalAdd: true,
      requestedSph: true,
      requestedCyl: true,
      requestedAxis: true,
      requestedAdd: true,
      originalOrder: { select: returnsListOrderSelect },
    },
  },
} satisfies Prisma.ReturnRequestInclude;

export type ReturnsListParams = {
  page: number;
  limit: number;
  /** Single status or CSV of statuses. */
  status?: string;
  orderId?: string;
  q?: string;
  requestType?: string;
};

function parseStatusList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const allowed = new Set(Object.values(ReturnRequestStatus) as string[]);
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => allowed.has(s));
}

export function parseReturnsListParams(
  searchParams: URLSearchParams
): ReturnsListParams {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(
    searchParams.get("limit") ?? String(RETURNS_LIST_DEFAULT_LIMIT)
  );
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    RETURNS_LIST_MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : RETURNS_LIST_DEFAULT_LIMIT
    )
  );

  const status = searchParams.get("status")?.trim() || undefined;
  const orderId = searchParams.get("orderId")?.trim() || undefined;
  const q = searchParams.get("q")?.trim() || undefined;
  const requestType = searchParams.get("requestType")?.trim().toUpperCase() || undefined;

  return { page, limit, status, orderId, q, requestType };
}

/**
 * Exact order-number token for returns search (`504094`, `#504094`).
 * Rejects non-digit / partial tokens so text searches stay unaffected.
 */
export function parseExactOrderNumberQuery(raw: string): number | null {
  const trimmed = raw.trim().replace(/^#/, "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function buildReturnsListWhere(
  roleScope: Prisma.ReturnRequestWhereInput,
  params: ReturnsListParams
): Prisma.ReturnRequestWhereInput {
  const parts: Prisma.ReturnRequestWhereInput[] = [roleScope];

  const statuses = parseStatusList(params.status);
  if (statuses.length === 1) {
    parts.push({
      status: statuses[0] as (typeof ReturnRequestStatus)[keyof typeof ReturnRequestStatus],
    });
  } else if (statuses.length > 1) {
    parts.push({
      status: {
        in: statuses as Array<
          (typeof ReturnRequestStatus)[keyof typeof ReturnRequestStatus]
        >,
      },
    });
  }

  if (params.requestType === "RETURN" || params.requestType === "REPLACEMENT") {
    parts.push({ requestType: params.requestType });
  }

  if (params.orderId) {
    parts.push({ items: { some: { originalOrderId: params.orderId } } });
  }

  const q = params.q?.trim();
  if (q) {
    const or: Prisma.ReturnRequestWhereInput[] = [
      { requestNumber: { contains: q, mode: "insensitive" } },
      {
        customer: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { businessName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      {
        assignedEmployee: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      {
        items: {
          some: {
            OR: [
              { lensLabel: { contains: q, mode: "insensitive" } },
              { originalOrderId: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
    // Exact enum token (SUBMITTED) and/or UI label ("Pending Admin Review").
    const statusFromEnum = parseExactReturnRequestStatus(q);
    const statusesFromLabel = statusesMatchingDisplayLabel(q);
    const statusMatches = new Set(
      [
        ...(statusFromEnum ? [statusFromEnum] : []),
        ...statusesFromLabel,
      ]
    );
    if (statusMatches.size === 1) {
      or.push({ status: [...statusMatches][0]! });
    } else if (statusMatches.size > 1) {
      or.push({ status: { in: [...statusMatches] } });
    }
    // Linked Order.orderNumber (primary and any item.originalOrder).
    const orderNumber = parseExactOrderNumberQuery(q);
    if (orderNumber != null) {
      or.push({ primaryOrder: { orderNumber } });
      or.push({
        items: { some: { originalOrder: { orderNumber } } },
      });
    }
    parts.push({ OR: or });
  }

  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function serializeListOrder(
  order: {
    id: string;
    orderNumber: number | null;
    status: string;
    lineType: string;
    lensType: string;
    quantity: number;
    unitPrice: unknown;
    totalAmount: unknown;
    notes?: string | null;
    sph?: unknown;
    cyl?: unknown;
    axis?: number | null;
    add?: unknown;
    eye?: string | null;
    createdAt: Date;
    user?: {
      id: string;
      name: string | null;
      email: string;
      businessName?: string | null;
    } | null;
    assignedTo?: { id: string; name: string | null; email: string } | null;
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
  } | null
) {
  if (!order) return null;
  return {
    ...order,
    unitPrice: num(order.unitPrice),
    totalAmount: num(order.totalAmount),
    sph: order.sph != null ? Number(order.sph) : null,
    cyl: order.cyl != null ? Number(order.cyl) : null,
    add: order.add != null ? Number(order.add) : null,
    createdAt: order.createdAt.toISOString(),
  };
}

type ListRow = Prisma.ReturnRequestGetPayload<{
  include: typeof returnsListInclude;
}>;

/** Summary list row — no signed images, timeline, or credit notes. */
export function serializeReturnListItem(row: ListRow) {
  return {
    id: row.id,
    requestNumber: row.requestNumber,
    requestType: row.requestType,
    status: row.status,
    customerRemarks: row.customerRemarks,
    employeeRemarks: row.employeeRemarks,
    adminRemarks: row.adminRemarks,
    rejectionReason: row.rejectionReason,
    approvedAmount:
      row.approvedAmount !== null ? Number(row.approvedAmount) : null,
    replacementBatchId: row.replacementBatchId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customer: row.customer,
    assignedEmployee: row.assignedEmployee,
    primaryOrder: serializeListOrder(row.primaryOrder),
    items: row.items.map((item) => ({
      id: item.id,
      originalOrderId: item.originalOrderId,
      lensLabel: item.lensLabel,
      quantity: item.quantity,
      eye: item.eye,
      reason: item.reason,
      itemRemarks: item.itemRemarks,
      originalSph: item.originalSph != null ? Number(item.originalSph) : null,
      originalCyl: item.originalCyl != null ? Number(item.originalCyl) : null,
      originalAxis: item.originalAxis,
      originalAdd: item.originalAdd != null ? Number(item.originalAdd) : null,
      requestedSph:
        item.requestedSph != null ? Number(item.requestedSph) : null,
      requestedCyl:
        item.requestedCyl != null ? Number(item.requestedCyl) : null,
      requestedAxis: item.requestedAxis,
      requestedAdd:
        item.requestedAdd != null ? Number(item.requestedAdd) : null,
      originalOrder: serializeListOrder(item.originalOrder),
    })),
    /** List omits images — detail GET signs URLs. */
    images: [] as [],
    timelineEvents: [] as [],
  };
}
