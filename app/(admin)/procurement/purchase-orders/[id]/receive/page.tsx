"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
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
  cancelGoodsReceiptApi,
  confirmGoodsReceiptApi,
  createDraftReceiptMultipart,
  LINE_STATUS_CLASS,
  patchGoodsReceipt,
  type GoodsReceiptDetail,
} from "@/app/lib/admin-goods-receipts";
import { cn } from "@/lib/utils";

type Step = "upload" | "reconcile" | "confirm";

export default function ReceiveGoodsPage() {
  const params = useParams();
  const router = useRouter();
  const poId = typeof params.id === "string" ? params.id : "";

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<GoodsReceiptDetail | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [courier, setCourier] = useState("");
  const [awb, setAwb] = useState("");
  const [billProduct, setBillProduct] = useState("");
  const [billRange, setBillRange] = useState("");
  const [billQty, setBillQty] = useState("");
  const [billRows, setBillRows] = useState<
    Array<{ productLabel: string; rangeLabel: string; billQuantity: number }>
  >([]);
  const [tab, setTab] = useState("ALL");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  /** One idempotency key per receipt: retries after a network error re-use it. */
  const confirmKeyRef = useRef<{ receiptId: string; key: string } | null>(null);

  const filteredLines = useMemo(() => {
    const lines = receipt?.lines ?? [];
    if (tab === "ALL") return lines;
    return lines.filter((l) => l.lineStatus === tab);
  }, [receipt, tab]);

  async function uploadAndValidate() {
    if (!excelFile || !billFile) {
      setError("Both documents are required: the supplier bill and the power-wise Excel.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("excel", excelFile);
      form.set("bill", billFile);
      form.set(
        "shipment",
        JSON.stringify({
          courier: courier || null,
          awb: awb || null,
        })
      );
      form.set("billSummaries", JSON.stringify(billRows));
      const res = await createDraftReceiptMultipart(poId, form);
      setReceipt(res.receipt);
      setStep("reconcile");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function addBillRow() {
    const qty = Number(billQty);
    if (!billProduct.trim() || !Number.isInteger(qty) || qty < 0) {
      setError("Bill summary needs product label and a whole-number quantity.");
      return;
    }
    setBillRows((prev) => [
      ...prev,
      {
        productLabel: billProduct.trim(),
        rangeLabel: billRange.trim(),
        billQuantity: qty,
      },
    ]);
    setBillProduct("");
    setBillRange("");
    setBillQty("");
    setError("");
  }

  async function saveLineEdits(): Promise<boolean> {
    if (!receipt) return false;
    setBusy(true);
    setError("");
    try {
      const res = await patchGoodsReceipt(receipt.id, {
        lineUpdates: receipt.lines.map((l) => ({
          id: l.id,
          acceptedQuantity: l.acceptedQuantity,
          damagedQuantity: l.damagedQuantity,
          actionCode: l.actionCode,
        })),
        billResolutions: receipt.billSummaries.map((b) => ({
          id: b.id,
          resolution: b.resolution,
        })),
      });
      setReceipt(res.receipt);
      return true;
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Discard the draft receipt (no stock change) and go back to upload. */
  async function discardDraft() {
    if (!receipt) return;
    setBusy(true);
    setError("");
    try {
      await cancelGoodsReceiptApi(receipt.id);
      setReceipt(null);
      confirmKeyRef.current = null;
      setStep("upload");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not discard the draft receipt.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReceipt() {
    if (!receipt) return;
    setBusy(true);
    setConfirmError("");
    try {
      if (confirmKeyRef.current?.receiptId !== receipt.id) {
        confirmKeyRef.current = {
          receiptId: receipt.id,
          key:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `grn-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        };
      }
      const res = await confirmGoodsReceiptApi(receipt.id, confirmKeyRef.current.key);
      setReceipt(res.receipt);
      setConfirmOpen(false);
      router.push(`/procurement/purchase-orders/${poId}`);
    } catch (err) {
      setConfirmError(
        err instanceof AdminApiError
          ? err.message
          : "Confirm failed. Nothing was posted — you can retry safely."
      );
    } finally {
      setBusy(false);
    }
  }

  function updateLine(
    id: string,
    patch: Partial<GoodsReceiptDetail["lines"][number]>
  ) {
    setReceipt((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
          }
        : prev
    );
  }

  return (
    <AdminPage
      title="Receive goods"
      subtitle="Upload the supplier bill + power-wise Excel, validate and reconcile, then confirm — stock updates only on Confirm Receipt."
    >
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/procurement/purchase-orders/${poId}`}>
            <ArrowLeft className="size-4" />
            Back to PO
          </Link>
        </Button>
      </div>

      <ol className="mb-6 flex flex-wrap gap-2 text-sm">
        {(
          [
            ["upload", "1. Upload"],
            ["reconcile", "2. Reconcile"],
            ["confirm", "3. Confirm"],
          ] as const
        ).map(([key, label]) => (
          <li
            key={key}
            className={cn(
              "rounded-md border px-3 py-1",
              step === key
                ? "border-(--brand-text) bg-(--brand-input-bg) font-medium text-(--brand-text)"
                : "border-(--brand-card-border) text-(--brand-text-muted)"
            )}
          >
            {label}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {step === "upload" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-(--brand-text)">
                Power-wise Excel (.xlsx) *
              </span>
              <Input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              />
              <span className="text-xs text-(--brand-text-muted)">
                Columns: lensType, lensId, quantity (optional: product, range,
                power, damaged). Mapping is configurable when the client template
                arrives.
              </span>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-(--brand-text)">
                Supplier bill (PDF / image) *
              </span>
              <Input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setBillFile(e.target.files?.[0] ?? null)}
              />
              <span className="text-xs text-(--brand-text-muted)">
                Required. Stored privately before the receipt is created; if
                storage is unavailable nothing is saved. Bill quantities are
                entered below (no automatic PDF reading).
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-(--brand-text-muted)">Courier</span>
              <Input value={courier} onChange={(e) => setCourier(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="text-(--brand-text-muted)">AWB / Tracking</span>
              <Input value={awb} onChange={(e) => setAwb(e.target.value)} />
            </label>
          </div>

          <div className="rounded-lg border border-(--brand-card-border) p-4">
            <h3 className="mb-2 text-sm font-semibold text-(--brand-text)">
              Bill line summaries (range-wise)
            </h3>
            <div className="mb-3 grid gap-2 sm:grid-cols-4">
              <Input
                placeholder="Product"
                value={billProduct}
                onChange={(e) => setBillProduct(e.target.value)}
              />
              <Input
                placeholder="Range"
                value={billRange}
                onChange={(e) => setBillRange(e.target.value)}
              />
              <Input
                placeholder="Bill qty"
                type="number"
                min={0}
                value={billQty}
                onChange={(e) => setBillQty(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addBillRow}>
                Add bill row
              </Button>
            </div>
            {billRows.length ? (
              <ul className="space-y-1 text-sm text-(--brand-text-muted)">
                {billRows.map((r, i) => (
                  <li key={`${r.productLabel}-${i}`}>
                    {r.productLabel}
                    {r.rangeLabel ? ` · ${r.rangeLabel}` : ""} — {r.billQuantity}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-(--brand-text-muted)">
                Optional — add rows to reconcile bill totals vs Excel by range.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void uploadAndValidate()}
              disabled={busy || !excelFile || !billFile}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Upload &amp; validate documents
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/procurement/purchase-orders/${poId}`}>Cancel</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {step === "reconcile" && receipt ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {["ALL", "MATCHED", "SHORT", "EXTRA", "INVALID", "DAMAGED"].map(
              (t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={tab === t ? "default" : "outline"}
                  onClick={() => setTab(t)}
                >
                  {t}
                </Button>
              )
            )}
          </div>

          <AdminTable className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Power</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Prev recv</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Damaged</TableHead>
                  <TableHead className="text-right">Short</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div>{line.productLabel || line.lensType}</div>
                      <div className="text-xs text-(--brand-text-muted)">
                        {line.powerLabel || line.lensId}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {line.orderedQuantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.previouslyReceived}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.deliveredQuantity}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        className="ml-auto w-20 text-right"
                        value={line.acceptedQuantity}
                        disabled={receipt.status === "CONFIRMED"}
                        onChange={(e) =>
                          updateLine(line.id, {
                            acceptedQuantity: Math.max(
                              0,
                              Math.trunc(Number(e.target.value) || 0)
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        className="ml-auto w-20 text-right"
                        value={line.damagedQuantity}
                        disabled={receipt.status === "CONFIRMED"}
                        onChange={(e) =>
                          updateLine(line.id, {
                            damagedQuantity: Math.max(
                              0,
                              Math.trunc(Number(e.target.value) || 0)
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {line.shortQuantity}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          LINE_STATUS_CLASS[line.lineStatus]
                        )}
                      >
                        {line.lineStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AdminSelect
                        value={line.actionCode ?? "KEEP_PENDING"}
                        disabled={receipt.status === "CONFIRMED"}
                        onValueChange={(v) =>
                          updateLine(line.id, { actionCode: v })
                        }
                        options={[
                          { value: "KEEP_PENDING", label: "Keep pending" },
                          { value: "MARK_DAMAGED", label: "Mark damaged" },
                          { value: "ACCEPT_SHORT", label: "Accept short" },
                          { value: "REJECT_EXTRA", label: "Reject excess" },
                        ]}
                        size="sm"
                        triggerClassName="h-9 min-w-[9rem] rounded-md px-2"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>

          {receipt.billSummaries.length > 0 ? (
            <AdminTable className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / Range</TableHead>
                    <TableHead className="text-right">Bill qty</TableHead>
                    <TableHead className="text-right">Excel qty</TableHead>
                    <TableHead className="text-right">Diff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resolution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.billSummaries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.productLabel}
                        {row.rangeLabel ? ` · ${row.rangeLabel}` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.billQuantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.excelQuantity}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.difference}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-normal",
                            row.difference === 0
                              ? LINE_STATUS_CLASS.MATCHED
                              : LINE_STATUS_CLASS.INVALID
                          )}
                        >
                          {row.difference === 0 ? "Matched" : "Mismatch"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <AdminSelect
                          value={row.resolution ?? ""}
                          disabled={row.difference === 0}
                          aria-label={`Resolution for ${row.productLabel}`}
                          onValueChange={(v) =>
                            setReceipt((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    billSummaries: prev.billSummaries.map((b) =>
                                      b.id === row.id
                                        ? {
                                            ...b,
                                            resolution: v || null,
                                          }
                                        : b
                                    ),
                                  }
                                : prev
                            )
                          }
                          options={[
                            { value: "", label: "Unresolved" },
                            {
                              value: "BILL_CORRECTION",
                              label: "Bill correction",
                            },
                            {
                              value: "EXCEL_CORRECTION",
                              label: "Excel correction",
                            },
                            { value: "ACCEPT_EXCEL", label: "Accept Excel" },
                            { value: "KEEP_PENDING", label: "Keep pending" },
                          ]}
                          size="sm"
                          triggerClassName="h-9 min-w-[9rem] rounded-md px-2"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void discardDraft()}
            >
              Discard &amp; re-upload
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void saveLineEdits()}
            >
              Save as draft
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void saveLineEdits().then((ok) => {
                  if (ok) setStep("confirm");
                });
              }}
            >
              Next: review confirmation
            </Button>
          </div>
        </div>
      ) : null}

      {step === "confirm" && receipt ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-(--brand-card-border) bg-(--brand-input-bg) p-4 text-sm text-(--brand-text)">
            <p>
              <strong>{receipt.confirmSummary.acceptedUnits}</strong> unit(s) will
              be added to stock.
            </p>
            <p className="mt-1 text-(--brand-text-muted)">
              {receipt.confirmSummary.remainingOutstanding} unit(s) remain
              outstanding against {receipt.purchaseOrder.publicId} after this
              receipt. Damaged and excess quantities are not posted.
            </p>
            <p className="mt-1 text-(--brand-text-muted)">
              Documents: supplier bill {receipt.billStored ? "stored" : "missing"} ·
              power-wise Excel {receipt.excelStored ? "stored" : "missing"}
            </p>
          </div>
          {receipt.confirmBlockers.length ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" />
                Resolve before confirming
              </p>
              <ul className="mt-1 list-disc pl-6">
                {receipt.confirmBlockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("reconcile")}>
              Back to reconcile
            </Button>
            <Button
              type="button"
              disabled={busy || !receipt.canConfirm}
              onClick={() => {
                setConfirmError("");
                setConfirmOpen(true);
              }}
            >
              Confirm receipt
            </Button>
          </div>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={confirmOpen && Boolean(receipt)}
        title="Confirm receipt?"
        description={
          <>
            <p>{receipt?.confirmSummary.acceptedUnits ?? 0} units will be added to stock.</p>
            <p className="mt-1">
              {receipt?.confirmSummary.remainingOutstanding ?? 0} units remain outstanding
              against {receipt?.purchaseOrder.publicId}.
            </p>
            <p className="mt-1">
              {receipt?.billSummaries.length
                ? "Bill quantity has been reconciled."
                : "No range-wise bill totals were entered."}{" "}
              Continue? Stock is posted once and cannot be posted again.
            </p>
          </>
        }
        confirmLabel="Confirm & update stock"
        busy={busy}
        error={confirmError}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmReceipt()}
      />
    </AdminPage>
  );
}
