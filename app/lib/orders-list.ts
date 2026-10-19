import type { OrderStatus, Prisma } from "@prisma/client";
import { orderPlacedByInclude } from "./order-attribution";
import { employeeOrdersWhere } from "./prescription-order-hold";
import { sanitizeOrderForRole } from "./order-activity";

export const ORDERS_LIST_DEFAULT_LIMIT = 30;
export const ORDERS_LIST_MAX_LIMIT = 100;

export type OrdersListScope = "all" | "catalog" | "rx_lab";

export type OrdersListParams = {
  page: number;
  limit: number;
  status?: string[];
  q?: string;
  employeeId?: string | null;
  userId?: string | null;
  batchId?: string | null;
  lineType?: string | null;
  orderKind?: string | null;
  scope?: OrdersListScope;
  assigneeId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

const ORDER_STATUSES = new Set<string>([
  "PENDING",
  "PICKING",
  "PACKED",
  "DISPATCHED",
  "PARTIALLY_FULFILLED",
  "AWAITING_PROCUREMENT",
  "COMPLETED",
  "CANCELLED",
]);

/**
 * Slim lens fields per Prisma model (families differ — do not share one select).
 * SV: no axis/add/eye. Kryptok: no index/eye. Progressive: no crossPower.
 */
export const ordersListSvLensSelect = {
  id: true,
  brand: true,
  category: true,
  item: true,
  coating: true,
  index: true,
  sph: true,
  cyl: true,
  crossPower: true,
} as const satisfies Prisma.SingleVisionLensSelect;

export const ordersListKryptokLensSelect = {
  id: true,
  brand: true,
  category: true,
  item: true,
  coating: true,
  sph: true,
  cyl: true,
  crossPower: true,
  axis: true,
  add: true,
} as const satisfies Prisma.KryptokLensSelect;

export const ordersListProgressiveLensSelect = {
  id: true,
  brand: true,
  category: true,
  item: true,
  coating: true,
  index: true,
  sph: true,
  cyl: true,
  axis: true,
  add: true,
  eye: true,
} as const satisfies Prisma.ProgressiveLensSelect;

export const ordersListInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      businessName: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  ...orderPlacedByInclude,
  singleVisionLens: { select: ordersListSvLensSelect },
  kryptokLens: { select: ordersListKryptokLensSelect },
  progressiveLens: { select: ordersListProgressiveLensSelect },
} satisfies Prisma.OrderInclude;

export function parseOrdersListParams(searchParams: URLSearchParams): OrdersListParams {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(searchParams.get("limit") ?? String(ORDERS_LIST_DEFAULT_LIMIT));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    ORDERS_LIST_MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : ORDERS_LIST_DEFAULT_LIMIT
    )
  );

  const statusParam = searchParams.get("status")?.trim() || "";
  const status = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => ORDER_STATUSES.has(s))
    : undefined;

  const scopeRaw = searchParams.get("scope")?.trim().toLowerCase();
  const scope: OrdersListScope =
    scopeRaw === "catalog" || scopeRaw === "rx_lab" || scopeRaw === "all"
      ? scopeRaw
      : "all";

  return {
    page,
    limit,
    status: status?.length ? status : undefined,
    q: searchParams.get("q")?.trim() || undefined,
    employeeId: searchParams.get("employeeId")?.trim() || null,
    userId: searchParams.get("userId")?.trim() || null,
    batchId: searchParams.get("batchId")?.trim() || null,
    lineType: searchParams.get("lineType")?.trim().toUpperCase() || null,
    orderKind: searchParams.get("orderKind")?.trim().toUpperCase() || null,
    scope,
    assigneeId: searchParams.get("assigneeId")?.trim() || null,
    dateFrom: searchParams.get("dateFrom")?.trim() || null,
    dateTo: searchParams.get("dateTo")?.trim() || null,
  };
}

/** Prescription lab: RX form, photo prescription, or still on warehouse hold. */
function rxLabWhere(): Prisma.OrderWhereInput {
  return {
    OR: [
      { warehouseHold: true },
      { notes: { contains: "[RX Order]" } },
      {
        AND: [
          { orderImageUrl: { not: null } },
          { NOT: { notes: { contains: "[RX Order]" } } },
          { NOT: { notes: { contains: "[Color Lens]" } } },
        ],
      },
    ],
  };
}

/** Catalog / color / wholesale — excludes prescription lab jobs. */
function catalogWhere(): Prisma.OrderWhereInput {
  return { NOT: rxLabWhere() };
}

function orderKindWhere(orderKind: string): Prisma.OrderWhereInput | null {
  switch (orderKind) {
    case "RX":
      return { notes: { contains: "[RX Order]" } };
    case "COLOR":
      return { notes: { contains: "[Color Lens]" } };
    case "WHOLESALE":
      return { lineType: "WHOLESALE" };
    case "RETAIL":
      return {
        lineType: "RETAIL",
        NOT: {
          OR: [
            { notes: { contains: "[RX Order]" } },
            { notes: { contains: "[Color Lens]" } },
          ],
        },
      };
    default:
      return null;
  }
}

export function buildOrdersListWhere(
  session: { role: string; userId: string },
  params: OrdersListParams
): Prisma.OrderWhereInput {
  const parts: Prisma.OrderWhereInput[] = [];

  if (session.role === "CUSTOMER") {
    parts.push({ userId: session.userId });
  } else if (session.role === "EMPLOYEE") {
    parts.push(employeeOrdersWhere(session.userId));
  } else {
    if (params.employeeId) parts.push({ assignedToId: params.employeeId });
    if (params.userId) parts.push({ userId: params.userId });
  }

  if (params.batchId) {
    parts.push({ checkoutBatchId: params.batchId });
  }

  if (params.status?.length === 1) {
    parts.push({ status: params.status[0] as OrderStatus });
  } else if (params.status && params.status.length > 1) {
    parts.push({ status: { in: params.status as OrderStatus[] } });
  }

  if (params.lineType === "RETAIL" || params.lineType === "WHOLESALE") {
    parts.push({ lineType: params.lineType });
  }

  if (params.scope === "catalog") {
    parts.push(catalogWhere());
  } else if (params.scope === "rx_lab") {
    parts.push(rxLabWhere());
  }

  if (params.orderKind) {
    const kind = orderKindWhere(params.orderKind);
    if (kind) parts.push(kind);
  }

  if (params.assigneeId) {
    if (params.assigneeId === "__unassigned__") {
      parts.push({ assignedToId: null });
    } else {
      parts.push({ assignedToId: params.assigneeId });
    }
  }

  if (params.dateFrom) {
    const from = new Date(params.dateFrom);
    if (!Number.isNaN(from.getTime())) {
      parts.push({ createdAt: { gte: from } });
    }
  }
  if (params.dateTo) {
    const to = new Date(params.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      parts.push({ createdAt: { lte: to } });
    }
  }

  if (params.q) {
    const q = params.q;
    const or: Prisma.OrderWhereInput[] = [
      { id: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { status: { equals: q.toUpperCase() as OrderStatus } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { businessName: { contains: q, mode: "insensitive" } } },
    ];
    // Only match status when q is a known status — avoid invalid enum queries.
    if (!ORDER_STATUSES.has(q.toUpperCase())) {
      or.splice(2, 1);
    }
    const asNumber = Number(q.replace(/^#/, ""));
    if (Number.isFinite(asNumber) && asNumber > 0) {
      or.push({ orderNumber: Math.floor(asNumber) });
    }
    parts.push({ OR: or });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

type ListOrderRow = Prisma.OrderGetPayload<{ include: typeof ordersListInclude }>;

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Serialize a list row — summary only (no signed images, no fat relations). */
export function serializeOrderListItem(order: ListOrderRow, role: string) {
  const hasOrderImage = Boolean(order.orderImageUrl);
  const payload = {
    id: order.id,
    orderNumber: order.orderNumber,
    checkoutBatchId: order.checkoutBatchId,
    lensType: order.lensType,
    lineType: order.lineType,
    quantity: order.quantity,
    reservedQuantity: order.reservedQuantity,
    pickedQuantity: order.pickedQuantity,
    unitPrice: Number(order.unitPrice),
    totalAmount: Number(order.totalAmount),
    status: order.status,
    notes: order.notes,
    cancelReason: order.cancelReason,
    courierName: order.courierName,
    trackingNumber: order.trackingNumber,
    deliveryServiceId: order.deliveryServiceId,
    sph: num(order.sph),
    cyl: num(order.cyl),
    axis: order.axis,
    add: num(order.add),
    eye: order.eye,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    assignedToId: order.assignedToId,
    assignedAt: order.assignedAt?.toISOString() ?? null,
    warehouseHold: order.warehouseHold ?? false,
    warehouseReleasedAt: order.warehouseReleasedAt?.toISOString() ?? null,
    warehouseReleasedById: order.warehouseReleasedById ?? null,
    dispatchDate: order.dispatchDate?.toISOString() ?? null,
    cutoffDeferred: order.cutoffDeferred ?? false,
    dispatchOverridden: Boolean(order.dispatchOverrideStamp),
    orderSource: order.orderSource ?? null,
    placedByUserId: order.placedByUserId ?? null,
    hasOrderImage,
    /** List never signs images — detail GET still does. */
    orderImageUrl: null as string | null,
    user: order.user,
    assignedTo: order.assignedTo,
    placedBy: order.placedBy ?? null,
    singleVisionLens: order.singleVisionLens
      ? {
          ...order.singleVisionLens,
          sph: num(order.singleVisionLens.sph),
          cyl: num(order.singleVisionLens.cyl),
          crossPower: num(order.singleVisionLens.crossPower),
          index: num(order.singleVisionLens.index),
        }
      : null,
    kryptokLens: order.kryptokLens
      ? {
          ...order.kryptokLens,
          sph: num(order.kryptokLens.sph),
          cyl: num(order.kryptokLens.cyl),
          crossPower: num(order.kryptokLens.crossPower),
          add: num(order.kryptokLens.add),
        }
      : null,
    progressiveLens: order.progressiveLens
      ? {
          ...order.progressiveLens,
          sph: num(order.progressiveLens.sph),
          cyl: num(order.progressiveLens.cyl),
          add: num(order.progressiveLens.add),
          index: num(order.progressiveLens.index),
        }
      : null,
  };

  return sanitizeOrderForRole(payload, role);
}
