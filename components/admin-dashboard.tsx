"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  FlaskConical,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Warehouse,
  Wallet,
} from "lucide-react";
import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import {
  LOW_STOCK_MAX,
  type AdminDashboardPayload,
  type DashboardRange,
  parseDashboardRange,
} from "@/app/lib/admin-dashboard";
import { formatInvoiceMoney } from "@/app/lib/admin-invoices";
import {
  formatOrderStatusLabel,
  isOrderTrackingStatus,
} from "@/app/lib/order-status-transitions";
import { CardGridSkeleton } from "@/components/admin-skeletons";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { id: DashboardRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const QUICK_LINKS = [
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/orders/rx-lab", label: "Rx Orders", icon: FlaskConical },
  { href: "/orders/dispatch", label: "Dispatch", icon: Truck },
  { href: "/orders/procurement", label: "Procurement", icon: ShoppingCart },
  { href: "/returns", label: "Returns", icon: Undo2 },
  { href: "/inventory/stock-overview", label: "Stock", icon: Warehouse },
  { href: "/finance/invoices", label: "Invoices", icon: Receipt },
  { href: "/finance/expenses", label: "Expenses", icon: Wallet },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/employees", label: "Employees", icon: Package },
] as const;

function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatStatus(status: string) {
  return isOrderTrackingStatus(status)
    ? formatOrderStatusLabel(status)
    : status;
}

function formatUpdatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDayLabel(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
  }).format(date);
}

function formatOrderWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AdminDashboard() {
  const [range, setRange] = useState<DashboardRange>("7d");
  const [data, setData] = useState<AdminDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextRange: DashboardRange) => {
    setLoading(true);
    setError("");
    try {
      const payload = await adminFetch<AdminDashboardPayload>(
        `/api/admin/dashboard?range=${nextRange}`
      );
      setData(payload);
      setRange(parseDashboardRange(payload.range));
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("7d");
  }, [load]);

  const maxPipeline = Math.max(1, ...(data?.pipeline.map((row) => row.count) ?? [1]));
  const maxOrders = Math.max(1, ...(data?.series.map((row) => row.orders) ?? [1]));

  const attention = data
    ? [
        data.attention.pendingGst > 0
          ? {
              href: "/clients?tab=pending",
              label: "GST pending",
              count: data.attention.pendingGst,
            }
          : null,
        data.attention.awaitingProcurement > 0
          ? {
              href: "/orders/procurement",
              label: "Procurement",
              count: data.attention.awaitingProcurement,
            }
          : null,
        data.attention.openProcurementRequests > 0
          ? {
              href: "/procurement/requests",
              label: "Buy requests",
              count: data.attention.openProcurementRequests,
            }
          : null,
        data.attention.criticalProcurementRequests > 0
          ? {
              href: "/procurement/requests?priority=CRITICAL",
              label: "Critical shortages",
              count: data.attention.criticalProcurementRequests,
            }
          : null,
        data.attention.dispatched > 0
          ? {
              href: "/orders/dispatch",
              label: "In transit",
              count: data.attention.dispatched,
            }
          : null,
        data.attention.openReturns > 0
          ? {
              href: "/returns",
              label: "Open returns",
              count: data.attention.openReturns,
            }
          : null,
        data.attention.pendingAlternatePower > 0
          ? {
              href: "/orders/procurement",
              label: "Alt. power",
              count: data.attention.pendingAlternatePower,
            }
          : null,
        data.attention.unpaidInvoices > 0
          ? {
              href: "/finance/invoices",
              label: "Unpaid invoices",
              count: data.attention.unpaidInvoices,
            }
          : null,
        data.attention.outOfStock + data.attention.lowStock > 0
          ? {
              href: "/inventory/stock-overview",
              label: "Low / OOS stock",
              count: data.attention.outOfStock + data.attention.lowStock,
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  return (
    <div className="admin-dash">
      <div className="admin-dash-head">
        <div>
          <p className="admin-dash-eyebrow">Dashboard</p>
          <h1 className="admin-dash-title">Operations overview</h1>
          <p className="admin-dash-meta">
            Company-wide orders, stock, invoices, and exceptions
            {data
              ? ` · Updated ${formatUpdatedAt(data.generatedAt)} IST · ${formatCount(data.clients)} client${data.clients === 1 ? "" : "s"} · ${formatCount(data.employees)} staff`
              : ""}
          </p>
        </div>
        <div className="admin-dash-ranges" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn(
                "admin-dash-range",
                range === option.id && "is-active"
              )}
              disabled={loading && !data}
              onClick={() => {
                setRange(option.id);
                void load(option.id);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="auth-alert-error" role="alert">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <CardGridSkeleton />
      ) : data ? (
        <>
          <section className="admin-dash-kpis" aria-label="Key metrics">
            <article className="admin-dash-kpi">
              <p className="admin-dash-kpi-label">Orders</p>
              <p className="admin-dash-kpi-value">
                {formatCount(data.kpis.ordersInRange)}
              </p>
            </article>
            <article className="admin-dash-kpi">
              <p className="admin-dash-kpi-label">GMV</p>
              <p className="admin-dash-kpi-value">
                {formatInvoiceMoney(data.kpis.gmvInRange)}
              </p>
            </article>
            <article className="admin-dash-kpi">
              <p className="admin-dash-kpi-label">Open pipeline</p>
              <p className="admin-dash-kpi-value">
                {formatCount(data.kpis.openPipeline)}
              </p>
            </article>
            <article className="admin-dash-kpi is-accent">
              <p className="admin-dash-kpi-label">Awaiting procurement</p>
              <p className="admin-dash-kpi-value">
                {formatCount(data.kpis.awaitingProcurement)}
              </p>
            </article>
            <article className="admin-dash-kpi">
              <p className="admin-dash-kpi-label">Unpaid invoices</p>
              <p className="admin-dash-kpi-value">
                {formatInvoiceMoney(data.kpis.unpaidInvoiceAmount)}
              </p>
            </article>
            <article className="admin-dash-kpi">
              <p className="admin-dash-kpi-label">Open returns</p>
              <p className="admin-dash-kpi-value">
                {formatCount(data.kpis.openReturns)}
              </p>
            </article>
          </section>

          {attention.length > 0 ? (
            <section aria-label="Needs attention">
              <p className="admin-dash-eyebrow" style={{ marginBottom: "0.55rem" }}>
                Needs attention
              </p>
              <div className="admin-dash-attention">
                {attention.map((item) => (
                  <Link key={item.label} href={item.href} className="admin-dash-chip">
                    <AlertTriangle className="size-3.5 text-(--brand-primary)" />
                    {item.label}
                    <span className="admin-dash-chip-count">
                      {formatCount(item.count)}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="admin-dash-grid">
            <article className="admin-dash-panel">
              <h2 className="admin-dash-panel-title">Order pipeline</h2>
              <p className="admin-dash-panel-copy">
                Live status counts across all orders
              </p>
              <div className="admin-dash-pipeline">
                {data.pipeline.map((row) => (
                  <div key={row.status} className="admin-dash-pipe-row">
                    <span className="admin-dash-pipe-label">
                      {formatStatus(row.status)}
                    </span>
                    <div className="admin-dash-pipe-track" aria-hidden>
                      <div
                        className="admin-dash-pipe-fill"
                        style={{
                          width: `${Math.max(4, (row.count / maxPipeline) * 100)}%`,
                          opacity: row.count === 0 ? 0.25 : 1,
                        }}
                      />
                    </div>
                    <span className="admin-dash-pipe-count">
                      {formatCount(row.count)}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-dash-panel">
              <h2 className="admin-dash-panel-title">Last 7 days</h2>
              <p className="admin-dash-panel-copy">
                Order volume by IST day (bar height). Caption is GMV.
              </p>
              <div className="admin-dash-bars">
                {data.series.map((point) => (
                  <div
                    key={point.date}
                    className="admin-dash-bar-col"
                    title={`${point.date}: ${point.orders} orders, ${formatInvoiceMoney(point.gmv)}`}
                  >
                    <span className="admin-dash-bar-value">
                      {formatCount(point.orders)}
                    </span>
                    <div
                      className="admin-dash-bar"
                      style={{
                        height: `${Math.max(8, (point.orders / maxOrders) * 100)}%`,
                        opacity: point.orders === 0 ? 0.28 : 1,
                      }}
                    />
                    <span className="admin-dash-bar-label">
                      {formatDayLabel(point.date)}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="admin-dash-grid">
            <article className="admin-dash-panel">
              <h2 className="admin-dash-panel-title">Inventory health</h2>
              <p className="admin-dash-panel-copy">
                Single vision, kryptok, and progressive SKUs. Low stock is
                {` 1–${LOW_STOCK_MAX} `}
                pairs.
              </p>
              <div className="admin-dash-stats">
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Units on hand</p>
                  <p className="admin-dash-stat-value">
                    {formatCount(data.inventory.unitsOnHand)}
                  </p>
                </div>
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">SKU count</p>
                  <p className="admin-dash-stat-value">
                    {formatCount(data.inventory.skuCount)}
                  </p>
                </div>
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Out of stock</p>
                  <p className="admin-dash-stat-value">
                    {formatCount(data.inventory.outOfStock)}
                  </p>
                </div>
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Low stock</p>
                  <p className="admin-dash-stat-value">
                    {formatCount(data.inventory.lowStock)}
                  </p>
                </div>
              </div>
            </article>

            <article className="admin-dash-panel">
              <h2 className="admin-dash-panel-title">Finance snapshot</h2>
              <p className="admin-dash-panel-copy">
                Invoiced and cash-book figures for the selected range. Unpaid is
                current, not range-bound.
              </p>
              <div className="admin-dash-stats">
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Invoiced</p>
                  <p className="admin-dash-stat-value">
                    {formatInvoiceMoney(data.finance.invoicedInRange)}
                  </p>
                </div>
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Income recorded</p>
                  <p className="admin-dash-stat-value">
                    {formatInvoiceMoney(data.finance.incomeInRange)}
                  </p>
                </div>
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Procurement spend</p>
                  <p className="admin-dash-stat-value">
                    {formatInvoiceMoney(data.finance.procurementSpendInRange)}
                  </p>
                </div>
                <div className="admin-dash-stat">
                  <p className="admin-dash-stat-label">Credit notes</p>
                  <p className="admin-dash-stat-value">
                    {formatInvoiceMoney(data.finance.creditNotesInRange)}
                  </p>
                </div>
              </div>
            </article>
          </section>

          <AdminTable
            toolbar={
              <div className="w-full">
                <h2 className="admin-dash-panel-title">Recent orders</h2>
                <p className="admin-dash-panel-copy">Latest eight across the company</p>
              </div>
            }
          >
            {data.recentOrders.length === 0 ? (
              <p className="admin-dash-empty">No orders yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-extrabold text-(--brand-primary) hover:underline"
                        >
                          {order.orderNumber != null
                            ? `#${order.orderNumber}`
                            : order.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-(--brand-text)">
                        {order.customerName}
                      </TableCell>
                      <TableCell className="text-(--brand-text-muted)">
                        {formatStatus(order.status)}
                      </TableCell>
                      <TableCell className="font-semibold text-(--brand-text)">
                        {formatInvoiceMoney(order.totalAmount)}
                      </TableCell>
                      <TableCell className="text-(--brand-text-muted)">
                        {formatOrderWhen(order.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AdminTable>

          <section>
            <p className="admin-dash-eyebrow" style={{ marginBottom: "0.55rem" }}>
              Quick links
            </p>
            <div className="admin-dash-links">
              {QUICK_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className="admin-dash-link">
                  <item.icon className="size-3.5 text-(--brand-primary)" />
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
