"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";

type Payables = {
  totalPayable: number;
  bills: Array<{
    id: string;
    billNumber: string;
    amountOutstanding: number | string;
    supplier: { name: string };
  }>;
};

export default function PayablesPage() {
  const [data, setData] = useState<Payables | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void adminFetch<Payables>("/api/finance/purchases?resource=payables")
      .then(setData)
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Failed to load.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminPage title="Payables" subtitle="Supplier outstanding">
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
