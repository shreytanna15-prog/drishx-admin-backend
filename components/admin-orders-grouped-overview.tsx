"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import {
  ListSkeleton,
  PaginatedListStatusBanner,
} from "@/components/admin-skeletons";
import { listAdminEmployees } from "@/app/lib/admin-employees";
import {
  resolvePaginatedListUi,
  usePaginatedListState,
} from "@/app/lib/hooks/use-paginated-list-state";
import {
  type AdminOrder,
  type OrderGroupSort,
  type OrderLineSort,
  ORDER_GROUP_SORT_OPTIONS,
  ORDER_LINE_SORT_OPTIONS,
  ORDER_STATUS_FILTERS,
  applyOrdersListFiltersToSearchParams,
  buildOrderDetailHref,
  buildOrdersListHref,
  buildOrdersReturnTo,
  formatCatalogSummary,
  formatDate,
  formatMoney,
  formatOrderDisplayId,
  formatStatus,
  groupOrdersByCustomer,
  groupOrdersByDate,
  parseOrdersListFilters,
  sortOrderGroups,
  sortOrdersInGroup,
  statusBadgeClass,
} from "@/app/lib/admin-orders";
import type { AdminEmployee } from "@/app/lib/admin-employees";
import { useGetOrders } from "@/app/lib/modules/orders/query/use-get-orders";
import {
  useInfiniteScrollSentinel,
  useProgressiveList,
} from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

type GroupMode = "date" | "customer";

function parseGroupMode(value: string | null): GroupMode {
  return value === "customer" ? "customer" : "date";
}

function parseGroupSort(value: string | null): OrderGroupSort {
  const match = ORDER_GROUP_SORT_OPTIONS.find((opt) => opt.id === value);
  return match?.id ?? "newest";
}

function parseLineSort(value: string | null): OrderLineSort {
  const match = ORDER_LINE_SORT_OPTIONS.find((opt) => opt.id === value);
  return match?.id ?? "newest";
}

export function AdminOrdersGroupedOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialFilters = parseOrdersListFilters(searchParams);

  const [query, setQuery] = useState(initialFilters.q);
  const [debouncedQ, setDebouncedQ] = useState(initialFilters.q);
  const [status, setStatus] = useState(initialFilters.status);
  const [lineType, setLineType] = useState(initialFilters.lineType);
  const [orderKind, setOrderKind] = useState(initialFilters.orderKind);
  const [assigneeId, setAssigneeId] = useState(initialFilters.assigneeId);
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [groupMode, setGroupMode] = useState<GroupMode>(() =>
    parseGroupMode(searchParams.get("group"))
  );
  const [groupSort, setGroupSort] = useState<OrderGroupSort>(() =>
    parseGroupSort(searchParams.get("groupSort"))
  );
  const [lineSort, setLineSort] = useState<OrderLineSort>(() =>
    parseLineSort(searchParams.get("lineSort"))
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const listResetKey = [
    debouncedQ,
    status,
    lineType,
    orderKind,
    assigneeId,
    dateFrom,
    dateTo,
  ].join("|");
  const {
    page,
    setPage,
    items: orders,
    onPageSuccess,
    acknowledgeCurrentKey,
    awaitingCurrentKey,
  } = usePaginatedListState<AdminOrder>(listResetKey);

  const {
    data,
    loading,
    refreshing,
    error,
    refetch,
  } = useGetOrders(
    {
      page,
      limit: 40,
      q: debouncedQ || undefined,
      status: status || undefined,
      lineType: lineType || undefined,
      orderKind: orderKind || undefined,
      assigneeId: assigneeId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      scope: "catalog",
    },
    {
      onSuccess: onPageSuccess,
      onError: () => acknowledgeCurrentKey(),
    }
  );

  const serverHasMore = Boolean(data?.hasMore);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      try {
        const employees = await listAdminEmployees();
        if (!cancelled) {
          setEmployees(employees);
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

  // Keep overview URL in sync so Table view / refresh preserve filters & sort.
  useEffect(() => {
    const next = applyOrdersListFiltersToSearchParams(
      new URLSearchParams(),
      {
        q: query,
        status,
        lineType,
        orderKind,
        assigneeId,
        dateFrom,
        dateTo,
      }
    );
    if (groupMode !== "date") next.set("group", groupMode);
    if (groupSort !== "newest") next.set("groupSort", groupSort);
    if (lineSort !== "newest") next.set("lineSort", lineSort);

    const nextQs = next.toString();
    const currentQs = searchParams.toString();
    if (nextQs === currentQs) return;
    router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, {
      scroll: false,
    });
  }, [
    query,
    status,
    lineType,
    orderKind,
    assigneeId,
    dateFrom,
    dateTo,
    groupMode,
    groupSort,
    lineSort,
    pathname,
    router,
    searchParams,
  ]);

  const tableViewHref = useMemo(
    () =>
      buildOrdersListHref("/orders", {
        q: query,
        status,
        lineType,
        orderKind,
        assigneeId,
        dateFrom,
        dateTo,
      }),
    [query, status, lineType, orderKind, assigneeId, dateFrom, dateTo]
  );

  const filtered = orders;
  const hasActiveFilters = Boolean(
    query.trim() || status || lineType || orderKind || assigneeId || dateFrom || dateTo
  );
  const listUi = resolvePaginatedListUi({
    loading,
    refreshing,
    itemCount: orders.length,
    hasActiveFilters,
    awaitingCurrentKey,
    error: Boolean(error),
    entityLabel: "orders",
  });

  const { setSentinelNode: setPageSentinel } = useInfiniteScrollSentinel({
    enabled: serverHasMore && !listUi.isPending,
    onLoadMore: () => setPage((p) => p + 1),
    deps: [orders.length, page, serverHasMore, listUi.isPending],
  });

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
    router.push(
      buildOrderDetailHref(orderId, {
        returnTo: buildOrdersReturnTo(pathname, searchParams),
      })
    );
  };

  const totalAmount = filtered.reduce((sum, o) => {
    const n = Number(o.totalAmount);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const statusFilterOptions = useMemo(
    () => [
      { value: "", label: "All statuses" },
      ...ORDER_STATUS_FILTERS.map((s) => ({
        value: s,
        label: formatStatus(s),
      })),
    ],
    []
  );

  const assigneeFilterOptions = useMemo(
    () => [
      { value: "", label: "All assignees" },
      { value: "__unassigned__", label: "Unassigned" },
      ...employees.map((emp) => ({
        value: emp.id,
        label: emp.name?.trim() || emp.email,
      })),
    ],
    [employees]
  );

  const groupSortOptions = useMemo(
    () =>
      ORDER_GROUP_SORT_OPTIONS.map((opt) => ({
        value: opt.id,
        label: opt.label,
      })),
    []
  );

  const lineSortOptions = useMemo(
    () =>
      ORDER_LINE_SORT_OPTIONS.map((opt) => ({
        value: opt.id,
        label: opt.label,
      })),
    []
  );

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {listUi.pendingLabel
              ? listUi.pendingLabel
              : `${groups.length} group${groups.length === 1 ? "" : "s"} · ${filtered.length} order${filtered.length === 1 ? "" : "s"} · ${formatMoney(totalAmount)}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild variant="outline" size="sm" className="h-10 rounded-xl">
            <Link href={tableViewHref}>
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
        <AdminSelect
          value={status}
          onValueChange={setStatus}
          options={statusFilterOptions}
          placeholder="All statuses"
          size="sm"
          aria-label="Filter by status"
        />
        <AdminSelect
          value={lineType}
          onValueChange={setLineType}
          options={[
            { value: "", label: "All line types" },
            { value: "RETAIL", label: "Retail" },
            { value: "WHOLESALE", label: "Wholesale" },
          ]}
          placeholder="All line types"
          size="sm"
          aria-label="Filter by line type"
        />
        <AdminSelect
          value={orderKind}
          onValueChange={setOrderKind}
          options={[
            { value: "", label: "All kinds" },
            { value: "RETAIL", label: "Catalog retail" },
            { value: "WHOLESALE", label: "Wholesale" },
            { value: "COLOR", label: "Color lens" },
          ]}
          placeholder="All kinds"
          size="sm"
          aria-label="Filter by order kind"
        />
        <AdminSelect
          value={assigneeId}
          onValueChange={setAssigneeId}
          options={assigneeFilterOptions}
          placeholder="All assignees"
          size="sm"
          aria-label="Filter by assignee"
        />
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
        <AdminSelect
          value={groupSort}
          onValueChange={(v) => setGroupSort(v as OrderGroupSort)}
          options={groupSortOptions}
          placeholder="Sort groups"
          size="sm"
          aria-label="Sort groups"
        />
        <AdminSelect
          value={lineSort}
          onValueChange={(v) => setLineSort(v as OrderLineSort)}
          options={lineSortOptions}
          placeholder="Sort lines inside groups"
          size="sm"
          aria-label="Sort lines inside groups"
        />
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error.message}{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <PaginatedListStatusBanner message={listUi.statusBanner} />

      {listUi.showPendingPlaceholder ? (
        <ListSkeleton rows={6} />
      ) : listUi.showEmpty ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-12 text-center text-sm text-(--brand-text-muted)">
          {hasActiveFilters
            ? "No orders match your search."
            : "No orders found yet."}
        </div>
      ) : (
        <div
          className={
            listUi.showStaleContent
              ? "flex flex-col gap-4 opacity-55 transition-opacity"
              : "flex flex-col gap-4 transition-opacity"
          }
          aria-busy={listUi.isPending || undefined}
        >
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
          {serverHasMore ? (
            <InfiniteScrollSentinel
              active
              loadingMore={(loading || refreshing) && page > 1}
              setSentinelNode={setPageSentinel}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
