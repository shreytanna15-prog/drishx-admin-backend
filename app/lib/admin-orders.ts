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
  assignedTo?: OrderAssignee | null;
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

/** Catalog / color / wholesale list — excludes prescription RX orders. */
export function filterNonRxOrders(orders: AdminOrder[]) {
  return orders.filter((order) => !isRxOrder(order));
}

/** Prescription RX orders only (`[RX Order]` marker in notes). */
export function filterRxOrders(orders: AdminOrder[]) {
  return orders.filter(isRxOrder);
}

export function isColorLensOrder(order: Pick<AdminOrder, "notes">) {
  return order.notes?.includes("[Color Lens]") ?? false;
}

export function isDispatchedOrder(order: Pick<AdminOrder, "status">) {
  return order.status === "DISPATCHED";
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
