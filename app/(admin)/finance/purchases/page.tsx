"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Supplier = { id: string; name: string; gstin: string | null; state: string | null };
type Bill = {
  id: string;
  billNumber: string;
  totalAmount: number | string;
  status: string;
  supplier: { name: string };
};

export default function PurchasesPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [desc, setDesc] = useState("Lens procurement");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("100");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        adminFetch<Bill[]>("/api/finance/purchases"),
        adminFetch<Supplier[]>("/api/finance/purchases?resource=suppliers"),
      ]);
      setBills(b);
      setSuppliers(s);
      if (s[0] && !supplierId) setSupplierId(s[0].id);
      setError("");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSupplier(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await adminFetch<Supplier>("/api/finance/purchases", {
        method: "POST",
        body: JSON.stringify({
          action: "create-supplier",
          name: supplierName,
          state: "Gujarat",
          stateCode: "24",
        }),
      });
      setSupplierName("");
      setSupplierId(s.id);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  async function createBill(e: FormEvent) {
    e.preventDefault();
    if (!supplierId) return;
    setSaving(true);
    try {
      await adminFetch("/api/finance/purchases", {
        method: "POST",
        body: JSON.stringify({
          action: "create-bill",
          supplierId,
          post: true,
          lines: [
            {
              description: desc,
              quantity: Number(qty),
              unitPrice: Number(rate),
            },
          ],
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title="Purchases" subtitle="Supplier purchase bills with input GST">
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={createSupplier}
          className="space-y-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4"
        >
          <p className="text-sm font-semibold">Add supplier</p>
          <Input
            placeholder="Supplier name"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            required
          />
          <Button type="submit" disabled={saving} size="sm">
            Create supplier
          </Button>
        </form>
        <form
          onSubmit={createBill}
          className="space-y-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4"
        >
          <p className="text-sm font-semibold">Post purchase bill</p>
          <select
            className="w-full rounded-md border border-(--brand-card-border) bg-transparent px-3 py-2 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex gap-2">
            <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
            <Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate" />
          </div>
          <Button type="submit" disabled={saving || !supplierId} size="sm">
            Post bill
          </Button>
        </form>
      </div>
      {loading ? (
        <TableSkeleton compact columns={4} rows={5} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--brand-card-border) text-left text-(--brand-label)">
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="border-b border-(--brand-card-border)">
                  <td className="px-4 py-3">{b.billNumber}</td>
                  <td className="px-4 py-3">{b.supplier.name}</td>
                  <td className="px-4 py-3">
                    ₹{Number(b.totalAmount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
