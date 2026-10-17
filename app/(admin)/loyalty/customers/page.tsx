"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LoyaltyCustomerRow } from "@/app/lib/admin-loyalty";
import { usePaginatedListState } from "@/app/lib/hooks/use-paginated-list-state";
import { useGetLoyaltyCustomers } from "@/app/lib/modules/loyalty/query/use-get-loyalty-customers";
import { useInfiniteScrollSentinel } from "@/hooks/use-progressive-list";

function displayName(row: LoyaltyCustomerRow): string {
  return row.businessName?.trim() || row.name?.trim() || row.email;
}

export default function LoyaltyCustomersPage() {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const { page, setPage, items, onPageSuccess } =
    usePaginatedListState<LoyaltyCustomerRow>(debouncedQ);

  const { data, loading, refreshing, error, refetch } = useGetLoyaltyCustomers(
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

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) =>
        displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" })
      ),
    [items]
  );

  return (
    <AdminPage title="Loyalty Customers" subtitle="Customer wallets and point balances">
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-(--brand-text)">Loyalty Customers</h1>
            <p className="mt-1 text-sm text-(--brand-muted)">
              Search customers and open their X Points ledger.
              {data?.total != null ? ` · ${data.total} total` : ""}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/loyalty/settings"
              className="text-sm font-semibold text-(--brand-primary) hover:underline"
            >
              Program settings
            </Link>
            <Input
              className="h-10 max-w-sm border-(--brand-input-border) bg-(--brand-input-bg)"
              placeholder="Search by name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div className="auth-alert-error" role="alert">
            {error.message}
            <Button className="ml-3 rounded-xl" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        {showInitialLoading ? (
          <ListSkeleton rows={8} />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-(--brand-muted)">No customers found.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
            <ul className="divide-y divide-(--brand-card-border)">
              {sorted.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/loyalty/customers/${row.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-(--brand-card-hover,rgba(255,255,255,0.03))"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-(--brand-text)">
                        {displayName(row)}
                      </p>
                      <p className="truncate text-xs text-(--brand-muted)">{row.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right text-xs text-(--brand-muted)">
                        <p>
                          Available{" "}
                          <span className="font-semibold text-(--brand-text)">
                            {row.wallet.availablePoints}
                          </span>
                        </p>
                        <p>Pending {row.wallet.pendingPoints}</p>
                      </div>
                      <ChevronRight className="size-4 text-(--brand-muted)" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {hasMore ? (
              <InfiniteScrollSentinel
                active
                loadingMore={(loading || refreshing) && page > 1}
                setSentinelNode={setSentinelNode}
              />
            ) : null}
          </div>
        )}
      </div>
    </AdminPage>
  );
}
