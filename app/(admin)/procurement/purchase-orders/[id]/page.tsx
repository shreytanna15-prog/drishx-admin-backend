"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  PackageCheck,
  Send,
  X,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton, ListSkeleton } from "@/components/admin-skeletons";
import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
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
import { AdminApiError } from "@/app/lib/admin-api";
import {
  CLOSE_OUTSTANDING_REASONS,
  cancelGoodsReceiptApi,
  closeOutstandingApi,
  closeReasonLabel,
  listGoodsReceipts,
  type GoodsReceiptListRow,
} from "@/app/lib/admin-goods-receipts";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  downloadPurchaseOrderExport,
  fetchPurchaseOrder,
  fetchPurchaseOrderHistory,
  formatPoMoney,
  markPurchaseOrderSentApi,
  openReceiptDocument,
  PO_STATUS_BADGE_CLASS,
  poStatusLabel,
  submitPurchaseOrder,
  type PurchaseOrderDetail,
  type PurchaseOrderHistoryEntry,
} from "@/app/lib/admin-purchase-orders";
import { formatProcDate } from "@/app/lib/admin-procurement";
import {
  buildPoEmailDraft,
  canMarkPoSent,
  PO_SENT_CHANNEL_LABELS,
  PO_SENT_CHANNELS,
  type PoSentChannel,
} from "@/app/lib/purchase-order-sent";
import { formatSupplierAddressLines } from "@/app/lib/purchase-order-supplier";
import { cn } from "@/lib/utils";

type Tab = "details" | "items" | "documents" | "history";
type DialogKind = "approve" | "cancel" | "close" | "sent" | null;

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "details", label: "Details" },
  { key: "items", label: "Items" },
  { key: "documents", label: "Documents" },
  { key: "history", label: "History" },
];

const ERROR_BANNER =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
const SUCCESS_BANNER =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
const FIELD_CLASS =
  "mt-1 h-10 w-full rounded-md border border-(--brand-card-border) bg-(--brand-card) px-3 text-sm text-(--brand-text)";

const HISTORY_LABELS: Record<string, string> = {
  PURCHASE_ORDER_CREATED: "Draft created",
  PURCHASE_ORDER_UPDATED: "Updated",
  PURCHASE_ORDER_SUBMITTED: "Submitted for approval",
  PURCHASE_ORDER_APPROVED: "Approved (open)",
  PURCHASE_ORDER_SENT: "Sent to supplier",
  PURCHASE_ORDER_CANCELLED: "Cancelled",
  PURCHASE_ORDER_OUTSTANDING_CLOSED: "Outstanding closed",
  GOODS_RECEIPT_DRAFTED: "Goods receipt uploaded",
  GOODS_RECEIPT_UPDATED: "Receipt reconciliation saved",
  GOODS_RECEIPT_CONFIRMED: "Receipt confirmed — stock posted",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-(--brand-text-muted)">{label}</div>
      <div className="text-sm font-medium wrap-break-word text-(--brand-text)">{children}</div>
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [receipts, setReceipts] = useState<GoodsReceiptListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<Tab>("details");
  const [history, setHistory] = useState<PurchaseOrderHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState("");

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogError, setDialogError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [closeReason, setCloseReason] = useState<string>(CLOSE_OUTSTANDING_REASONS[0]);
  const [closeDetail, setCloseDetail] = useState("");
  const [sentChannel, setSentChannel] = useState<PoSentChannel>("EMAIL");
  const [sentTo, setSentTo] = useState("");
  const [sentNote, setSentNote] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError("");
      const [poRes, receiptsRes] = await Promise.all([
        fetchPurchaseOrder(id),
        listGoodsReceipts(id),
      ]);
      setPo(poRes.purchaseOrder);
      setReceipts(receiptsRes.receipts);
      setHistory(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load purchase order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "history" || history !== null || !id) return;
    let active = true;
    fetchPurchaseOrderHistory(id)
      .then((res) => {
        if (active) setHistory(res.history);
      })
      .catch((err) => {
        if (active) {
          setHistory([]);
          setHistoryError(err instanceof AdminApiError ? err.message : "Failed to load history.");
        }
      });
    return () => {
      active = false;
    };
  }, [tab, history, id]);

  const totals = useMemo(() => {
    const lines = po?.lines ?? [];
    return {
      ordered: lines.reduce((s, l) => s + l.poQuantity, 0),
      received: lines.reduce((s, l) => s + l.receivedQuantity, 0),
      cancelled: lines.reduce((s, l) => s + l.cancelledQuantity, 0),
      outstanding: lines.reduce((s, l) => s + l.outstandingQuantity, 0),
    };
  }, [po]);

  const status = po?.status ?? "";
  const editable = status === "DRAFT" || status === "PENDING_APPROVAL";
  const approved = status === "OPEN" || status === "SENT" || status === "PARTIALLY_RECEIVED";
  const hasReceipts = (po?.lines ?? []).some((l) => l.receivedQuantity > 0);
  const sendable = po ? canMarkPoSent(po.status, po.sentAt) : false;

  const emailDraft = useMemo(() => {
    if (!po) return null;
    return buildPoEmailDraft({
      publicId: po.publicId,
      supplierName: po.supplier?.name ?? "Supplier",
      supplierEmail: po.supplier?.email ?? null,
      contactPerson: po.supplier?.contactPerson ?? null,
      buyerName: "DrishX",
      expectedDelivery: po.expectedDelivery,
      lineCount: po.lines.length,
      totalQuantity: totals.ordered,
    });
  }, [po, totals.ordered]);

  function openDialog(kind: Exclude<DialogKind, null>) {
    setDialog(kind);
    setDialogError("");
    setError("");
    setNotice("");
    if (kind === "sent") {
      setSentChannel(po?.supplier?.email ? "EMAIL" : "WHATSAPP");
      setSentTo(po?.supplier?.email ?? po?.supplier?.phone ?? "");
      setSentNote("");
    }
    if (kind === "cancel") setCancelReason("");
    if (kind === "close") {
      setCloseReason(CLOSE_OUTSTANDING_REASONS[0]);
      setCloseDetail("");
    }
  }

  async function download(kind: "pdf" | "excel") {
    if (!po) return;
    setBusy(kind);
    setError("");
    try {
      await downloadPurchaseOrderExport(po.id, kind);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Download failed.");
    } finally {
      setBusy("");
    }
  }

  async function submitForReview() {
    if (!po) return;
    setBusy("submit");
    setError("");
    setNotice("");
    try {
      const res = await submitPurchaseOrder(po.id);
      setPo(res.purchaseOrder);
      setNotice("Submitted for approval. Quantities are not reserved until approval.");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Submit failed.");
    } finally {
      setBusy("");
    }
  }

  async function runDialogAction() {
    if (!po || !dialog) return;
    setBusy(dialog);
    setDialogError("");
    try {
      if (dialog === "approve") {
        const res = await approvePurchaseOrder(po.id);
        setPo(res.purchaseOrder);
        setNotice(
          "Approved — the PO is open and its powers are locked against duplicate orders. It has NOT been sent: download the PDF, send it to the supplier, then record it with Mark as sent."
        );
      } else if (dialog === "cancel") {
        if (approved && cancelReason.trim().length < 3) {
          setDialogError("Enter a reason (at least 3 characters).");
          return;
        }
        const res = await cancelPurchaseOrder(po.id, cancelReason.trim() || undefined);
        setPo(res.purchaseOrder);
        setNotice("Purchase order cancelled. Allocated requests returned to the reorder queue.");
      } else if (dialog === "close") {
        if (closeReason === "OTHER" && !closeDetail.trim()) {
          setDialogError("Describe the reason when choosing Other.");
          return;
        }
        await closeOutstandingApi(po.id, closeReason, closeDetail.trim() || undefined);
        setNotice(
          `Closed: ${totals.outstanding} outstanding unit(s) cancelled (${closeReasonLabel(closeReason)}). Reorder can consider these powers again.`
        );
      } else if (dialog === "sent") {
        const res = await markPurchaseOrderSentApi(po.id, {
          channel: sentChannel,
          sentTo: sentTo.trim() || null,
          note: sentNote.trim() || null,
        });
        setPo(res.purchaseOrder);
        setNotice(`${po.publicId} recorded as sent to ${po.supplier?.name ?? "supplier"}.`);
      }
      setDialog(null);
      await load();
    } catch (err) {
      setDialogError(err instanceof AdminApiError ? err.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  async function discardReceipt(receiptId: string) {
    setBusy(`discard:${receiptId}`);
    setError("");
    try {
      await cancelGoodsReceiptApi(receiptId);
      setNotice("Draft receipt discarded. No stock was changed.");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not discard receipt.");
    } finally {
      setBusy("");
    }
  }

  async function viewDocument(receiptId: string, kind: "bill" | "excel") {
    setBusy(`${kind}:${receiptId}`);
    setError("");
    try {
      await openReceiptDocument(receiptId, kind);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not open document.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <AdminPage title="Purchase order" subtitle="Purchase order details">
        <DetailSkeleton />
      </AdminPage>
    );
  }

  if (!po) {
    return (
      <AdminPage title="Purchase order" subtitle="Not found">
        <p className="text-sm text-(--brand-text-muted)">{error || "This purchase order does not exist."}</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/procurement/purchase-orders">Back to list</Link>
        </Button>
      </AdminPage>
    );
  }

  const supplier = po.supplier;
  const supplierAddress = supplier ? formatSupplierAddressLines(supplier) : [];

  return (
    <AdminPage title={po.publicId} subtitle={`${supplier?.name ?? "Supplier"} · ${poStatusLabel(po.status)}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/procurement/purchase-orders">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <Badge variant="outline" className={cn("font-normal", PO_STATUS_BADGE_CLASS[po.status])}>
          {poStatusLabel(po.status)}
        </Badge>
        {approved || status === "CLOSED" ? (
          po.sentAt ? (
            <Badge variant="outline" className="border-indigo-300 bg-indigo-50 font-normal text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
              Sent {formatProcDate(po.sentAt)}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 font-normal text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Not sent to supplier
            </Badge>
          )
        ) : null}
      </div>

      {error ? <p className={cn(ERROR_BANNER, "mb-4")}>{error}</p> : null}
      {notice ? <p className={cn(SUCCESS_BANNER, "mb-4")}>{notice}</p> : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {status === "DRAFT" ? (
          <>
            <Button variant="outline" asChild>
              <Link href={`/procurement/purchase-orders/new?draft=${po.id}`}>Edit draft</Link>
            </Button>
            <Button variant="outline" onClick={() => void submitForReview()} disabled={Boolean(busy)}>
              {busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : null}
              Submit for approval
            </Button>
          </>
        ) : null}
        {editable ? (
          <Button onClick={() => openDialog("approve")} disabled={Boolean(busy)}>
            <Check className="size-4" />
            Approve
          </Button>
        ) : null}
        {sendable ? (
          <Button onClick={() => openDialog("sent")} disabled={Boolean(busy)}>
            <Send className="size-4" />
            Mark as sent
          </Button>
        ) : null}
        {approved ? (
          <Button asChild variant={sendable ? "outline" : "default"}>
            <Link href={`/procurement/purchase-orders/${po.id}/receive`}>
              <PackageCheck className="size-4" />
              Receive shipment
            </Link>
          </Button>
        ) : null}
        {approved && totals.outstanding > 0 ? (
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => openDialog("close")}>
            Close outstanding
          </Button>
        ) : null}
        {status !== "CANCELLED" && status !== "CLOSED" && !hasReceipts ? (
          <Button variant="outline" disabled={Boolean(busy)} onClick={() => openDialog("cancel")}>
            <X className="size-4" />
            Cancel PO
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => void download("pdf")} disabled={Boolean(busy)}>
          {busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          PDF
        </Button>
        <Button variant="outline" onClick={() => void download("excel")} disabled={Boolean(busy)}>
          {busy === "excel" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
          Excel
        </Button>
      </div>

      {status === "OPEN" && !po.sentAt ? (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Approved — waiting to be sent to the supplier</p>
          <p className="mt-1">
            DrishX does not email suppliers automatically. Download the PDF/Excel, send it from
            your email or WhatsApp, then click <strong>Mark as sent</strong> to record it.
          </p>
        </div>
      ) : null}

      <div role="tablist" aria-label="Purchase order sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-(--brand-card-border)">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
              tab === t.key
                ? "border-(--brand-primary) font-medium text-(--brand-text)"
                : "border-transparent text-(--brand-text-muted) hover:text-(--brand-text)"
            )}
          >
            {t.label}
            {t.key === "items" ? ` (${po.lines.length})` : ""}
            {t.key === "documents" && receipts.length ? ` (${receipts.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4 rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Warehouse">{po.warehouseCode}</Field>
              <Field label="Expected delivery">{formatProcDate(po.expectedDelivery)}</Field>
              <Field label="Created">{formatProcDate(po.createdAt)}</Field>
              <Field label="Approved">{po.approvedAt ? formatProcDate(po.approvedAt) : "—"}</Field>
              <Field label="Sent to supplier">
                {po.sentAt
                  ? `${formatProcDate(po.sentAt)} · ${PO_SENT_CHANNEL_LABELS[po.sentVia as PoSentChannel] ?? po.sentVia ?? ""}`
                  : "Not recorded"}
              </Field>
              <Field label="Total amount">{formatPoMoney(po.totalAmount)}</Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Ordered", totals.ordered],
                ["Received", totals.received],
                ["Cancelled", totals.cancelled],
                ["Outstanding", totals.outstanding],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-(--brand-card-border) bg-(--brand-input-bg) px-3 py-2">
                  <div className="text-xs text-(--brand-text-muted)">{label}</div>
                  <div className="text-lg font-semibold tabular-nums text-(--brand-text)">{value}</div>
                </div>
              ))}
            </div>
            {po.sentTo || po.sentNote ? (
              <p className="text-sm text-(--brand-text-muted)">
                {po.sentTo ? <>Sent to <span className="text-(--brand-text)">{po.sentTo}</span>. </> : null}
                {po.sentNote}
              </p>
            ) : null}
            {po.notes ? (
              <p className="text-sm text-(--brand-text-muted)">
                <span className="font-medium text-(--brand-text)">Notes:</span> {po.notes}
              </p>
            ) : null}
            {po.cancelledAt ? (
              <p className="text-sm text-(--brand-text-muted)">
                {status === "CANCELLED" ? "Cancelled" : "Closed"} {formatProcDate(po.cancelledAt)}
                {po.cancelReason ? ` — ${po.cancelReason.replace(/^([A-Z_]+)/, (code) => closeReasonLabel(code))}` : ""}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-(--brand-text)">Supplier details</h2>
              <Link href="/procurement/suppliers" className="text-xs text-(--brand-link) hover:underline">
                Suppliers
              </Link>
            </div>
            {supplier ? (
              <dl className="space-y-2 text-sm">
                <Field label="Name">
                  {supplier.name}
                  {supplier.tradeName ? <span className="text-(--brand-text-muted)"> ({supplier.tradeName})</span> : null}
                </Field>
                <Field label="Contact person">{supplier.contactPerson || "—"}</Field>
                <Field label="Phone">
                  {supplier.phone ? <a className="text-(--brand-link) hover:underline" href={`tel:${supplier.phone}`}>{supplier.phone}</a> : "—"}
                  {supplier.alternatePhone ? <span className="text-(--brand-text-muted)"> · {supplier.alternatePhone}</span> : null}
                </Field>
                <Field label="Email">
                  {supplier.email ? <a className="text-(--brand-link) hover:underline" href={`mailto:${supplier.email}`}>{supplier.email}</a> : "—"}
                </Field>
                <Field label="GSTIN">{supplier.gstin || "—"}</Field>
                <Field label="Address">{supplierAddress.length ? supplierAddress.join(", ") : "—"}</Field>
                {!supplier.isActive ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">This supplier is inactive.</p>
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-(--brand-text-muted)">Supplier not found.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "items" ? (
        <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product / Range / Power</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">PO qty</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Request</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.lineNumber}</TableCell>
                  <TableCell>
                    <div>{line.productLabel || line.lensType}</div>
                    <div className="text-xs text-(--brand-text-muted)">
                      {[line.rangeLabel, line.powerLabel].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.requiredQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.poQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.receivedQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.cancelledQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.outstandingQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPoMoney(line.rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPoMoney(line.amount)}</TableCell>
                  <TableCell>{line.procurementRequest?.publicId ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-5">
          <section className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4">
            <h2 className="text-sm font-semibold text-(--brand-text)">Purchase order documents</h2>
            <p className="mt-1 text-xs text-(--brand-text-muted)">
              Generated from the current PO data each time you download.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void download("pdf")} disabled={Boolean(busy)}>
                <FileText className="size-4" />
                {po.publicId}.pdf
              </Button>
              <Button variant="outline" size="sm" onClick={() => void download("excel")} disabled={Boolean(busy)}>
                <FileSpreadsheet className="size-4" />
                {po.publicId}.xlsx
              </Button>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-(--brand-text)">Goods receipts &amp; supplier documents</h2>
            {receipts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-(--brand-card-border) px-6 py-8 text-center text-sm text-(--brand-text-muted)">
                No shipments received yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Accepted</TableHead>
                      <TableHead>Supplier bill</TableHead>
                      <TableHead>Power-wise Excel</TableHead>
                      <TableHead>Purchase bill</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.publicId}
                          {r.courier || r.awb ? (
                            <div className="text-xs font-normal text-(--brand-text-muted)">
                              {[r.courier, r.awb].filter(Boolean).join(" · ")}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {r.status === "CONFIRMED" ? "Confirmed" : r.status === "CANCELLED" ? "Discarded" : "Draft — not posted"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.acceptedUnits}</TableCell>
                        {(["bill", "excel"] as const).map((kind) => {
                          const stored = kind === "bill" ? r.billStored : r.excelStored;
                          const name = kind === "bill" ? r.billFileName : r.excelFileName;
                          return (
                            <TableCell key={kind}>
                              {stored ? (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto max-w-48 p-0"
                                  disabled={busy === `${kind}:${r.id}`}
                                  onClick={() => void viewDocument(r.id, kind)}
                                >
                                  <span className="truncate">{name ?? "View"}</span>
                                  <ExternalLink className="size-3.5 shrink-0" />
                                </Button>
                              ) : (
                                <span className="text-xs text-red-700 dark:text-red-300">Not stored</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          {r.purchaseBill ? (
                            <Link href="/finance/purchases" className="text-(--brand-link) hover:underline">
                              {r.purchaseBill.billNumber}
                              <span className="text-xs text-(--brand-text-muted)"> · {r.purchaseBill.status.toLowerCase()}</span>
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-(--brand-text-muted)">
                          Uploaded {formatProcDate(r.createdAt)}
                          {r.confirmedAt ? <div>Confirmed {formatProcDate(r.confirmedAt)}</div> : null}
                        </TableCell>
                        <TableCell>
                          {r.status === "DRAFT" || r.status === "VALIDATED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(busy)}
                              onClick={() => void discardReceipt(r.id)}
                            >
                              {busy === `discard:${r.id}` ? <Loader2 className="size-4 animate-spin" /> : null}
                              Discard
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === "history" ? (
        history === null ? (
          <ListSkeleton compact rows={5} />
        ) : historyError ? (
          <p className={ERROR_BANNER}>{historyError}</p>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-(--brand-card-border) px-6 py-8 text-center text-sm text-(--brand-text-muted)">
            No recorded events yet.
          </div>
        ) : (
          <ol className="space-y-3">
            {history.map((event) => (
              <li key={event.id} className="rounded-lg border border-(--brand-card-border) bg-(--brand-card) px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-(--brand-text)">
                    {HISTORY_LABELS[event.action] ?? event.action.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <time className="text-xs text-(--brand-text-muted)" dateTime={event.occurredAt}>
                    {new Date(event.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                {event.message ? <p className="mt-0.5 text-sm text-(--brand-text-muted)">{event.message}</p> : null}
                <p className="mt-0.5 text-xs text-(--brand-text-muted)">By {event.actorName ?? (event.actorUserId ? "Staff user" : "System")}</p>
              </li>
            ))}
          </ol>
        )
      ) : null}

      <AdminConfirmDialog
        open={dialog === "approve"}
        title={`Approve ${po.publicId}?`}
        description={
          <>
            Approving opens the PO for {po.lines.length} power(s), {totals.ordered} unit(s). Each power is
            locked so no other PO can be approved for it until this one is closed, and matching
            procurement requests are allocated. Stock is not changed and the PO is not sent.
          </>
        }
        confirmLabel="Approve"
        busy={busy === "approve"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => void runDialogAction()}
      />

      <AdminConfirmDialog
        open={dialog === "cancel"}
        title={`Cancel ${po.publicId}?`}
        tone="destructive"
        description={
          approved
            ? "Approved quantities are released: power locks are removed and allocated requests return to the reorder queue. This cannot be undone."
            : "The draft will be cancelled. Nothing was reserved."
        }
        confirmLabel="Cancel purchase order"
        cancelLabel="Keep PO"
        busy={busy === "cancel"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => void runDialogAction()}
      >
        <label className="block text-sm">
          <span className="text-(--brand-text-muted)">Reason{approved ? " (required)" : " (optional)"}</span>
          <Input className="mt-1" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={500} />
        </label>
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={dialog === "close"}
        title="Close outstanding quantity"
        description={`${po.publicId} — the remaining outstanding units are cancelled with a reason. Receipt history is kept and the PO closes.`}
        confirmLabel="Close outstanding"
        busy={busy === "close"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => void runDialogAction()}
      >
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          {[
            ["Ordered", totals.ordered],
            ["Received", totals.received],
            ["Will cancel", totals.cancelled + totals.outstanding],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-md border border-(--brand-card-border) bg-(--brand-input-bg) py-2">
              <div className="text-xs text-(--brand-text-muted)">{label}</div>
              <div className="font-semibold tabular-nums text-(--brand-text)">{value}</div>
            </div>
          ))}
        </div>
        <label className="block text-sm">
          <span className="text-(--brand-text-muted)">Reason</span>
          <select className={FIELD_CLASS} value={closeReason} onChange={(e) => setCloseReason(e.target.value)}>
            {CLOSE_OUTSTANDING_REASONS.map((code) => (
              <option key={code} value={code}>
                {closeReasonLabel(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-(--brand-text-muted)">Detail{closeReason === "OTHER" ? " (required)" : " (optional)"}</span>
          <Input className="mt-1" value={closeDetail} onChange={(e) => setCloseDetail(e.target.value)} maxLength={500} />
        </label>
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={dialog === "sent"}
        title={`Mark ${po.publicId} as sent`}
        description="Record how this approved PO reached the supplier. Only confirm after it was actually sent."
        confirmLabel="Confirm sent"
        busy={busy === "sent"}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => void runDialogAction()}
      >
        {emailDraft?.mailto ? (
          <div className="rounded-md border border-(--brand-card-border) bg-(--brand-input-bg) p-3 text-xs text-(--brand-text-muted)">
            <p>
              Need to send it now? Download the PDF, then open a pre-filled email in your mail app and
              attach it. Opening the draft does not mark the PO as sent.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void download("pdf")}>
                <Download className="size-4" />
                Download PDF
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={emailDraft.mailto}>
                  <Mail className="size-4" />
                  Open email draft
                </a>
              </Button>
            </div>
          </div>
        ) : null}
        <label className="block text-sm">
          <span className="text-(--brand-text-muted)">Sent via</span>
          <select
            className={FIELD_CLASS}
            value={sentChannel}
            onChange={(e) => setSentChannel(e.target.value as PoSentChannel)}
          >
            {PO_SENT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {PO_SENT_CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-(--brand-text-muted)">
            {sentChannel === "EMAIL" ? "Email address (required)" : "Sent to (optional)"}
          </span>
          <Input className="mt-1" value={sentTo} onChange={(e) => setSentTo(e.target.value)} maxLength={200} />
        </label>
        <label className="block text-sm">
          <span className="text-(--brand-text-muted)">Note{sentChannel === "OTHER" ? " (required)" : " (optional)"}</span>
          <Input className="mt-1" value={sentNote} onChange={(e) => setSentNote(e.target.value)} maxLength={500} />
        </label>
      </AdminConfirmDialog>
    </AdminPage>
  );
}
