"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
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
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { readListCache, writeListCache } from "@/app/lib/admin-cache";
import {
  type AdminInvoice,
  formatInvoiceDate,
  formatInvoiceMoney,
  invoiceCustomerLabel,
  invoiceStatusClass,
  matchesInvoiceSearch,
} from "@/app/lib/admin-invoices";
import { useProgressiveList } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

export default function SalesInvoicesPage() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>(
    () => readListCache<AdminInvoice[]>("invoices") ?? []
  );
  const [loading, setLoading] = useState(invoices.length === 0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices() {
      const cached = readListCache<AdminInvoice[]>("invoices");
      if (cached) {
        setInvoices(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const data = await adminFetch<AdminInvoice[]>("/api/invoices");
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          writeListCache("invoices", list);
          setInvoices(list);
        }
      } catch (err) {
        if (!cancelled && !cached) {
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load invoices."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInvoices();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => invoices.filter((invoice) => matchesInvoiceSearch(invoice, query)),
    [invoices, query]
  );

  const { visibleItems, hasMore, sentinelIndex, setSentinelNode } =
    useProgressiveList(filtered);

  const totals = useMemo(() => {
    const paid = filtered
      .filter((invoice) => invoice.status === "PAID")
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const unpaid = filtered
      .filter((invoice) => invoice.status !== "PAID")
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    return { paid, unpaid };
  }, [filtered]);

  return (
    <AdminPage title="Sales & Invoices" subtitle="All customer invoices">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Sales & Invoices
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {loading
              ? "…"
              : `${filtered.length} invoice${filtered.length === 1 ? "" : "s"} · Paid ${formatInvoiceMoney(totals.paid)} · Unpaid ${formatInvoiceMoney(totals.unpaid)}`}
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
          {error}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={6} rows={8} />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
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
            {filtered.length === 0 ? (
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
                {visibleItems.map((invoice, index) => (
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
                      {index === sentinelIndex && hasMore ? (
                        <InfiniteScrollSentinel
                          active
                          setSentinelNode={setSentinelNode}
                        />
                      ) : null}
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
                {hasMore && visibleItems.length <= sentinelIndex ? (
                  <InfiniteScrollSentinel
                    active
                    asTableRow
                    colSpan={6}
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
