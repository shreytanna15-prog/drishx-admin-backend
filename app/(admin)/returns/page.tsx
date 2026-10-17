"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  formatReturnDate,
  formatReturnMoney,
  formatReturnOrderCatalogSummary,
  formatReturnOrderDisplayId,
  formatReturnOrderStatus,
  formatReturnStatus,
  returnStatusBadgeClass,
  type AdminReturnRequest,
} from "@/app/lib/admin-returns";
import { usePaginatedListState } from "@/app/lib/hooks/use-paginated-list-state";
import { useGetReturns } from "@/app/lib/modules/returns/query/use-get-returns";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInfiniteScrollSentinel } from "@/hooks/use-progressive-list";

export default function ReturnsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const { page, setPage, items, onPageSuccess } =
    usePaginatedListState<AdminReturnRequest>(debouncedQ);

  const { data, loading, refreshing, error, refetch } = useGetReturns(
    {
      page,
      limit: 30,
      q: debouncedQ || undefined,
    },
    { onSuccess: onPageSuccess }
  );

  const hasMore = Boolean(data?.hasMore);
  const showInitialLoading = loading && page === 1 && items.length === 0;

  const { setSentinelNode } = useInfiniteScrollSentinel({
    enabled: hasMore && !loading && !refreshing,
    onLoadMore: () => setPage((p) => p + 1),
    deps: [items.length, page, hasMore],
  });

  const needsReviewCount = useMemo(
    () =>
      items.filter(
        (r) =>
          r.status === "SUBMITTED" ||
          r.status === "ESCALATED_TO_ADMIN" ||
          r.status === "MORE_INFO_REQUIRED"
      ).length,
    [items]
  );

  return (
    <AdminPage title="Returns & Replacements" subtitle="Customer requests and decisions">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Returns & Replacements
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {showInitialLoading
              ? "…"
              : `${data?.total ?? items.length} request${
                  (data?.total ?? items.length) === 1 ? "" : "s"
                }${
                  needsReviewCount > 0
                    ? ` · ${needsReviewCount} need${needsReviewCount === 1 ? "s" : ""} admin review (loaded)`
                    : ""
                }`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild className="rounded-xl">
            <Link href="/orders?createReturn=1">
              <Plus className="size-4" />
              Create on behalf
            </Link>
          </Button>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by customer, request #, order #, or status"
            className="sm:w-80"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error.message}
          <Button className="mt-3 rounded-xl" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {showInitialLoading ? (
        <TableSkeleton compact columns={6} rows={8} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
          <div className="hidden grid-cols-[1fr_1fr_1.4fr_0.85fr_0.75fr_0.75fr] gap-4 border-b border-(--brand-card-border) px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-(--brand-text-muted) md:grid">
            <div>Request</div>
            <div>Customer</div>
            <div>Linked orders</div>
            <div>Status</div>
            <div>Assignee</div>
            <div>Created</div>
          </div>
          {items.map((request) => {
            const needsReview =
              request.status === "SUBMITTED" ||
              request.status === "ESCALATED_TO_ADMIN" ||
              (request.status === "MORE_INFO_REQUIRED" && !request.assignedEmployee);
            return (
              <Link
                key={request.id}
                href={`/returns/${request.id}`}
                className={`grid gap-3 border-b border-(--brand-card-border) px-4 py-4 transition-colors hover:bg-(--brand-card-hover,rgba(255,255,255,0.03)) md:grid-cols-[1fr_1fr_1.4fr_0.85fr_0.75fr_0.75fr] md:gap-4 ${
                  needsReview ? "bg-amber-500/5" : ""
                }`}
              >
                <div>
                  <p className="font-semibold text-(--brand-link)">{request.requestNumber}</p>
                  <p className="mt-1 text-xs text-(--brand-text-muted)">
                    {request.requestType} · {request.items.length} item
                    {request.items.length === 1 ? "" : "s"}
                    {needsReview ? " · Needs review" : ""}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-(--brand-text)">
                    {request.customer.businessName ||
                      request.customer.name ||
                      request.customer.email}
                  </p>
                  <p className="mt-1 text-xs text-(--brand-text-muted)">
                    {request.customer.email}
                  </p>
                </div>
                <div className="space-y-2">
                  {request.items.length === 0 ? (
                    <p className="text-sm text-(--brand-text-muted)">No linked orders</p>
                  ) : (
                    request.items.slice(0, 3).map((item) => {
                      const order = item.originalOrder;
                      return (
                        <div key={item.id} className="text-sm">
                          <p className="font-semibold text-(--brand-text)">
                            {order
                              ? formatReturnOrderDisplayId(order)
                              : `#${item.originalOrderId.slice(0, 8).toUpperCase()}`}
                            <span className="ml-1.5 font-normal text-(--brand-text-muted)">
                              · Qty {item.quantity}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-(--brand-text-muted)">
                            {order
                              ? `${formatReturnOrderCatalogSummary(order)} · ${formatReturnOrderStatus(order.status)} · ${formatReturnMoney(order.totalAmount)}`
                              : item.lensLabel}
                          </p>
                        </div>
                      );
                    })
                  )}
                  {request.items.length > 3 ? (
                    <p className="text-xs text-(--brand-text-muted)">
                      +{request.items.length - 3} more item
                      {request.items.length - 3 === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Badge
                    variant="outline"
                    className={returnStatusBadgeClass(request.status)}
                  >
                    {formatReturnStatus(request.status)}
                  </Badge>
                </div>
                <div className="text-sm text-(--brand-text-muted)">
                  {request.assignedEmployee?.name ||
                    request.assignedEmployee?.email ||
                    "—"}
                </div>
                <div className="text-sm text-(--brand-text-muted)">
                  {formatReturnDate(request.createdAt)}
                </div>
              </Link>
            );
          })}
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-(--brand-text-muted)">
              No return requests found.
            </div>
          ) : null}
          {hasMore ? (
            <InfiniteScrollSentinel
              active
              loadingMore={(loading || refreshing) && page > 1}
              setSentinelNode={setSentinelNode}
            />
          ) : null}
        </div>
      )}
    </AdminPage>
  );
}
