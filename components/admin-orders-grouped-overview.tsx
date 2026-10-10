"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { ListSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { readListCache, writeListCache } from "@/app/lib/admin-cache";
import {
  type AdminOrder,
  type OrderGroupSort,
  type OrderLineSort,
  ORDER_GROUP_SORT_OPTIONS,
  ORDER_LINE_SORT_OPTIONS,
  ORDER_STATUS_FILTERS,
  filterNonRxOrders,
  formatCatalogSummary,
  formatDate,
  formatMoney,
  formatOrderDisplayId,
  formatStatus,
  groupOrdersByCustomer,
  groupOrdersByDate,
  matchesOrderFilters,
  matchesOrderSearch,
  sortOrderGroups,
  sortOrdersInGroup,
  statusBadgeClass,
} from "@/app/lib/admin-orders";
import type { AdminEmployee } from "@/app/lib/admin-employees";
import { useProgressiveList } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 rounded-lg border border-(--brand-card-border) bg-(--brand-card) px-3 text-sm text-(--brand-text) [&>option]:bg-(--brand-card) [&>option]:text-(--brand-text)";

type GroupMode = "date" | "customer";

export function AdminOrdersGroupedOverview() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrder[]>(() => {
    const cached = readListCache<AdminOrder[]>("orders");
    return cached ? filterNonRxOrders(cached) : [];
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [lineType, setLineType] = useState("");
  const [orderKind, setOrderKind] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [groupMode, setGroupMode] = useState<GroupMode>("date");
  const [groupSort, setGroupSort] = useState<OrderGroupSort>("newest");
  const [lineSort, setLineSort] = useState<OrderLineSort>("newest");

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      const cached = readListCache<AdminOrder[]>("orders");
      if (cached) {
        setOrders(filterNonRxOrders(cached));
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await adminFetch<AdminOrder[]>("/api/orders");
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          writeListCache("orders", list);
          setOrders(filterNonRxOrders(list));
        }
      } catch (err) {
        if (!cancelled && !cached) {
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load orders."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      try {
        const data = await adminFetch<{ employees: AdminEmployee[] }>(
          "/api/users/employees"
        );
        if (!cancelled) {
          setEmployees(Array.isArray(data.employees) ? data.employees : []);
        }
      } catch {
        if (!cancelled) setEmployees([]);
      }
    }
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (!matchesOrderSearch(order, query)) return false;
      return matchesOrderFilters(order, {
        status: status || undefined,
        lineType: lineType || undefined,
        orderKind: orderKind || undefined,
        assigneeId: assigneeId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
    });
  }, [orders, query, status, lineType, orderKind, assigneeId, dateFrom, dateTo]);

  const groups = useMemo(() => {
    const raw =
      groupMode === "date"
        ? groupOrdersByDate(filtered)
        : groupOrdersByCustomer(filtered);
    return sortOrderGroups(raw, groupSort).map((group) => ({
      ...group,
      orders: sortOrdersInGroup(group.orders, lineSort),
    }));
  }, [filtered, groupMode, groupSort, lineSort]);

  const {
    visibleItems,
    hasMore,
    sentinelIndex,
    setSentinelNode,
  } = useProgressiveList(groups, { pageSize: 16, preloadAt: 10 });

  const openOrder = (orderId: string) => {
    router.push(`/orders/${orderId}`);
  };

  const totalAmount = filtered.reduce((sum, o) => {
    const n = Number(o.totalAmount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {loading
              ? "…"
              : `${groups.length} group${groups.length === 1 ? "" : "s"} · ${filtered.length} order${filtered.length === 1 ? "" : "s"} · ${formatMoney(totalAmount)}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild variant="outline" size="sm" className="h-10 rounded-xl">
            <Link href="/orders">
              <List className="size-4" />
              Table view
            </Link>
          </Button>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer, order #, status…"
            className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-2"
        role="tablist"
        aria-label="Group orders by"
      >
        {(
          [
            { id: "date" as const, label: "By date" },
            { id: "customer" as const, label: "By customer" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={groupMode === tab.id}
            onClick={() => setGroupMode(tab.id)}
            className={cn(
              "h-10 rounded-xl border px-4 text-sm font-semibold transition",
              groupMode === tab.id
                ? "border-(--brand-primary) bg-(--brand-primary)/15 text-(--brand-primary)"
                : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:text-(--brand-text)"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-2 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <select
          className={selectClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ORDER_STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {formatStatus(s)}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={lineType}
          onChange={(e) => setLineType(e.target.value)}
          aria-label="Filter by line type"
        >
          <option value="">All line types</option>
          <option value="RETAIL">Retail</option>
          <option value="WHOLESALE">Wholesale</option>
        </select>
        <select
          className={selectClass}
          value={orderKind}
          onChange={(e) => setOrderKind(e.target.value)}
          aria-label="Filter by order kind"
        >
          <option value="">All kinds</option>
          <option value="RETAIL">Catalog retail</option>
          <option value="WHOLESALE">Wholesale</option>
          <option value="COLOR">Color lens</option>
        </select>
        <select
          className={selectClass}
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          <option value="__unassigned__">Unassigned</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name?.trim() || emp.email}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
          aria-label="From date"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
          aria-label="To date"
        />
        <select
          className={selectClass}
          value={groupSort}
          onChange={(e) => setGroupSort(e.target.value as OrderGroupSort)}
          aria-label="Sort groups"
        >
          {ORDER_GROUP_SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={lineSort}
          onChange={(e) => setLineSort(e.target.value as OrderLineSort)}
          aria-label="Sort lines inside groups"
        >
          {ORDER_LINE_SORT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-12 text-center text-sm text-(--brand-text-muted)">
          {query.trim() || status || lineType || orderKind || assigneeId || dateFrom || dateTo
            ? "No orders match your search."
            : "No orders found yet."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleItems.map((group, index) => (
            <section
              key={group.key}
              className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)"
            >
              <header className="border-b border-(--brand-card-border) bg-[rgba(240,161,50,0.06)] px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="size-4 shrink-0 text-(--brand-primary)" />
                      <h2 className="truncate text-base font-extrabold text-(--brand-text)">
                        {group.label}
                      </h2>
                    </div>
                    {group.subtitle ? (
                      <p className="mt-0.5 truncate text-xs text-(--brand-text-muted)">
                        {group.subtitle}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-(--brand-text-muted)">
                      {group.count} order{group.count === 1 ? "" : "s"}
                      {group.latestCreatedAt
                        ? ` · latest ${formatDate(group.latestCreatedAt)}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <div className="text-sm font-extrabold text-(--brand-text)">
                      {formatMoney(group.totalAmount)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 sm:justify-end">
                      {group.statusBreakdown.slice(0, 4).map((row) => (
                        <Badge
                          key={row.status}
                          variant="outline"
                          className={cn(
                            "rounded-md px-1.5 py-0 text-[10px] font-semibold",
                            statusBadgeClass(row.status)
                          )}
                        >
                          {formatStatus(row.status)} · {row.count}
                        </Badge>
                      ))}
                      {group.statusBreakdown.length > 4 ? (
                        <span className="text-[10px] text-(--brand-text-muted)">
                          +{group.statusBreakdown.length - 4} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </header>

              <ul className="divide-y divide-(--brand-card-border)">
                {group.orders.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => openOrder(order.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openOrder(order.id);
                        }
                      }}
                      className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-[rgba(240,161,50,0.06)] sm:flex-row sm:items-start sm:justify-between sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-(--brand-link)">
                            {formatOrderDisplayId(order)}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-md px-1.5 py-0 text-[10px]",
                              statusBadgeClass(order.status)
                            )}
                          >
                            {formatStatus(order.status)}
                          </Badge>
                          <span className="text-xs text-(--brand-text-muted)">
                            {order.lineType === "WHOLESALE"
                              ? "Wholesale"
                              : "Retail"}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-(--brand-text)">
                          {order.user?.name?.trim() ||
                            order.user?.businessName?.trim() ||
                            "Unnamed customer"}
                        </div>
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          {[
                            order.user?.businessName?.trim() &&
                            order.user?.businessName.trim() !==
                              order.user?.name?.trim()
                              ? order.user.businessName.trim()
                              : null,
                            order.user?.email,
                            order.assignedTo
                              ? `Assignee: ${order.assignedTo.name?.trim() || order.assignedTo.email}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="mt-1 text-xs text-(--brand-text-muted)">
                          {formatCatalogSummary(order)}
                          {` · Qty ${order.quantity}`}
                        </div>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <div className="text-sm font-extrabold text-(--brand-text)">
                          {formatMoney(order.totalAmount)}
                        </div>
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          {formatDate(order.createdAt)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              {index === sentinelIndex && hasMore ? (
                <InfiniteScrollSentinel
                  active
                  setSentinelNode={setSentinelNode}
                />
              ) : null}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
