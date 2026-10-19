"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import {
  PaginatedListStatusBanner,
  TableSkeleton,
} from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
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
import {
  type AdminInvoice,
  formatInvoiceDate,
  formatInvoiceMoney,
  invoiceCustomerLabel,
  invoiceStatusClass,
} from "@/app/lib/admin-invoices";
import {
  resolvePaginatedListUi,
  usePaginatedListState,
} from "@/app/lib/hooks/use-paginated-list-state";
import { useGetInvoices } from "@/app/lib/modules/invoices/query/use-get-invoices";
import { useInfiniteScrollSentinel } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

export default function SalesInvoicesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const {
    page,
    setPage,
    items,
    onPageSuccess,
    acknowledgeCurrentKey,
    awaitingCurrentKey,
  } = usePaginatedListState<AdminInvoice>(debouncedQ);

  const { data, loading, refreshing, error, refetch } = useGetInvoices(
    {
      page,
      limit: 30,
      q: debouncedQ || undefined,
    },
    {
      onSuccess: onPageSuccess,
      onError: () => acknowledgeCurrentKey(),
    }
  );

  const hasMore = Boolean(data?.hasMore);
  const listUi = resolvePaginatedListUi({
    loading,
    refreshing,
    itemCount: items.length,
    hasActiveFilters: Boolean(query.trim()),
    awaitingCurrentKey,
    error: Boolean(error),
    entityLabel: "invoices",
  });
  const loadingMore = (loading || refreshing) && page > 1;

  const { setSentinelNode } = useInfiniteScrollSentinel({
    enabled: hasMore && !listUi.isPending,
    onLoadMore: () => setPage((p) => p + 1),
    deps: [items.length, page, hasMore, listUi.isPending],
  });

  const totals = useMemo(() => {
    const paid = items
      .filter((invoice) => invoice.status === "PAID")
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const unpaid = items
      .filter((invoice) => invoice.status !== "PAID")
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    return { paid, unpaid };
  }, [items]);

  return (
    <AdminPage title="Sales & Invoices" subtitle="All customer invoices">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Sales & Invoices
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {listUi.pendingLabel
              ? listUi.pendingLabel
              : `${data?.total ?? items.length} invoice${
                  (data?.total ?? items.length) === 1 ? "" : "s"
                } · Paid ${formatInvoiceMoney(totals.paid)} · Unpaid ${formatInvoiceMoney(totals.unpaid)} (loaded pages)`}
          </p>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice #, customer, GST, status…"
          className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
        />
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error.message}
          <Button className="ml-3 rounded-xl" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <PaginatedListStatusBanner message={listUi.statusBanner} />

      {listUi.showPendingPlaceholder ? (
        <TableSkeleton compact columns={6} rows={8} />
      ) : (
        <div
          className={
            listUi.showStaleContent
              ? "overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow) opacity-55 transition-opacity"
              : "overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow) transition-opacity"
          }
          aria-busy={listUi.isPending || undefined}
        >
          <Table>
            <TableHeader>
              <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                <TableHead className="text-(--brand-label)">Invoice</TableHead>
                <TableHead className="text-(--brand-label)">Customer</TableHead>
                <TableHead className="text-(--brand-label)">Order</TableHead>
                <TableHead className="text-(--brand-label)">Amount</TableHead>
                <TableHead className="text-(--brand-label)">Status</TableHead>
                <TableHead className="text-(--brand-label)">Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listUi.showEmpty ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-28 text-center text-(--brand-text-muted)"
                  >
                    {query.trim()
                      ? "No invoices match your search."
                      : "No invoices found yet."}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {items.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="border-(--brand-card-border)"
                    >
                      <TableCell className="align-top">
                        <Link
                          href={`/finance/invoices/${invoice.id}`}
                          className="font-semibold text-(--brand-primary) hover:underline"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-(--brand-text)">
                          {invoiceCustomerLabel(invoice)}
                        </div>
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          {invoice.user?.email}
                        </div>
                        {invoice.user?.gstNumber ? (
                          <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                            GST {invoice.user.gstNumber}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top text-(--brand-text)">
                        {invoice.order?.orderNumber != null
                          ? `#${invoice.order.orderNumber}`
                          : invoice.orderId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="align-top font-semibold text-(--brand-text)">
                        {formatInvoiceMoney(invoice.amount)}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-lg font-bold",
                            invoiceStatusClass(invoice.status)
                          )}
                        >
                          {invoice.status === "PAID" ? "Paid" : "Unpaid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap text-sm text-(--brand-text-muted)">
                        {formatInvoiceDate(invoice.issuedAt || invoice.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {hasMore ? (
                    <InfiniteScrollSentinel
                      active
                      asTableRow
                      colSpan={6}
                      loadingMore={loadingMore}
                      setSentinelNode={setSentinelNode}
                    />
                  ) : null}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminPage>
  );
}
