"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { TableSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { readListCache, writeListCache } from "@/app/lib/admin-cache";
import {
  type AdminOrder,
  type OrdersListFilters,
  ORDER_STATUS_FILTERS,
  applyOrdersListFiltersToSearchParams,
  formatDate,
  formatLensType,
  formatMoney,
  formatOrderDisplayId,
  formatPrescription,
  formatStatus,
  matchesOrderFilters,
  matchesOrderSearch,
  parseOrdersListFilters,
  statusBadgeClass,
} from "@/app/lib/admin-orders";
import type { AdminEmployee } from "@/app/lib/admin-employees";
import { useProgressiveList } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 rounded-lg border border-(--brand-card-border) bg-(--brand-card) px-3 text-sm text-(--brand-text) [&>option]:bg-(--brand-card) [&>option]:text-(--brand-text)";

type AdminOrdersTableProps = {
  title: string;
  description: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptySearchMessage?: string;
  filterOrders?: (orders: AdminOrder[]) => AdminOrder[];
  showNotes?: boolean;
  showFilters?: boolean;
  hideRxOrderKind?: boolean;
  hideOrderKindFilter?: boolean;
  defaultStatus?: string;
  headerActions?: ReactNode;
  /** When set, order row navigation appends this hash (e.g. create-return flow). */
  orderDetailHash?: string;
  /**
   * Sync search/filters with the URL so overview ↔ table view can share them.
   * Only enable on the main `/orders` list.
   */
  persistFiltersInUrl?: boolean;
};

type UrlBridge = {
  searchParams: ReadonlyURLSearchParams;
  pathname: string;
  router: ReturnType<typeof useRouter>;
};

/** Public entry — URL sync is opt-in and Suspense-wrapped. */
export function AdminOrdersTable(props: AdminOrdersTableProps) {
  if (props.persistFiltersInUrl) {
    return (
      <Suspense fallback={<TableSkeleton compact columns={7} rows={8} />}>
        <AdminOrdersTableUrlBound {...props} />
      </Suspense>
    );
  }
  return <AdminOrdersTableImpl {...props} urlBridge={null} />;
}

function AdminOrdersTableUrlBound(props: AdminOrdersTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlBridge = useMemo(
    () => ({ searchParams, pathname, router }),
    [searchParams, pathname, router]
  );
  return <AdminOrdersTableImpl {...props} urlBridge={urlBridge} />;
}

function AdminOrdersTableImpl({
  title,
  description,
  searchPlaceholder = "Search by customer, order #, status…",
  emptyMessage = "No orders found yet.",
  emptySearchMessage = "No orders match your search.",
  filterOrders,
  showNotes = false,
  showFilters = false,
  hideRxOrderKind = false,
  hideOrderKindFilter = false,
  defaultStatus = "",
  headerActions,
  orderDetailHash,
  urlBridge,
}: AdminOrdersTableProps & { urlBridge: UrlBridge | null }) {
  const fallbackRouter = useRouter();
  const router = urlBridge?.router ?? fallbackRouter;
  const urlFilters: OrdersListFilters | null = urlBridge
    ? parseOrdersListFilters(urlBridge.searchParams)
    : null;

  const openOrder = (orderId: string) => {
    const path = `/orders/${orderId}`;
    router.push(orderDetailHash ? `${path}#${orderDetailHash}` : path);
  };
  const [orders, setOrders] = useState<AdminOrder[]>(() => {
    const cached = readListCache<AdminOrder[]>("orders");
    if (!cached) return [];
    return filterOrders ? filterOrders(cached) : cached;
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(urlFilters?.q ?? "");
  const [status, setStatus] = useState(
    urlFilters?.status || defaultStatus
  );
  const [lineType, setLineType] = useState(urlFilters?.lineType ?? "");
  const [orderKind, setOrderKind] = useState(urlFilters?.orderKind ?? "");
  const [assigneeId, setAssigneeId] = useState(urlFilters?.assigneeId ?? "");
  const [dateFrom, setDateFrom] = useState(urlFilters?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(urlFilters?.dateTo ?? "");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      const cached = readListCache<AdminOrder[]>("orders");
      if (cached) {
        setOrders(filterOrders ? filterOrders(cached) : cached);
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
          setOrders(filterOrders ? filterOrders(list) : list);
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
  }, [filterOrders]);

  useEffect(() => {
    if (!showFilters) return;
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
  }, [showFilters]);

  // Persist shared filters in the URL (main /orders ↔ overview handoff).
  useEffect(() => {
    if (!urlBridge) return;

    const preserved = new URLSearchParams();
    const createReturn = urlBridge.searchParams.get("createReturn");
    if (createReturn) preserved.set("createReturn", createReturn);

    const next = applyOrdersListFiltersToSearchParams(preserved, {
      q: query,
      status,
      lineType,
      orderKind,
      assigneeId,
      dateFrom,
      dateTo,
    });
    const nextQs = next.toString();
    const currentQs = urlBridge.searchParams.toString();
    if (nextQs === currentQs) return;
    urlBridge.router.replace(
      nextQs ? `${urlBridge.pathname}?${nextQs}` : urlBridge.pathname,
      { scroll: false }
    );
  }, [
    urlBridge,
    query,
    status,
    lineType,
    orderKind,
    assigneeId,
    dateFrom,
    dateTo,
  ]);

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (!matchesOrderSearch(order, query)) return false;
      if (!showFilters) return true;
      return matchesOrderFilters(order, {
        status: status || undefined,
        lineType: lineType || undefined,
        orderKind: orderKind || undefined,
        assigneeId: assigneeId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
    });
  }, [
    orders,
    query,
    showFilters,
    status,
    lineType,
    orderKind,
    assigneeId,
    dateFrom,
    dateTo,
  ]);

  const {
    visibleItems,
    hasMore,
    sentinelIndex,
    setSentinelNode,
  } = useProgressiveList(filtered);

  const colSpan = showNotes ? 8 : 7;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            {title}
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {loading
              ? "…"
              : `${description} · ${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {headerActions}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>
      </div>

      {showFilters ? (
        <div className="mb-4 grid gap-2 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
          >
            <option value="">All line types</option>
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
          </select>
          {hideOrderKindFilter ? null : (
            <select
              className={selectClass}
              value={orderKind}
              onChange={(e) => setOrderKind(e.target.value)}
            >
              <option value="">All kinds</option>
              <option value="RETAIL">Catalog retail</option>
              <option value="WHOLESALE">Wholesale</option>
              {hideRxOrderKind ? null : <option value="RX">RX</option>}
              <option value="COLOR">Color lens</option>
            </select>
          )}
          <select
            className={selectClass}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
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
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={colSpan} rows={8} />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
        <Table>
          <TableHeader>
            <TableRow className="border-(--brand-card-border) hover:bg-transparent">
              <TableHead className="text-(--brand-label)">Order</TableHead>
              <TableHead className="text-(--brand-label)">Customer</TableHead>
              <TableHead className="text-(--brand-label)">Product</TableHead>
              <TableHead className="text-(--brand-label)">Qty</TableHead>
              <TableHead className="text-(--brand-label)">Amount</TableHead>
              <TableHead className="text-(--brand-label)">Status</TableHead>
              {showNotes ? (
                <TableHead className="text-(--brand-label)">RX details</TableHead>
              ) : null}
              <TableHead className="text-(--brand-label)">Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="h-28 text-center text-(--brand-text-muted)"
                >
                  {query.trim() ||
                  status ||
                  lineType ||
                  orderKind ||
                  assigneeId ||
                  dateFrom ||
                  dateTo
                    ? emptySearchMessage
                    : emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {visibleItems.map((order, index) => (
                  <TableRow
                    key={order.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => openOrder(order.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openOrder(order.id);
                      }
                    }}
                    className="cursor-pointer border-(--brand-card-border) transition hover:bg-[rgba(240,161,50,0.06)]"
                  >
                    <TableCell className="align-top">
                      <span className="font-semibold text-(--brand-link)">
                        {formatOrderDisplayId(order)}
                      </span>
                      <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                        {order.lineType === "WHOLESALE" ? "Wholesale" : "Retail"}
                        {order.assignedTo
                          ? ` · ${order.assignedTo.name?.trim() || order.assignedTo.email}`
                          : ""}
                      </div>
                      {index === sentinelIndex && hasMore ? (
                        <InfiniteScrollSentinel
                          active
                          setSentinelNode={setSentinelNode}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-semibold text-(--brand-text)">
                        {order.user?.name?.trim() || "Unnamed customer"}
                      </div>
                      <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                        {order.user?.email}
                      </div>
                      {order.user?.businessName ? (
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          {order.user.businessName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="text-(--brand-text)">
                        {formatLensType(order.lensType)}
                      </div>
                      <div className="mt-0.5 max-w-56 text-xs text-(--brand-text-muted)">
                        {formatPrescription(order)}
                      </div>
                      {order.orderImageUrl ? (
                        <a
                          href={order.orderImageUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-block text-xs font-semibold text-(--brand-link) hover:underline"
                        >
                          View prescription
                        </a>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-(--brand-text)">
                      {order.quantity}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="font-semibold text-(--brand-text)">
                        {formatMoney(order.totalAmount)}
                      </div>
                      <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                        {formatMoney(order.unitPrice)} / unit
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-lg font-bold",
                            statusBadgeClass(order.status)
                          )}
                        >
                          {formatStatus(order.status)}
                        </Badge>
                        {(order.alternateSuggestions?.length ?? 0) > 0 ? (
                          <Badge
                            variant="outline"
                            className="rounded-lg font-bold border-amber-500/40 text-amber-700"
                          >
                            Alternate pending
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    {showNotes ? (
                      <TableCell className="align-top">
                        <pre className="max-w-[18rem] whitespace-pre-wrap font-sans text-xs leading-relaxed text-(--brand-text-muted)">
                          {order.notes?.replace(/^\[RX Order\]\s*/m, "").trim() ||
                            "—"}
                        </pre>
                      </TableCell>
                    ) : null}
                    <TableCell className="align-top whitespace-nowrap text-sm text-(--brand-text-muted)">
                      {formatDate(order.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {hasMore && visibleItems.length <= sentinelIndex ? (
                  <InfiniteScrollSentinel
                    active
                    asTableRow
                    colSpan={colSpan}
                    setSentinelNode={setSentinelNode}
                  />
                ) : null}
              </>
            )}
          </TableBody>
        </Table>
      </div>
      )}
    </>
  );
}
