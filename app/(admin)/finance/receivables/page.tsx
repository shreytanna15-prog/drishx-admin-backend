"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminApiError } from "@/app/lib/admin-api";
import { getFinanceReceivables, type ReceivablesSummary } from "@/app/lib/admin-finance";
import { Button } from "@/components/ui/button";

function money(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ReceivablesPage() {
  const [data, setData] = useState<ReceivablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getFinanceReceivables()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Failed to load.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminPage
      title="Receivables"
      subtitle="Customer outstanding and aging (invoice table: latest 100 by due)"
    >
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading || !data ? (
        <TableSkeleton compact columns={4} rows={6} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total receivable", data.totalReceivable],
              ["Due today", data.dueToday],
              ["Overdue", data.overdue],
              ["Pending claims", data.pendingClaims],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4"
              >
                <p className="text-xs uppercase tracking-wide text-(--brand-label)">
                  {label}
                </p>
                <p className="mt-2 text-xl font-bold text-(--brand-text)">
                  {typeof value === "number" && label !== "Pending claims"
                    ? money(value)
                    : value}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {Object.entries(data.aging).map(([bucket, amt]) => (
              <div
                key={bucket}
                className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-3 py-3"
              >
                <p className="text-xs text-(--brand-label)">{bucket} days</p>
                <p className="font-semibold text-(--brand-text)">{money(amt)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--brand-card-border) text-left text-(--brand-label)">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Outstanding</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-(--brand-card-border)">
                    <td className="px-4 py-3">
                      <Link
                        href={`/finance/invoices/${inv.id}`}
                        className="text-(--brand-primary) hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {inv.user.businessName || inv.user.name || inv.user.email}
                    </td>
                    <td className="px-4 py-3">
                      {money(Number(inv.amountOutstanding))}
                    </td>
                    <td className="px-4 py-3">{inv.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button asChild variant="outline">
            <Link href="/finance/payments">Review payment claims</Link>
          </Button>
        </div>
      )}
    </AdminPage>
  );
}
