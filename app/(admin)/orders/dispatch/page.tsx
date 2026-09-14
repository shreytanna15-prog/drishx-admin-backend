"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminOrder,
  formatDate,
  formatMoney,
  formatOrderDisplayId,
  formatStatus,
  isDispatchedOrder,
  statusBadgeClass,
} from "@/app/lib/admin-orders";
import { cn } from "@/lib/utils";

type PendingOrder = AdminOrder;

type DispatchStats = {
  days: number;
  stats: Array<{
    courierCompany: string;
    orders: number;
    totalCustomerCharge: number;
    totalInternalCost: number;
    margin: number;
  }>;
  totals: {
    orders: number;
    totalCustomerCharge: number;
    totalInternalCost: number;
    margin: number;
  };
};

const inputClass =
  "h-10 w-full rounded-lg border border-(--brand-card-border) bg-transparent px-3 text-sm text-(--brand-text) placeholder:text-(--brand-placeholder)";
const labelClass = "mb-1 block text-xs font-semibold text-(--brand-label)";

function ageInPacked(updatedAt?: string): string {
  if (!updatedAt) return "—";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000)
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function DispatchPage() {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [dispatched, setDispatched] = useState<AdminOrder[]>([]);
  const [stats, setStats] = useState<DispatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispatchedLoading, setDispatchedLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, { courierName: string; trackingNumber: string }>>(
    {}
  );

  // ── Data loaders (no sync setState — safe to call from effects) ──────
  const loadPending = useCallback(async () => {
    try {
      const data = await adminFetch<{ orders: PendingOrder[] }>(
        "/api/dispatch/pending"
      );
      setPending(Array.isArray(data.orders) ? data.orders : []);
      setError("");
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load pending dispatches."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await adminFetch<DispatchStats>(
        "/api/dispatch/stats?days=30"
      );
      setStats(data);
    } catch {
      setStats(null);
    }
  }, []);

  const loadDispatched = useCallback(async () => {
    try {
      const data = await adminFetch<AdminOrder[]>("/api/orders");
      const list = (Array.isArray(data) ? data : [])
        .filter(isDispatchedOrder)
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt).getTime() -
            new Date(a.updatedAt ?? a.createdAt).getTime()
        )
        .slice(0, 20);
      setDispatched(list);
    } catch {
      setDispatched([]);
    } finally {
      setDispatchedLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPending(), loadStats(), loadDispatched()]);
  }, [loadPending, loadStats, loadDispatched]);

  useEffect(() => {
    // Defer initial load so setState calls land outside the effect body.
    const timer = window.setTimeout(() => void refreshAll(), 0);
    const interval = window.setInterval(() => {
      void loadPending();
    }, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refreshAll, loadPending]);

  const toggleExpand = (id: string) =>
    setExpanded((s) => ({ ...s, [id]: !s[id] }));

  async function handleDispatch(order: PendingOrder) {
    const draft = drafts[order.id] ?? {
      courierName: order.courierName ?? "",
      trackingNumber: order.trackingNumber ?? "",
    };
    const courierName = draft.courierName.trim();
    const trackingNumber = draft.trackingNumber.trim();
    if (!courierName || !trackingNumber) {
      setError("Enter both courier name and tracking number to dispatch.");
      return;
    }
    setBusyId(order.id);
    setError("");
    try {
      await adminFetch(`/api/orders/${order.id}/dispatch`, {
        method: "POST",
        body: JSON.stringify({ courierName, trackingNumber }),
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Dispatch failed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AdminPage
      title="Dispatch Management"
      subtitle="Hand packed orders to couriers and track the shipped workload"
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-label)">
            Awaiting dispatch
          </div>
          <div className="mt-1 text-2xl font-extrabold text-(--brand-primary)">
            {loading ? "…" : pending.length}
          </div>
          <div className="mt-1 text-xs text-(--brand-text-muted)">
            Packed orders with no courier + tracking yet
          </div>
        </div>
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-label)">
            Dispatched · 30 days
          </div>
          <div className="mt-1 text-2xl font-extrabold text-(--brand-text)">
            {stats ? stats.totals.orders : "…"}
          </div>
          <div className="mt-1 text-xs text-(--brand-text-muted)">
            {stats
              ? `${formatMoney(stats.totals.totalCustomerCharge)} charged`
              : "Loading…"}
          </div>
        </div>
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-(--brand-label)">
            Delivery margin · 30 days
          </div>
          <div className="mt-1 text-2xl font-extrabold text-(--brand-success)">
            {stats ? formatMoney(stats.totals.margin) : "…"}
          </div>
          <div className="mt-1 text-xs text-(--brand-text-muted)">
            {stats
              ? `${formatMoney(stats.totals.totalInternalCost)} cost`
              : "Loading…"}
          </div>
        </div>
      </div>

      {stats && stats.stats.length > 0 ? (
        <div className="mb-6 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
            Per courier · last {stats.days} days
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.stats.map((s) => (
              <div
                key={s.courierCompany}
                className="rounded-xl border border-(--brand-card-border) bg-(--brand-muted-bg,transparent) px-3 py-2 text-sm"
              >
                <div className="font-bold text-(--brand-text)">{s.courierCompany}</div>
                <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                  {s.orders} order{s.orders === 1 ? "" : "s"} ·{" "}
                  {formatMoney(s.totalCustomerCharge)} charged ·{" "}
                  {formatMoney(s.totalInternalCost)} cost
                </div>
                <div className="mt-0.5 text-xs font-bold text-(--brand-success)">
                  Margin {formatMoney(s.margin)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-extrabold text-(--brand-text)">
          Ready to hand over to courier
        </h2>
        {loading ? (
          <TableSkeleton compact columns={6} rows={6} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <Table>
              <TableHeader>
                <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                  <TableHead className="text-(--brand-label)">Order</TableHead>
                  <TableHead className="text-(--brand-label)">Customer</TableHead>
                  <TableHead className="text-(--brand-label)">Service</TableHead>
                  <TableHead className="text-(--brand-label)">Weight / Charge</TableHead>
                  <TableHead className="text-(--brand-label)">Packed age</TableHead>
                  <TableHead className="text-(--brand-label)">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-(--brand-text-muted)"
                    >
                      No orders await dispatch right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((order) => {
                    const draft = drafts[order.id] ?? {
                      courierName: order.courierName ?? "",
                      trackingNumber: order.trackingNumber ?? "",
                    };
                    const open = Boolean(expanded[order.id]);
                    return (
                      <PendingRow
                        key={order.id}
                        order={order}
                        open={open}
                        draft={draft}
                        busy={busyId === order.id}
                        onToggle={() => toggleExpand(order.id)}
                        onDraft={(courierName, trackingNumber) =>
                          setDrafts((s) => ({
                            ...s,
                            [order.id]: { courierName, trackingNumber },
                          }))
                        }
                        onDispatch={() => void handleDispatch(order)}
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-extrabold text-(--brand-text)">
          Recently dispatched
        </h2>
        {dispatchedLoading ? (
          <TableSkeleton compact columns={6} rows={5} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <Table>
              <TableHeader>
                <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                  <TableHead className="text-(--brand-label)">Order</TableHead>
                  <TableHead className="text-(--brand-label)">Customer</TableHead>
                  <TableHead className="text-(--brand-label)">Courier</TableHead>
                  <TableHead className="text-(--brand-label)">Tracking</TableHead>
                  <TableHead className="text-(--brand-label)">Charge</TableHead>
                  <TableHead className="text-(--brand-label)">Dispatched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatched.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-(--brand-text-muted)"
                    >
                      No dispatched orders yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  dispatched.map((order) => (
                    <TableRow
                      key={order.id}
                      className="border-(--brand-card-border)"
                    >
                      <TableCell className="align-top">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-semibold text-(--brand-link) hover:underline"
                        >
                          {formatOrderDisplayId(order)}
                        </Link>
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          <Badge
                            variant="outline"
                            className={cn(
                              "mt-1 rounded-lg font-bold",
                              statusBadgeClass(order.status)
                            )}
                          >
                            {formatStatus(order.status)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-(--brand-text)">
                          {order.user?.name?.trim() || "Unnamed customer"}
                        </div>
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          {order.user?.email}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-(--brand-text)">
                        {order.courierName || "—"}
                      </TableCell>
                      <TableCell className="align-top font-mono text-sm text-(--brand-text)">
                        {order.trackingNumber || "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-(--brand-text)">
                          {order.delivery?.customerCharge != null
                            ? formatMoney(order.delivery.customerCharge)
                            : "—"}
                        </div>
                        {order.deliveryService?.serviceName ? (
                          <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                            {order.deliveryService.serviceName}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap text-sm text-(--brand-text-muted)">
                        {formatDate(order.updatedAt ?? order.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AdminPage>
  );
}

function PendingRow({
  order,
  open,
  draft,
  busy,
  onToggle,
  onDraft,
  onDispatch,
}: {
  order: PendingOrder;
  open: boolean;
  draft: { courierName: string; trackingNumber: string };
  busy: boolean;
  onToggle: () => void;
  onDraft: (courierName: string, trackingNumber: string) => void;
  onDispatch: () => void;
}) {
  return (
    <>
      <TableRow
        onClick={onToggle}
        className="cursor-pointer border-(--brand-card-border) transition hover:bg-[rgba(240,161,50,0.06)]"
      >
        <TableCell className="align-top">
          <Link
            href={`/orders/${order.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-(--brand-link) hover:underline"
          >
            {formatOrderDisplayId(order)}
          </Link>
          <div className="mt-0.5 text-xs text-(--brand-text-muted)">
            {order.assignedTo?.name?.trim() || order.assignedTo?.email || "Unassigned"}
          </div>
        </TableCell>
        <TableCell className="align-top">
          <div className="font-semibold text-(--brand-text)">
            {order.user?.name?.trim() || "Unnamed customer"}
          </div>
          <div className="mt-0.5 text-xs text-(--brand-text-muted)">
            {order.user?.email}
          </div>
        </TableCell>
        <TableCell className="align-top text-(--brand-text)">
          {order.deliveryService?.serviceName || "No service"}
          {order.deliveryService?.courierCompany
            ? ` · ${order.deliveryService.courierCompany}`
            : ""}
        </TableCell>
        <TableCell className="align-top">
          {order.delivery ? (
            <>
              <div className="text-(--brand-text)">
                {String(order.delivery.actualWeight)} kg →{" "}
                {String(order.delivery.chargeableWeight)} kg
              </div>
              <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                {formatMoney(order.delivery.customerCharge)} charge
              </div>
            </>
          ) : (
            <span className="text-(--brand-text-muted)">—</span>
          )}
        </TableCell>
        <TableCell className="align-top whitespace-nowrap text-sm text-(--brand-text-muted)">
          {ageInPacked(order.updatedAt)}
        </TableCell>
        <TableCell className="align-top">
          {open ? (
            <span className="text-xs font-bold text-(--brand-primary)" aria-hidden>
              Hide ↑
            </span>
          ) : (
            <span className="text-xs font-bold text-(--brand-primary)" aria-hidden>
              Dispatch ↓
            </span>
          )}
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow className="border-(--brand-card-border)">
          <TableCell colSpan={6} className="bg-(--brand-muted-bg,transparent)">
            <div className="grid gap-3 py-2 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <label className={labelClass}>Courier</label>
                <Input
                  value={draft.courierName}
                  onChange={(e) => onDraft(e.target.value, draft.trackingNumber)}
                  placeholder="e.g. Sri Raj Courier"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tracking number</label>
                <Input
                  value={draft.trackingNumber}
                  onChange={(e) => onDraft(draft.courierName, e.target.value)}
                  placeholder="AWB / tracking number"
                  className={cn(inputClass, "font-mono")}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={() => void onDispatch()}
                  disabled={busy}
                  className="h-10 rounded-lg"
                >
                  {busy ? "Dispatching…" : "Dispatch"}
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}