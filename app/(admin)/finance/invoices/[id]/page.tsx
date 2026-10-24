"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatInvoiceMoney,
  openAdminInvoiceTaxPdf,
} from "@/app/lib/admin-invoices";

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  amount: number | string;
  amountPaid: number | string;
  amountOutstanding: number | string;
  status: string;
  taxableAmount: number | string;
  cgstAmount: number | string;
  sgstAmount: number | string;
  igstAmount: number | string;
  isInterState: boolean;
  placeOfSupplyState: string | null;
  taxIncomplete: boolean;
  userId: string;
  user: {
    businessName: string | null;
    name: string | null;
    email: string;
    creditLimit: number | string | null;
  };
  lines: Array<{
    id: string;
    description: string;
    powerLabel: string | null;
    hsnCode: string | null;
    quantity: number | string;
    unitPrice: number | string;
    gstRatePercent: number | string;
    taxableAmount: number | string;
    lineTotal: number | string;
  }>;
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    void adminFetch<InvoiceDetail>(`/api/invoices/${id}`)
      .then((d) => {
        setInvoice(d);
        setPayAmount(String(Number(d.amountOutstanding) || ""));
      })
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Failed to load.")
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function recordPayment() {
    if (!invoice) return;
    setBusy(true);
    try {
      await adminFetch("/api/finance/payments", {
        method: "POST",
        body: JSON.stringify({
          customerId: invoice.userId,
          amount: Number(payAmount),
          mode: "UPI",
          reference: payRef,
          allocations: [{ invoiceId: invoice.id, amount: Number(payAmount) }],
        }),
      });
      const refreshed = await adminFetch<InvoiceDetail>(`/api/invoices/${id}`);
      setInvoice(refreshed);
      setPayAmount(String(Number(refreshed.amountOutstanding) || ""));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openTaxInvoicePdf() {
    if (!invoice || pdfBusy) return;
    setError("");
    setPdfBusy(true);
    // Open blank tab synchronously so popup blockers allow the later blob URL.
    const popup =
      typeof window !== "undefined"
        ? window.open("about:blank", "_blank")
        : null;
    try {
      await openAdminInvoiceTaxPdf(invoice.id, { popup });
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to open tax invoice."
      );
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <AdminPage
      title={invoice?.invoiceNumber ?? "Invoice"}
      subtitle="Tax invoice detail"
    >
      <Link
        href="/finance/invoices"
        className="mb-4 inline-block text-sm text-(--brand-primary) hover:underline"
      >
        ← Invoices
      </Link>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading || !invoice ? (
        <DetailSkeleton cards={2} />
      ) : (
        <div className="space-y-5">
          {invoice.taxIncomplete ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Tax used company defaults (HSN/GST). Configure product HSN in catalog or Finance Settings.
            </p>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <p className="text-xs uppercase text-(--brand-label)">Customer</p>
              <p className="mt-1 font-semibold">
                {invoice.user.businessName || invoice.user.name || invoice.user.email}
              </p>
              <p className="mt-3 text-xs uppercase text-(--brand-label)">Status</p>
              <p className="font-semibold">{invoice.status}</p>
              <p className="mt-3 text-xs uppercase text-(--brand-label)">Place of supply</p>
              <p>
                {invoice.placeOfSupplyState || "—"}{" "}
                ({invoice.isInterState ? "IGST" : "CGST+SGST"})
              </p>
            </div>
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <p className="text-sm">
                Taxable {formatInvoiceMoney(invoice.taxableAmount)} · CGST{" "}
                {formatInvoiceMoney(invoice.cgstAmount)} · SGST{" "}
                {formatInvoiceMoney(invoice.sgstAmount)} · IGST{" "}
                {formatInvoiceMoney(invoice.igstAmount)}
              </p>
              <p className="mt-2 text-2xl font-bold">
                {formatInvoiceMoney(invoice.amount)}
              </p>
              <p className="text-sm text-(--brand-text-muted)">
                Paid {formatInvoiceMoney(invoice.amountPaid)} · Outstanding{" "}
                {formatInvoiceMoney(invoice.amountOutstanding)}
              </p>
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                disabled={pdfBusy}
                onClick={() => void openTaxInvoicePdf()}
              >
                {pdfBusy ? "Opening…" : "Open tax invoice PDF"}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--brand-card-border) text-left text-(--brand-label)">
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">HSN</th>
                  <th className="px-4 py-2">Qty</th>
                  <th className="px-4 py-2">Rate</th>
                  <th className="px-4 py-2">GST%</th>
                  <th className="px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-(--brand-card-border)">
                    <td className="px-4 py-2">
                      {l.description}
                      {l.powerLabel ? (
                        <span className="block text-xs text-(--brand-label)">
                          {l.powerLabel}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">{l.hsnCode}</td>
                    <td className="px-4 py-2">{Number(l.quantity)}</td>
                    <td className="px-4 py-2">{formatInvoiceMoney(l.unitPrice)}</td>
                    <td className="px-4 py-2">{Number(l.gstRatePercent)}%</td>
                    <td className="px-4 py-2">{formatInvoiceMoney(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Number(invoice.amountOutstanding) > 0 ? (
            <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <label className="text-sm">
                Record payment
                <Input
                  className="mt-1 w-36"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </label>
              <label className="text-sm">
                UTR / ref
                <Input
                  className="mt-1 w-48"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                />
              </label>
              <Button disabled={busy} onClick={() => void recordPayment()}>
                Save payment
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </AdminPage>
  );
}
