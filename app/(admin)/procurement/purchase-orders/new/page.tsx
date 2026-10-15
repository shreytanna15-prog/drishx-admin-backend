"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
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
  createPurchaseOrderDraft,
  downloadPoImportTemplate,
  fetchPurchaseOrder,
  fetchPurchaseOrders,
  fetchReorderQueue,
  formatPoMoney,
  importPurchaseOrderLines,
  submitPurchaseOrder,
  updatePurchaseOrderDraft,
  type ReorderQueueItem,
} from "@/app/lib/admin-purchase-orders";
import { LENS_TYPE_LABELS, PRIORITY_BADGE_CLASS } from "@/app/lib/admin-procurement";
import {
  DUPLICATE_IMPORT_CONFIRM_MESSAGE,
  PO_WIZARD_STEPS,
  contributedProcurementRequestIds,
  decideDuplicateImport,
  fingerprintImportBytes,
  formatCountLabel,
  importNoticeShouldClear,
  mergePoWizardLines,
  poWizardBackAction,
  poWizardLineAmountDisplay,
  poWizardLineError,
  poWizardSummaryAmountLabel,
  poWizardSummaryValidationMessage,
  pruneImportFingerprints,
  summarizePoWizardLines,
  type PoWizardDraftLine,
} from "@/app/lib/purchase-order-wizard";
import { cn } from "@/lib/utils";

type LineForm = PoWizardDraftLine;

const ERROR_BANNER =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
const SELECT_CLASS =
  "h-9 w-full rounded-md border border-(--brand-card-border) bg-(--brand-card) px-3 text-sm text-(--brand-text)";

function powerKeyOf(line: { lensType: string; lensId: string }) {
  return `${line.lensType}::${line.lensId}`;
}

function NewPurchaseOrderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draft");

  const [step, setStep] = useState<"select" | "review">(draftId ? "review" : "select");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [error, setError] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importNotice, setImportNotice] = useState("");
  const [importNoticeKeys, setImportNoticeKeys] = useState<string[]>([]);
  const [importedFingerprints, setImportedFingerprints] = useState<Set<string>>(
    () => new Set()
  );
  const [importing, setImporting] = useState(false);
  const [queue, setQueue] = useState<ReorderQueueItem[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouseCodes, setWarehouseCodes] = useState<string[]>(["MAIN"]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<LineForm[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseCode, setWarehouseCode] = useState("MAIN");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [queueQuery, setQueueQuery] = useState("");
  const [draftPublicId, setDraftPublicId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const [queueRes, listRes] = await Promise.all([fetchReorderQueue(), fetchPurchaseOrders()]);
      setQueue(queueRes.queue);
      setSuppliers(listRes.suppliers);
      setWarehouseCodes(listRes.warehouseCodes.length ? listRes.warehouseCodes : ["MAIN"]);
      if (draftId) {
        const { purchaseOrder: po } = await fetchPurchaseOrder(draftId);
        if (po.status !== "DRAFT" && po.status !== "PENDING_APPROVAL") {
          setError(`${po.publicId} is ${po.status.toLowerCase().replace(/_/g, " ")} and can no longer be edited.`);
          return;
        }
        setDraftPublicId(po.publicId);
        setSupplierId(po.supplierId);
        setWarehouseCode(po.warehouseCode);
        setExpectedDelivery(po.expectedDelivery ? po.expectedDelivery.slice(0, 10) : "");
        setNotes(po.notes ?? "");
        setLines(
          po.lines.map((l) => {
            const prId = l.procurementRequestId;
            return {
              key: powerKeyOf(l),
              lensType: l.lensType,
              lensId: l.lensId,
              requiredQuantity: l.requiredQuantity,
              poQuantity: String(l.poQuantity),
              rate: l.rate == null ? "" : String(l.rate),
              procurementRequestId: prId,
              procurementRequestIds: prId ? [prId] : [],
              productLabel: l.productLabel,
              rangeLabel: l.rangeLabel,
              powerLabel: l.powerLabel,
              openPurchaseOrder: null,
              importFingerprint: null,
            };
          })
        );
      } else if (listRes.suppliers[0]) {
        setSupplierId(listRes.suppliers[0].id);
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Drop stale import success copy and session fingerprints when their lines go away.
  useEffect(() => {
    setImportedFingerprints((prev) => {
      const next = pruneImportFingerprints(prev, lines);
      if (next.size === prev.size && [...next].every((fp) => prev.has(fp))) {
        return prev;
      }
      return next;
    });
    if (importNoticeShouldClear(importNoticeKeys, lines)) {
      setImportNotice("");
      setImportNoticeKeys([]);
    }
  }, [lines, importNoticeKeys]);

  const filteredQueue = useMemo(() => {
    const q = queueQuery.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter(
      (item) =>
        item.publicId.toLowerCase().includes(q) ||
        (item.productLabel ?? "").toLowerCase().includes(q) ||
        (item.powerLabel ?? "").toLowerCase().includes(q)
    );
  }, [queue, queueQuery]);

  const totals = useMemo(
    () => summarizePoWizardLines(lines),
    [lines]
  );

  const lineErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const line of lines) {
      const err = poWizardLineError(line);
      if (err) out[line.key] = err;
    }
    return out;
  }, [lines]);

  const saveDisabled =
    Boolean(saving) || !supplierId || !totals.canSave;

  const addedRequestIds = useMemo(
    () => contributedProcurementRequestIds(lines),
    [lines]
  );

  function toggleQueueItem(item: ReorderQueueItem) {
    if (item.openPurchaseOrder) return;
    if (addedRequestIds.has(item.id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  /** Merge by power; same PR id is idempotent; distinct PRs aggregate. */
  function mergeLines(incoming: LineForm[]) {
    setLines((prev) => mergePoWizardLines(prev, incoming));
  }

  function continueFromQueue() {
    const picked = queue.filter(
      (item) => selectedIds.has(item.id) && !addedRequestIds.has(item.id)
    );
    if (!picked.length && !lines.length) {
      setError("Select at least one item from the reorder queue, or import an Excel file.");
      return;
    }
    if (!picked.length && lines.length) {
      setSelectedIds(new Set());
      setError("");
      setStep("review");
      return;
    }
    mergeLines(
      picked.map((item) => ({
        key: powerKeyOf(item),
        lensType: item.lensType,
        lensId: item.lensId,
        requiredQuantity: item.unallocatedQuantity,
        poQuantity: String(item.unallocatedQuantity),
        rate: "",
        procurementRequestId: item.id,
        procurementRequestIds: [item.id],
        productLabel: item.productLabel,
        rangeLabel: null,
        powerLabel: item.powerLabel,
        openPurchaseOrder: null,
        importFingerprint: null,
      }))
    );
    setSelectedIds(new Set());
    setError("");
    setStep("review");
  }

  async function onImportFile(
    file: File | null,
    options?: { userConfirmedRepeat?: boolean }
  ) {
    if (!file) return;
    setImporting(true);
    setImportErrors([]);
    setError("");
    try {
      const bytes = await file.arrayBuffer();
      const fingerprint = await fingerprintImportBytes(bytes);
      const decision = decideDuplicateImport({
        alreadyImported: importedFingerprints.has(fingerprint),
        userConfirmedRepeat: Boolean(options?.userConfirmedRepeat),
      });
      if (decision.action === "block") {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = "";
        const confirmed = window.confirm(DUPLICATE_IMPORT_CONFIRM_MESSAGE);
        if (!confirmed) {
          setError(
            "Import cancelled. Re-importing the same Excel file would add quantities again."
          );
          return;
        }
        await onImportFile(file, { userConfirmedRepeat: true });
        return;
      }

      const res = await importPurchaseOrderLines(file);
      const mapped: LineForm[] = res.lines.map((l) => ({
        key: powerKeyOf(l),
        lensType: l.lensType,
        lensId: l.lensId,
        requiredQuantity: l.requiredQuantity,
        poQuantity: String(l.poQuantity),
        rate: l.rate == null ? "" : String(l.rate),
        procurementRequestId: null,
        procurementRequestIds: [],
        productLabel: l.productLabel,
        rangeLabel: null,
        powerLabel: l.powerLabel,
        openPurchaseOrder: l.openPurchaseOrder,
        importFingerprint: fingerprint,
      }));
      mergeLines(mapped);
      setImportedFingerprints((prev) => new Set(prev).add(fingerprint));
      setImportNotice(
        [
          `Imported ${formatCountLabel(res.lines.length, "line")}.`,
          ...res.warnings,
        ].join(" ")
      );
      setImportNoticeKeys(mapped.map((l) => l.key));
      setStep("review");
    } catch (err) {
      setImportNotice("");
      setImportNoticeKeys([]);
      if (err instanceof AdminApiError) {
        setError(err.message);
        const list = err.details.errors;
        if (Array.isArray(list)) setImportErrors(list.filter((v): v is string => typeof v === "string"));
      } else {
        setError("Import failed.");
      }
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function downloadTemplate() {
    setError("");
    try {
      await downloadPoImportTemplate();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not download template.");
    }
  }

  function updateLine(key: string, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function save(mode: "draft" | "submit") {
    if (!supplierId) {
      setError("Select a supplier.");
      return;
    }
    if (!lines.length) {
      setError("Add at least one line.");
      return;
    }
    if (!totals.canSave || Object.keys(lineErrors).length) {
      setError("Fix the highlighted lines before saving.");
      return;
    }
    if (expectedDelivery && expectedDelivery < new Date().toISOString().slice(0, 10) && !draftId) {
      setError("Expected delivery cannot be in the past.");
      return;
    }
    setSaving(mode);
    setError("");
    const body = {
      supplierId,
      warehouseCode,
      expectedDelivery: expectedDelivery || null,
      notes: notes.trim() || null,
      lines: lines.map((line) => ({
        lensType: line.lensType,
        lensId: line.lensId,
        requiredQuantity: line.requiredQuantity,
        poQuantity: Number(line.poQuantity),
        rate: line.rate.trim() === "" ? null : Number(line.rate),
        procurementRequestId: line.procurementRequestId,
        productLabel: line.productLabel,
        powerLabel: line.powerLabel,
      })),
    };
    try {
      const res = draftId
        ? await updatePurchaseOrderDraft(draftId, body)
        : await createPurchaseOrderDraft(body);
      if (mode === "submit" && res.purchaseOrder.status === "DRAFT") {
        await submitPurchaseOrder(res.purchaseOrder.id);
      }
      router.push(`/procurement/purchase-orders/${res.purchaseOrder.id}`);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not save the purchase order.");
      setSaving("");
    }
  }

  const amountLabelKind = poWizardSummaryAmountLabel(totals);
  const validationMessage = poWizardSummaryValidationMessage(totals);
  const backAction = poWizardBackAction(step, { draftId });

  return (
    <AdminPage
      title={draftPublicId ? `Edit ${draftPublicId}` : "Create purchase order"}
      subtitle="Add powers from the reorder queue or Excel, review quantities and supplier, then save. Approval happens on the PO page after submit."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {backAction.kind === "previous_step" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setError("");
              setStep(backAction.targetStep);
            }}
          >
            <ArrowLeft className="size-4" />
            {backAction.label}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" asChild>
            <Link href={backAction.href}>
              <ArrowLeft className="size-4" />
              {backAction.label}
            </Link>
          </Button>
        )}
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {PO_WIZARD_STEPS.map((s) => {
            const isCurrent = s.kind === "step" && step === s.key;
            return (
              <li
                key={s.key}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1",
                  isCurrent
                    ? "border-(--brand-primary) font-medium text-(--brand-text)"
                    : "border-(--brand-card-border) text-(--brand-text-muted)"
                )}
              >
                {s.label}
              </li>
            );
          })}
        </ol>
      </div>

      {error ? <div className={cn(ERROR_BANNER, "mb-4")}>
        <p>{error}</p>
        {importErrors.length ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {importErrors.slice(0, 20).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {importErrors.length > 20 ? <li>+{importErrors.length - 20} more</li> : null}
          </ul>
        ) : null}
      </div> : null}
      {importNotice ? (
        <p className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {importNotice}
        </p>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => void onImportFile(e.target.files?.[0] ?? null)}
      />

      {loading ? (
        <TableSkeleton rows={6} columns={5} compact />
      ) : step === "select" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-(--brand-text)">Add from reorder queue</h2>
              <p className="text-sm text-(--brand-text-muted)">
                Unallocated procurement requests. Powers already on an open PO cannot be added until
                that PO is closed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={queueQuery}
                onChange={(e) => setQueueQuery(e.target.value)}
                placeholder="Filter queue"
                className="w-full sm:w-56"
                aria-label="Filter reorder queue"
              />
              <Button variant="outline" onClick={() => void downloadTemplate()}>
                <Download className="size-4" />
                Template
              </Button>
              <Button variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Import Excel
              </Button>
            </div>
          </div>

          {filteredQueue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-(--brand-card-border) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
              {queue.length === 0
                ? "No unallocated procurement requests. Run Reorder from Reorder Rules, or import an Excel file."
                : "No queue items match this filter."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Request</TableHead>
                    <TableHead>Product / Power</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Unallocated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map((item) => {
                    const blocked = Boolean(item.openPurchaseOrder);
                    const alreadyAdded = addedRequestIds.has(item.id);
                    const disabled = blocked || alreadyAdded;
                    return (
                      <TableRow
                        key={item.id}
                        className={disabled ? "opacity-60" : undefined}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={alreadyAdded || selectedIds.has(item.id)}
                            disabled={disabled}
                            onChange={() => toggleQueueItem(item)}
                            aria-label={
                              alreadyAdded
                                ? `${item.publicId} already added`
                                : `Select ${item.publicId}`
                            }
                            className="size-4"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{item.publicId}</TableCell>
                        <TableCell>
                          <div>{item.productLabel || LENS_TYPE_LABELS[item.lensType] || item.lensType}</div>
                          <div className="text-xs text-(--brand-text-muted)">{item.powerLabel || "—"}</div>
                          {alreadyAdded ? (
                            <div className="text-xs text-(--brand-text-muted)">Already added</div>
                          ) : null}
                          {item.openPurchaseOrder ? (
                            <Link
                              href={`/procurement/purchase-orders/${item.openPurchaseOrder.id}`}
                              className="text-xs text-(--brand-link) hover:underline"
                            >
                              Already on open {item.openPurchaseOrder.publicId}
                            </Link>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-normal", PRIORITY_BADGE_CLASS[item.priority])}>
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.unallocatedQuantity}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {lines.length ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError("");
                  setStep("review");
                }}
              >
                Continue to review ({formatCountLabel(lines.length, "line")})
              </Button>
            ) : null}
            <Button onClick={continueFromQueue} disabled={!selectedIds.size && !lines.length}>
              <Plus className="size-4" />
              Add selected ({selectedIds.size}) &amp; review
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {suppliers.length === 0 ? (
            <p className={ERROR_BANNER}>
              No active suppliers. <Link href="/procurement/suppliers" className="underline">Add a supplier</Link> first.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1.5 text-sm">
              <span className="text-(--brand-text-muted)">Supplier *</span>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={SELECT_CLASS}>
                {!supplierId ? <option value="">Select supplier</option> : null}
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-(--brand-text-muted)">Warehouse</span>
              <select value={warehouseCode} onChange={(e) => setWarehouseCode(e.target.value)} className={SELECT_CLASS}>
                {warehouseCodes.map((code) => (
                  <option key={code} value={code}>
                    {code === "MAIN" ? "Main Warehouse" : code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-(--brand-text-muted)">Expected delivery</span>
              <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-(--brand-text-muted)">Notes</span>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" maxLength={1000} />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-(--brand-text)">Lines ({lines.length})</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("select")}>
                <Plus className="size-4" />
                Add from queue
              </Button>
              <Button variant="outline" size="sm" disabled={importing} onClick={() => fileRef.current?.click()}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                Import Excel
              </Button>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-(--brand-card-border) px-6 py-10 text-center text-sm text-(--brand-text-muted)">
              No lines yet. Add items from the reorder queue or import an Excel file.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product / Power</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                    <TableHead className="text-right">PO qty</TableHead>
                    <TableHead className="text-right">Rate (₹, optional)</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const err = lineErrors[line.key];
                    const amountDisplay = poWizardLineAmountDisplay(line);
                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <div>{line.productLabel || line.lensType}</div>
                          <div className="text-xs text-(--brand-text-muted)">
                            {[line.rangeLabel, line.powerLabel].filter(Boolean).join(" · ") || "—"}
                          </div>
                          {line.openPurchaseOrder ? (
                            <div className="text-xs text-amber-700 dark:text-amber-300">
                              {line.openPurchaseOrder} is open for this power — approval will be blocked until it closes.
                            </div>
                          ) : null}
                          {err ? (
                            <div id={`line-err-${line.key}`} className="text-xs text-red-700 dark:text-red-300">{err}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{line.requiredQuantity}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="numeric"
                            value={line.poQuantity}
                            onChange={(e) => updateLine(line.key, { poQuantity: e.target.value })}
                            className="ml-auto w-24 text-right"
                            aria-invalid={Boolean(err)}
                            aria-describedby={err ? `line-err-${line.key}` : undefined}
                            aria-label={`PO quantity for ${line.productLabel || line.lensId}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            inputMode="decimal"
                            value={line.rate}
                            onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                            className="ml-auto w-28 text-right"
                            placeholder="Optional"
                            aria-label={`Rate for ${line.productLabel || line.lensId}`}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {amountDisplay.kind === "amount" ? (
                            formatPoMoney(amountDisplay.value)
                          ) : amountDisplay.kind === "pending_rate" ? (
                            <span className="text-(--brand-text-muted)">Rate pending</span>
                          ) : (
                            <span className="text-(--brand-text-muted)">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                            aria-label={`Remove ${line.productLabel || line.lensId}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm text-(--brand-text-muted)">
              {validationMessage ? (
                <p className="text-red-700 dark:text-red-300" role="status">
                  {validationMessage}
                </p>
              ) : null}
              <p>
                {formatCountLabel(lines.length, "line")}
                {" · "}
                <span className="text-(--brand-text)">
                  {formatCountLabel(totals.qty, "unit")}
                </span>
                {" · "}
                <span className="text-(--brand-text)">
                  {amountLabelKind === "pending"
                    ? "Rate pending"
                    : amountLabelKind === "partial"
                      ? `${formatPoMoney(totals.amount)} (partial)`
                      : amountLabelKind === "none"
                        ? "—"
                        : formatPoMoney(totals.amount)}
                </span>
                {totals.unpriced
                  ? ` · ${formatCountLabel(totals.unpriced, "line")} pending rate`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void save("draft")}
                disabled={saveDisabled}
              >
                {saving === "draft" ? <Loader2 className="size-4 animate-spin" /> : null}
                Save draft
              </Button>
              <Button
                type="button"
                onClick={() => void save("submit")}
                disabled={saveDisabled}
              >
                {saving === "submit" ? <Loader2 className="size-4 animate-spin" /> : null}
                Save &amp; submit for approval
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

export default function NewPurchaseOrderPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={6} columns={5} compact />}>
      <NewPurchaseOrderInner />
    </Suspense>
  );
}
