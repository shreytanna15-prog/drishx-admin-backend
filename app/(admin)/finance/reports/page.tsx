"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";

type GstSummary = {
  financialYear: string;
  output: { taxable: number; cgst: number; sgst: number; igst: number; totalGst: number };
  input: { taxable: number; cgst: number; sgst: number; igst: number; totalGst: number };
  netGstPayable: number;
};

type HsnRow = { hsn: string; description: string; qty: number; taxable: number; gst: number };
type PowerRow = { power: string; qty: number; sales: number };

export default function FinanceReportsPage() {
  const [gst, setGst] = useState<GstSummary | null>(null);
  const [hsn, setHsn] = useState<HsnRow[]>([]);
  const [power, setPower] = useState<PowerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      adminFetch<GstSummary>("/api/finance/reports?report=gst-summary"),
      adminFetch<{ rows: HsnRow[] }>("/api/finance/reports?report=hsn"),
      adminFetch<{ rows: PowerRow[] }>("/api/finance/reports?report=power-wise"),
    ])
      .then(([g, h, p]) => {
        setGst(g);
        setHsn(h.rows);
        setPower(p.rows.slice(0, 20));
      })
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Failed to load.")
      )
      .finally(() => setLoading(false));
  }, []);

  const money = (n: number) =>
    `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  return (
    <AdminPage title="GST & Reports" subtitle="Output / input GST, HSN, power-wise sales">
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading || !gst ? (
        <TableSkeleton />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-(--brand-text-muted)">
            Financial year {gst.financialYear}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <p className="text-xs uppercase text-(--brand-label)">Output GST</p>
              <p className="mt-2 text-xl font-bold">{money(gst.output.totalGst)}</p>
            </div>
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <p className="text-xs uppercase text-(--brand-label)">Input GST</p>
              <p className="mt-2 text-xl font-bold">{money(gst.input.totalGst)}</p>
            </div>
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <p className="text-xs uppercase text-(--brand-label)">Net GST</p>
              <p className="mt-2 text-xl font-bold">{money(gst.netGstPayable)}</p>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">HSN-wise sales</h2>
            <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--brand-card-border) text-left text-(--brand-label)">
                    <th className="px-4 py-2">HSN</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Taxable</th>
                    <th className="px-4 py-2">GST</th>
                  </tr>
                </thead>
                <tbody>
                  {hsn.map((r) => (
                    <tr key={r.hsn} className="border-b border-(--brand-card-border)">
                      <td className="px-4 py-2">{r.hsn}</td>
                      <td className="px-4 py-2">{r.qty}</td>
                      <td className="px-4 py-2">{money(r.taxable)}</td>
                      <td className="px-4 py-2">{money(r.gst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Power-wise sales</h2>
            <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--brand-card-border) text-left text-(--brand-label)">
                    <th className="px-4 py-2">Power</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {power.map((r) => (
                    <tr key={r.power} className="border-b border-(--brand-card-border)">
                      <td className="px-4 py-2">{r.power}</td>
                      <td className="px-4 py-2">{r.qty}</td>
                      <td className="px-4 py-2">{money(r.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
