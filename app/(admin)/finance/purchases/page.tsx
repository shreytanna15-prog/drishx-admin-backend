"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Paperclip } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createPurchaseBill,
  createPurchaseSupplier,
  getPurchaseBillDocumentUrl,
  listPurchaseBills,
  listPurchaseSuppliers,
  uploadPurchaseBillDocument,
  type PurchaseBill,
  type PurchaseSupplier,
} from "@/app/lib/admin-finance-purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";

export default function PurchasesPage() {
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [billsHasMore, setBillsHasMore] = useState(false);
  const [suppliers, setSuppliers] = useState<PurchaseSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [desc, setDesc] = useState("Lens procurement");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("100");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [docBusy, setDocBusy] = useState("");
  const attachFor = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function viewDocument(billId: string) {
    setDocBusy(billId);
    setError("");
    try {
      const url = await getPurchaseBillDocumentUrl(billId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not open document.");
    } finally {
      setDocBusy("");
    }
  }

  async function attachDocument(file: File | null) {
    const billId = attachFor.current;
    if (!file || !billId) return;
    setDocBusy(billId);
    setError("");
    setNotice("");
    try {
      await uploadPurchaseBillDocument(billId, file);
      setNotice("Bill document stored.");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Upload failed.");
    } finally {
      setDocBusy("");
      attachFor.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        listPurchaseBills(),
        listPurchaseSuppliers(),
      ]);
      setBills(b.bills);
      setBillsHasMore(b.hasMore);
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
      const s = await createPurchaseSupplier({
        name: supplierName,
        state: "Gujarat",
        stateCode: "24",
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
      await createPurchaseBill({
        supplierId,
        post: true,
        lines: [
          {
            description: desc,
            quantity: Number(qty),
            unitPrice: Number(rate),
          },
        ],
      });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title="Purchases"
      subtitle={
        billsHasMore
          ? "Supplier purchase bills with input GST (showing up to 100 by newest bill date; more exist)"
          : "Supplier purchase bills with input GST (list: up to 100, newest bill date first)"
      }
    >
      {error ? (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {notice}
        </p>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void attachDocument(e.target.files?.[0] ?? null)}
      />
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={createSupplier}
          className="space-y-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4"
        >
          <p className="text-sm font-semibold">Quick add supplier</p>
          <p className="text-xs text-(--brand-text-muted)">
            For GST, address and contact details use{" "}
            <Link href="/procurement/suppliers" className="text-(--brand-link) hover:underline">
              Suppliers
            </Link>
            .
          </p>
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
          <AdminSelect
            value={supplierId}
            onValueChange={setSupplierId}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="Select supplier"
          />
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
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Supplier bill</th>
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
                  <td className="px-4 py-3">{b.status === "DRAFT" ? "Draft — review" : b.status}</td>
                  <td className="px-4 py-3 text-xs text-(--brand-text-muted)">
                    {[b.poReference, b.grnReference].filter(Boolean).join(" · ") || "Manual"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {b.documentStoragePath ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto max-w-44 p-0"
                          disabled={docBusy === b.id}
                          onClick={() => void viewDocument(b.id)}
                        >
                          <span className="truncate">{b.documentFileName ?? "View"}</span>
                          <ExternalLink className="size-3.5 shrink-0" />
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={Boolean(docBusy)}
                        onClick={() => {
                          attachFor.current = b.id;
                          fileRef.current?.click();
                        }}
                        aria-label={`${b.documentStoragePath ? "Replace" : "Attach"} bill document for ${b.billNumber}`}
                      >
                        {docBusy === b.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Paperclip className="size-4" />
                        )}
                        {b.documentStoragePath ? "Replace" : "Attach PDF"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
