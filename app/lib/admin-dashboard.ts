import type { OrderStatus } from "@prisma/client";

export const DASHBOARD_TIMEZONE = "Asia/Kolkata";
export const LOW_STOCK_MAX = 5;

export const DASHBOARD_RANGES = ["today", "7d", "30d"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export type IstYmd = {
  year: number;
  month: number;
  day: number;
};

export type DashboardWindow = {
  range: DashboardRange;
  timezone: typeof DASHBOARD_TIMEZONE;
  rangeStart: Date;
  rangeEnd: Date;
  seriesStart: Date;
  today: IstYmd;
};

export type DashboardKpis = {
  ordersInRange: number;
  gmvInRange: number;
  openPipeline: number;
  awaitingProcurement: number;
  unpaidInvoiceAmount: number;
  openReturns: number;
};

export type DashboardPipelineItem = {
  status: OrderStatus;
  count: number;
};

export type DashboardSeriesPoint = {
  date: string;
  orders: number;
  gmv: number;
};

export type DashboardInventory = {
  unitsOnHand: number;
  skuCount: number;
  outOfStock: number;
  lowStock: number;
};

export type DashboardFinance = {
  invoicedInRange: number;
  unpaidCount: number;
  unpaidAmount: number;
  incomeInRange: number;
  procurementSpendInRange: number;
  creditNotesInRange: number;
};

export type DashboardAttention = {
  pendingGst: number;
  pendingAlternatePower: number;
  openReturns: number;
  awaitingProcurement: number;
  openProcurementRequests: number;
  criticalProcurementRequests: number;
  unpaidInvoices: number;
  dispatched: number;
  outOfStock: number;
  lowStock: number;
};

export type DashboardRecentOrder = {
  id: string;
  orderNumber: number | null;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
};

export type AdminDashboardPayload = {
  generatedAt: string;
  range: DashboardRange;
  timezone: typeof DASHBOARD_TIMEZONE;
  kpis: DashboardKpis;
  pipeline: DashboardPipelineItem[];
  series: DashboardSeriesPoint[];
  inventory: DashboardInventory;
  finance: DashboardFinance;
  attention: DashboardAttention;
  recentOrders: DashboardRecentOrder[];
  clients: number;
  employees: number;
};

export const PIPELINE_STATUS_ORDER: OrderStatus[] = [
  "PENDING",
  "PICKING",
  "PACKED",
  "DISPATCHED",
  "PARTIALLY_FULFILLED",
  "AWAITING_PROCUREMENT",
  "COMPLETED",
  "CANCELLED",
];

export const OPEN_PIPELINE_STATUSES: OrderStatus[] = [
  "PENDING",
  "PICKING",
  "PACKED",
  "PARTIALLY_FULFILLED",
];

export function parseDashboardRange(value: string | null | undefined): DashboardRange {
  if (value === "today" || value === "7d" || value === "30d") return value;
  return "7d";
}

export function getIstYmd(now: Date): IstYmd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN);

  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
  };
}

export function addCalendarDays(ymd: IstYmd, days: number): IstYmd {
  const utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** IST calendar midnight expressed as a UTC Date. */
export function istMidnightUtc(ymd: IstYmd): Date {
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day) - istOffsetMs);
}

export function formatYmd(ymd: IstYmd): string {
  const month = String(ymd.month).padStart(2, "0");
  const day = String(ymd.day).padStart(2, "0");
  return `${ymd.year}-${month}-${day}`;
}

export function getDashboardWindow(
  range: DashboardRange,
  now = new Date()
): DashboardWindow {
  const today = getIstYmd(now);
  const rangeEnd = istMidnightUtc(addCalendarDays(today, 1));
  const daysBack = range === "today" ? 0 : range === "7d" ? 6 : 29;
  const rangeStart = istMidnightUtc(addCalendarDays(today, -daysBack));
  const seriesStart = istMidnightUtc(addCalendarDays(today, -6));

  return {
    range,
    timezone: DASHBOARD_TIMEZONE,
    rangeStart,
    rangeEnd,
    seriesStart,
    today,
  };
}

export function buildSeriesDays(today: IstYmd): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    formatYmd(addCalendarDays(today, index - 6))
  );
}

export function toMoney(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toCount(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function customerLabel(user: {
  businessName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  return (
    user.businessName?.trim() ||
    user.name?.trim() ||
    user.email?.trim() ||
    "Unknown customer"
  );
}
