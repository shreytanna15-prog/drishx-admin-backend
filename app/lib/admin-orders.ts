import { adminFetch } from "@/app/lib/admin-api";
import type { Paginated } from "@/app/lib/types/api-client";

export type OrderCustomer = {
  id: string;
  name: string | null;
  email: string;
  businessName: string | null;
  role?: string;
};

export type OrderAssignee = {
  id: string;
  name: string | null;
  email: string;
  role?: string;
};

export type AdminWholesaleLineItem = {
  id: string;
  powerKey: string;
  quantity: number;
  reservedQuantity?: number;
  unitPrice?: number | string;
  totalAmount?: number | string;
  sph: number | string;
  cyl?: number | string | null;
  axis?: number | null;
  add?: number | string | null;
  needsProcurement?: boolean;
};

export type AdminOrderLens = {
  id?: string;
  brand?: string | null;
  category?: string | null;
  item?: string | null;
  coating?: string | null;
  index?: number | string | null;
  quantity?: number | null;
  sph?: number | string | null;
  cyl?: number | string | null;
  crossPower?: number | string | null;
  axis?: number | null;
  add?: number | string | null;
  eye?: string | null;
};

export type AdminOrder = {
  id: string;
  orderNumber: number | null;
  checkoutBatchId?: string | null;
  lensType: string;
  lineType: string;
  quantity: number;
  reservedQuantity?: number;
  pickedQuantity?: number;
  unitPrice: number | string;
  totalAmount: number | string;
  status: string;
  sph?: number | null;
  cyl?: number | null;
  axis?: number | null;
  add?: number | null;
  eye?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  cancelReason?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  dispatchDate?: string | null;
  cutoffDeferred?: boolean;
  dispatchOverridden?: boolean;
  /** List summary: true when a prescription image exists (URL only on detail). */
  hasOrderImage?: boolean;
  deliveryServiceId?: string | null;
  deliveryService?: {
    id: string;
    courierCompany: string;
    serviceName: string;
    serviceType: string;
    customerRate: number | string;
    etaText?: string | null;
  } | null;
  delivery?: {
    actualWeight: number | string;
    chargeableWeight: number | string;
    customerCharge: number | string;
    internalCost?: number | string;
    margin?: number | string;
    packages?: Array<{ no?: number; weight: number }> | null;
    weightEnteredBy?: string | null;
    weightEnteredAt?: string | null;
  } | null;
  orderImageUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  assignedToId?: string | null;
  assignedAt?: string | null;
  warehouseHold?: boolean;
  warehouseReleasedAt?: string | null;
  warehouseReleasedById?: string | null;
  assignedTo?: OrderAssignee | null;
  /** RW-10: placement channel; null on legacy rows. */
  orderSource?: "CUSTOMER_APP" | "EMPLOYEE_ON_BEHALF" | "ADMIN_PANEL" | null;
  placedByUserId?: string | null;
  placedBy?: OrderAssignee | null;
  user: OrderCustomer;
  invoice?: {
    id: string;
    invoiceNumber: string;
    amount: number | string;
    status: string;
    issuedAt?: string;
  } | null;
  wholesaleLineItems?: AdminWholesaleLineItem[];
  singleVisionLens?: AdminOrderLens | null;
  kryptokLens?: AdminOrderLens | null;
  progressiveLens?: AdminOrderLens | null;
  returnRequests?: Array<{
    id: string;
    requestNumber: string;
    status: string;
    requestType: string;
    createdAt: string;
  }>;
  activityLogs?: Array<{
    id: string;
    action: string;
    message: string;
    createdAt: string;
    actor?: { id: string; name: string | null; email: string; role?: string } | null;
  }>;
  powerVersions?: AdminPowerVersion[];
  alternateSuggestions?: AdminAlternateSuggestion[];
};

export type AdminPowerVersion = {
  id: string;
  orderId: string;
  versionNumber: number;
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  lensType: string;
  lensId: string | null;
  source: string;
  status: string;
  reservedQuantity: number;
  pickedQuantity: number;
  isFinalFulfilled: boolean;
  acceptedAt?: string | null;
  supersededAt?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type AdminAlternateSuggestion = {
  id: string;
  orderId: string;
  forVersionId: string;
  sph: number;
  cyl: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  lensType: string;
  lensId: string;
  availability: "WAREHOUSE" | "SUPPLIER" | "OUT_OF_STOCK" | string;
  etaDays: number | null;
  distanceScore: number;
  status: string;
  createdAt: string;
};

export const ORDER_STATUS_FILTERS = [
  "PENDING",
  "PICKING",
  "PACKED",
  "DISPATCHED",
  "PARTIALLY_FULFILLED",
  "AWAITING_PROCUREMENT",
  "COMPLETED",
  "CANCELLED",
] as const;

export function getStaffStatusOptions(current: string): string[] {
  switch (current) {
    case "PENDING":
      return ["PICKING", "CANCELLED"];
    case "PICKING":
      return ["PACKED", "CANCELLED"];
    case "PACKED":
      return ["DISPATCHED", "CANCELLED"];
    case "DISPATCHED":
      return [
        "PARTIALLY_FULFILLED",
        "AWAITING_PROCUREMENT",
        "COMPLETED",
        "CANCELLED",
      ];
    case "PARTIALLY_FULFILLED":
      return ["AWAITING_PROCUREMENT", "COMPLETED", "CANCELLED"];
    case "AWAITING_PROCUREMENT":
      return ["PARTIALLY_FULFILLED", "PICKING", "PENDING", "COMPLETED", "CANCELLED"];
    case "COMPLETED":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

/**
 * Admin detail status select: current status first, then legal next transitions.
 * Does not change transition rules — only presentation / default selection safety.
 */
export function buildAdminStatusSelectOptions(current: string): string[] {
  const status = current.trim().toUpperCase();
  if (!status) return [];
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of [status, ...getStaffStatusOptions(status)]) {
    if (seen.has(value)) continue;
    seen.add(value);
    options.push(value);
  }
  return options;
}

/** True when the select value is a real change (not the current status). */
export function isAdminStatusChangeSelected(
  current: string,
  selected: string
): boolean {
  const from = current.trim().toUpperCase();
  const to = selected.trim().toUpperCase();
  return Boolean(from && to && from !== to);
}

export function isEditableOrderStatus(status: string) {
  return status === "PENDING" || status === "AWAITING_PROCUREMENT";
}

export function matchesOrderFilters(
  order: AdminOrder,
  filters: {
    status?: string;
    lineType?: string;
    assigneeId?: string;
    orderKind?: string;
    dateFrom?: string;
    dateTo?: string;
  }
) {
  if (filters.status && order.status !== filters.status) return false;
  if (filters.lineType && order.lineType !== filters.lineType) return false;
  if (filters.assigneeId) {
    if (filters.assigneeId === "__unassigned__") {
      if (order.assignedToId) return false;
    } else if (order.assignedToId !== filters.assigneeId) {
      return false;
    }
  }
  if (filters.orderKind === "RX" && !isRxOrder(order)) return false;
  if (filters.orderKind === "COLOR" && !isColorLensOrder(order)) return false;
  if (filters.orderKind === "RETAIL" && (order.lineType !== "RETAIL" || isRxOrder(order) || isColorLensOrder(order))) {
    return false;
  }
  if (filters.orderKind === "WHOLESALE" && order.lineType !== "WHOLESALE") return false;
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom);
    if (!Number.isNaN(from.getTime()) && new Date(order.createdAt) < from) return false;
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      if (new Date(order.createdAt) > to) return false;
    }
  }
  return true;
}

/** Shared list filters for `/orders` table and `/orders/overview` card view. */
export type OrdersListFilters = {
  q: string;
  status: string;
  lineType: string;
  orderKind: string;
  assigneeId: string;
  dateFrom: string;
  dateTo: string;
};

export const ORDERS_LIST_FILTER_KEYS = [
  "q",
  "status",
  "lineType",
  "orderKind",
  "assigneeId",
  "dateFrom",
  "dateTo",
] as const;

export const EMPTY_ORDERS_LIST_FILTERS: OrdersListFilters = {
  q: "",
  status: "",
  lineType: "",
  orderKind: "",
  assigneeId: "",
  dateFrom: "",
  dateTo: "",
};

export function parseOrdersListFilters(
  searchParams: Pick<URLSearchParams, "get">
): OrdersListFilters {
  return {
    q: searchParams.get("q")?.trim() ?? "",
    status: searchParams.get("status")?.trim() ?? "",
    lineType: searchParams.get("lineType")?.trim() ?? "",
    orderKind: searchParams.get("orderKind")?.trim() ?? "",
    assigneeId: searchParams.get("assigneeId")?.trim() ?? "",
    dateFrom: searchParams.get("dateFrom")?.trim() ?? "",
    dateTo: searchParams.get("dateTo")?.trim() ?? "",
  };
}

/** Write shared filter keys onto a copy of `base`, clearing empty values. */
export function applyOrdersListFiltersToSearchParams(
  base: URLSearchParams,
  filters: OrdersListFilters
): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  for (const key of ORDERS_LIST_FILTER_KEYS) {
    next.delete(key);
  }
  if (filters.q.trim()) next.set("q", filters.q.trim());
  if (filters.status.trim()) next.set("status", filters.status.trim());
  if (filters.lineType.trim()) next.set("lineType", filters.lineType.trim());
  if (filters.orderKind.trim()) next.set("orderKind", filters.orderKind.trim());
  if (filters.assigneeId.trim()) next.set("assigneeId", filters.assigneeId.trim());
  if (filters.dateFrom.trim()) next.set("dateFrom", filters.dateFrom.trim());
  if (filters.dateTo.trim()) next.set("dateTo", filters.dateTo.trim());
  return next;
}

export function buildOrdersListHref(
  path: string,
  filters: OrdersListFilters,
  extra?: URLSearchParams | Record<string, string | undefined | null>
): string {
  const base =
    extra instanceof URLSearchParams
      ? new URLSearchParams(extra.toString())
      : new URLSearchParams();
  if (extra && !(extra instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(extra)) {
      if (value != null && String(value).trim()) {
        base.set(key, String(value).trim());
      }
    }
  }
  // Drop overview-only params when linking to table (and vice versa callers omit them).
  for (const key of ["group", "groupSort", "lineSort"] as const) {
    if (path === "/orders") base.delete(key);
  }
  const params = applyOrdersListFiltersToSearchParams(base, filters);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Query key carrying the originating orders list URL on detail pages. */
export const ORDERS_RETURN_TO_PARAM = "returnTo";

/**
 * Allow only same-app `/orders…` relative paths (list/overview/queues).
 * Rejects absolute URLs, protocol-relative paths, and `..` segments.
 */
export function sanitizeOrdersReturnTo(
  raw: string | null | undefined
): string {
  if (!raw?.trim()) return "/orders";
  const value = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "/orders";
  if (value.startsWith("//") || value.includes("\\")) return "/orders";
  if (!value.startsWith("/orders")) return "/orders";

  const qIndex = value.indexOf("?");
  const path = qIndex >= 0 ? value.slice(0, qIndex) : value;
  const query = qIndex >= 0 ? value.slice(qIndex) : "";
  if (path.includes("..")) return "/orders";
  if (path !== "/orders" && !path.startsWith("/orders/")) return "/orders";
  return `${path}${query}`;
}

/** Snapshot the current list location for a later “Back to orders” link. */
export function buildOrdersReturnTo(
  pathname: string,
  search: string | Pick<URLSearchParams, "toString">
): string {
  const path = pathname.startsWith("/orders") ? pathname : "/orders";
  const qs =
    typeof search === "string"
      ? search.replace(/^\?/, "").trim()
      : search.toString().trim();
  return sanitizeOrdersReturnTo(qs ? `${path}?${qs}` : path);
}

/** Detail href that preserves the originating list filters via `returnTo`. */
export function buildOrderDetailHref(
  orderId: string,
  options?: { returnTo?: string | null; hash?: string | null }
): string {
  const id = orderId.trim();
  const params = new URLSearchParams();
  if (options?.returnTo?.trim()) {
    params.set(
      ORDERS_RETURN_TO_PARAM,
      sanitizeOrdersReturnTo(options.returnTo)
    );
  }
  const qs = params.toString();
  let href = qs ? `/orders/${id}?${qs}` : `/orders/${id}`;
  const hash = options?.hash?.trim().replace(/^#/, "");
  if (hash) href += `#${hash}`;
  return href;
}

/** Resolve “Back to orders” from a detail page’s search params. */
export function resolveOrdersBackHref(
  searchParams: Pick<URLSearchParams, "get">
): string {
  return sanitizeOrdersReturnTo(searchParams.get(ORDERS_RETURN_TO_PARAM));
}

export function formatOrderDisplayId(
  order: Pick<AdminOrder, "id" | "orderNumber">
) {
  if (order.orderNumber != null) return `#${order.orderNumber}`;
  return `#${order.id.slice(0, 8).toUpperCase()}`;
}

export function getOrderCatalogLens(order: AdminOrder): AdminOrderLens | null {
  return (
    order.progressiveLens ??
    order.kryptokLens ??
    order.singleVisionLens ??
    null
  );
}

export function formatCatalogSummary(order: AdminOrder) {
  const lens = getOrderCatalogLens(order);
  if (!lens) return formatLensType(order.lensType);
  const parts = [lens.brand, lens.coating, lens.item]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : formatLensType(order.lensType);
}

export function isRxOrder(order: Pick<AdminOrder, "notes">) {
  return order.notes?.includes("[RX Order]") ?? false;
}

export function isColorLensOrder(order: Pick<AdminOrder, "notes">) {
  return order.notes?.includes("[Color Lens]") ?? false;
}

/** Photo prescription (image present, not RX form / color). */
export function isPhotoPrescriptionOrder(
  order: Pick<AdminOrder, "notes" | "orderImageUrl" | "hasOrderImage">
) {
  const hasImage = Boolean(order.hasOrderImage || order.orderImageUrl);
  if (!hasImage) return false;
  if (isRxOrder(order) || isColorLensOrder(order)) return false;
  return true;
}

/** RX form or photo prescription — subject to admin hold → warehouse release. */
export function isPrescriptionLabOrder(
  order: Pick<
    AdminOrder,
    "notes" | "orderImageUrl" | "hasOrderImage" | "warehouseHold"
  >
) {
  if (order.warehouseHold) return true;
  return isRxOrder(order) || isPhotoPrescriptionOrder(order);
}

export function isAdminHeldWarehouseOrder(
  order: Pick<AdminOrder, "warehouseHold" | "warehouseReleasedAt">
) {
  return Boolean(order.warehouseHold) && !order.warehouseReleasedAt;
}

/** Catalog / color / wholesale list — excludes prescription RX/photo lab orders. */
export function filterNonRxOrders(orders: AdminOrder[]) {
  return orders.filter((order) => !isPrescriptionLabOrder(order));
}

/** Prescription RX + photo orders for the Rx Lab screen. */
export function filterRxOrders(orders: AdminOrder[]) {
  return orders.filter(isPrescriptionLabOrder);
}

export function isDispatchedOrder(order: Pick<AdminOrder, "status">) {
  return order.status === "DISPATCHED";
}

/** Held behind the dispatch cutoff right now (not yet overridden by an admin). */
export function isDeferredOrder(
  order: Pick<AdminOrder, "status" | "dispatchDate" | "cutoffDeferred" | "dispatchOverridden">
): boolean {
  if (order.dispatchOverridden) return false;
  if (!order.cutoffDeferred || !order.dispatchDate) return false;
  const dispatchDate = new Date(order.dispatchDate);
  if (Number.isNaN(dispatchDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dispatchDate.getTime() > today.getTime();
}

export function formatMoney(value: number | string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatLensType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case "COMPLETED":
      return "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)";
    case "CANCELLED":
      return "border-(--brand-danger-border) bg-(--brand-danger-bg) text-(--brand-danger)";
    case "DISPATCHED":
    case "PACKED":
      return "border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] text-(--brand-primary)";
    case "AWAITING_PROCUREMENT":
      return "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.12)] text-[#60a5fa]";
    default:
      return "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted)";
  }
}

export function formatPrescription(order: AdminOrder) {
  const parts: string[] = [];
  if (order.sph != null) parts.push(`SPH ${order.sph}`);
  if (order.cyl != null) parts.push(`CYL ${order.cyl}`);
  if (order.axis != null) parts.push(`AXIS ${order.axis}`);
  if (order.add != null) parts.push(`ADD ${order.add}`);
  if (order.eye) parts.push(order.eye);
  return parts.length ? parts.join(" · ") : "—";
}

export function formatWholesaleLinePower(line: AdminWholesaleLineItem) {
  const parts: string[] = [];
  if (line.sph != null && line.sph !== "") parts.push(`SPH ${line.sph}`);
  if (line.cyl != null && line.cyl !== "") parts.push(`CYL ${line.cyl}`);
  if (line.axis != null) parts.push(`AXIS ${line.axis}`);
  if (line.add != null && line.add !== "") parts.push(`ADD ${line.add}`);
  return parts.length ? parts.join(" · ") : line.powerKey || "—";
}

export function matchesOrderSearch(order: AdminOrder, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const customerName = order.user?.name?.toLowerCase() ?? "";
  const customerEmail = order.user?.email?.toLowerCase() ?? "";
  const business = order.user?.businessName?.toLowerCase() ?? "";
  const orderNo = order.orderNumber != null ? String(order.orderNumber) : "";
  const status = order.status.toLowerCase();
  const lens = order.lensType.toLowerCase();
  const notes = order.notes?.toLowerCase() ?? "";

  return (
    customerName.includes(q) ||
    customerEmail.includes(q) ||
    business.includes(q) ||
    orderNo.includes(q) ||
    status.includes(q) ||
    lens.includes(q) ||
    notes.includes(q) ||
    order.id.toLowerCase().includes(q)
  );
}

/** Calendar day key from order timestamp (runtime clock; no forced timezone). */
export function orderCreatedDayKey(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "unknown";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatOrderDayLabel(dayKey: string): string {
  if (dayKey === "unknown") return "Unknown date";
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function customerGroupLabel(order: AdminOrder): string {
  const business = order.user?.businessName?.trim();
  if (business) return business;
  const name = order.user?.name?.trim();
  if (name) return name;
  return order.user?.email?.trim() || "Unknown customer";
}

export function orderAmountNumber(order: AdminOrder): number {
  const n = Number(order.totalAmount);
  return Number.isFinite(n) ? n : 0;
}

export type OrderStatusBreakdown = { status: string; count: number };

export type AdminOrderGroup = {
  key: string;
  label: string;
  subtitle?: string;
  orders: AdminOrder[];
  count: number;
  totalAmount: number;
  statusBreakdown: OrderStatusBreakdown[];
  latestCreatedAt: string;
};

function buildStatusBreakdown(orders: AdminOrder[]): OrderStatusBreakdown[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

function finalizeGroup(
  key: string,
  label: string,
  orders: AdminOrder[],
  subtitle?: string
): AdminOrderGroup {
  const sortedLines = [...orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    key,
    label,
    subtitle,
    orders: sortedLines,
    count: sortedLines.length,
    totalAmount: sortedLines.reduce((sum, o) => sum + orderAmountNumber(o), 0),
    statusBreakdown: buildStatusBreakdown(sortedLines),
    latestCreatedAt: sortedLines[0]?.createdAt ?? "",
  };
}

export function groupOrdersByDate(orders: AdminOrder[]): AdminOrderGroup[] {
  const map = new Map<string, AdminOrder[]>();
  for (const order of orders) {
    const key = orderCreatedDayKey(order.createdAt);
    const list = map.get(key);
    if (list) list.push(order);
    else map.set(key, [order]);
  }
  return [...map.entries()]
    .map(([key, list]) => finalizeGroup(key, formatOrderDayLabel(key), list))
    .sort((a, b) => b.key.localeCompare(a.key));
}

export function groupOrdersByCustomer(orders: AdminOrder[]): AdminOrderGroup[] {
  const map = new Map<string, AdminOrder[]>();
  for (const order of orders) {
    const key = order.user?.id || "unknown";
    const list = map.get(key);
    if (list) list.push(order);
    else map.set(key, [order]);
  }
  return [...map.entries()].map(([key, list]) => {
    const sample = list[0];
    const label = sample ? customerGroupLabel(sample) : "Unknown customer";
    const email = sample?.user?.email?.trim();
    const name = sample?.user?.name?.trim();
    const business = sample?.user?.businessName?.trim();
    let subtitle: string | undefined;
    if (business && label === business && email) subtitle = email;
    else if (name && label === name && email && email !== name) subtitle = email;
    else if (email && label !== email) subtitle = email;
    return finalizeGroup(key, label, list, subtitle);
  });
}

export type OrderGroupSort =
  | "newest"
  | "oldest"
  | "amount_desc"
  | "amount_asc"
  | "count_desc"
  | "count_asc"
  | "label_asc"
  | "label_desc";

export const ORDER_GROUP_SORT_OPTIONS: {
  id: OrderGroupSort;
  label: string;
}[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "amount_desc", label: "Amount: high → low" },
  { id: "amount_asc", label: "Amount: low → high" },
  { id: "count_desc", label: "Most orders" },
  { id: "count_asc", label: "Fewest orders" },
  { id: "label_asc", label: "Name A → Z" },
  { id: "label_desc", label: "Name Z → A" },
];

export function sortOrderGroups(
  groups: AdminOrderGroup[],
  sort: OrderGroupSort
): AdminOrderGroup[] {
  const copy = [...groups];
  const byLatest = (a: AdminOrderGroup, b: AdminOrderGroup) =>
    new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
  const byOldest = (a: AdminOrderGroup, b: AdminOrderGroup) =>
    new Date(a.latestCreatedAt).getTime() - new Date(b.latestCreatedAt).getTime();

  switch (sort) {
    case "oldest":
      return copy.sort(byOldest);
    case "amount_desc":
      return copy.sort(
        (a, b) => b.totalAmount - a.totalAmount || byLatest(a, b)
      );
    case "amount_asc":
      return copy.sort(
        (a, b) => a.totalAmount - b.totalAmount || byLatest(a, b)
      );
    case "count_desc":
      return copy.sort((a, b) => b.count - a.count || byLatest(a, b));
    case "count_asc":
      return copy.sort((a, b) => a.count - b.count || byLatest(a, b));
    case "label_asc":
      return copy.sort(
        (a, b) => a.label.localeCompare(b.label) || byLatest(a, b)
      );
    case "label_desc":
      return copy.sort(
        (a, b) => b.label.localeCompare(a.label) || byLatest(a, b)
      );
    case "newest":
    default:
      return copy.sort(byLatest);
  }
}

export type OrderLineSort = "newest" | "oldest" | "amount_desc" | "amount_asc";

export const ORDER_LINE_SORT_OPTIONS: { id: OrderLineSort; label: string }[] = [
  { id: "newest", label: "Lines: newest first" },
  { id: "oldest", label: "Lines: oldest first" },
  { id: "amount_desc", label: "Lines: amount high → low" },
  { id: "amount_asc", label: "Lines: amount low → high" },
];

export function sortOrdersInGroup(
  orders: AdminOrder[],
  sort: OrderLineSort
): AdminOrder[] {
  const copy = [...orders];
  switch (sort) {
    case "oldest":
      return copy.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    case "amount_desc":
      return copy.sort(
        (a, b) =>
          orderAmountNumber(b) - orderAmountNumber(a) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "amount_asc":
      return copy.sort(
        (a, b) =>
          orderAmountNumber(a) - orderAmountNumber(b) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "newest":
    default:
      return copy.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }
}

/** Query params for paginated admin orders list (RW-11 Phase B). */
export type ListAdminOrdersParams = {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
  employeeId?: string;
  userId?: string;
  batchId?: string;
  lineType?: string;
  orderKind?: string;
  /** catalog = non-RX/photo; rx_lab = prescription lab; all = no scope filter */
  scope?: "all" | "catalog" | "rx_lab";
  assigneeId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type PaginatedAdminOrders = Paginated<AdminOrder>;

export function buildOrdersQueryString(params?: ListAdminOrdersParams): string {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.status?.trim()) qs.set("status", params.status.trim());
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.employeeId?.trim()) qs.set("employeeId", params.employeeId.trim());
  if (params.userId?.trim()) qs.set("userId", params.userId.trim());
  if (params.batchId?.trim()) qs.set("batchId", params.batchId.trim());
  if (params.lineType?.trim()) qs.set("lineType", params.lineType.trim());
  if (params.orderKind?.trim()) qs.set("orderKind", params.orderKind.trim());
  if (params.scope && params.scope !== "all") qs.set("scope", params.scope);
  if (params.assigneeId?.trim()) qs.set("assigneeId", params.assigneeId.trim());
  if (params.dateFrom?.trim()) qs.set("dateFrom", params.dateFrom.trim());
  if (params.dateTo?.trim()) qs.set("dateTo", params.dateTo.trim());
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Normalize list API payload (paginated envelope; legacy bare array tolerated). */
export function normalizeOrdersListResponse(
  data: unknown
): PaginatedAdminOrders {
  if (Array.isArray(data)) {
    return {
      items: data as AdminOrder[],
      page: 1,
      limit: data.length,
      hasMore: false,
      total: data.length,
    };
  }
  const body = data as Partial<PaginatedAdminOrders> | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    page: typeof body?.page === "number" ? body.page : 1,
    limit: typeof body?.limit === "number" ? body.limit : items.length,
    hasMore: Boolean(body?.hasMore),
    total: typeof body?.total === "number" ? body.total : undefined,
  };
}

export async function listAdminOrders(
  params?: ListAdminOrdersParams
): Promise<PaginatedAdminOrders> {
  const data = await adminFetch<unknown>(
    `/api/orders${buildOrdersQueryString(params)}`
  );
  return normalizeOrdersListResponse(data);
}
