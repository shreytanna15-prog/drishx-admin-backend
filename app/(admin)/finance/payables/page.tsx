"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminApiError } from "@/app/lib/admin-api";
import { getFinancePayables, type PayablesSummary } from "@/app/lib/admin-finance";

export default function PayablesPage() {
  const [data, setData] = useState<PayablesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void getFinancePayables()
      .then(setData)
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Failed to load.")
      )
      .finally(() => setLoading(false));
  }, []);

  const payablesSubtitle = data?.hasMore
    ? "Supplier outstanding (showing up to 100 bills by oldest bill date; more exist)"
    : "Supplier outstanding (bill table: up to 100, oldest bill date first)";

  return (
    <AdminPage title="Payables" subtitle={payablesSubtitle}>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading || !data ? (
        <TableSkeleton compact columns={3} rows={5} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
            <p className="text-xs uppercase text-(--brand-label)">Total payable</p>
            <p className="mt-1 text-2xl font-bold">
              ₹{data.totalPayable.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--brand-card-border) text-left text-(--brand-label)">
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.bills.map((b) => (
                  <tr key={b.id} className="border-b border-(--brand-card-border)">
                    <td className="px-4 py-3">{b.billNumber}</td>
                    <td className="px-4 py-3">{b.supplier.name}</td>
                    <td className="px-4 py-3">
                      ₹{Number(b.amountOutstanding).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
