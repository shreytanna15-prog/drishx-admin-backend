"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminSelect, type AdminSelectOption } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
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
  CATALOG_STOCK_ADJUSTMENT_REASON_LABELS,
  CATALOG_STOCK_ADJUSTMENT_REASONS,
  createBulkCatalogStockAdjustmentsRequest,
  createCatalogStockAdjustmentRequest,
  fetchCatalogStockAdjustments,
  fetchCatalogStockPowers,
  type CatalogStockAdjustment,
  type CatalogStockPower,
} from "@/app/lib/admin-stock";
import { formatMatrixPower } from "@/app/lib/catalog/catalog-matrix";

const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

const cardClass =
  "rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5";

const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg)";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function formatSigned(n: number) {
  if (n > 0) return `+${n}`;
  return String(n);
}

export default function StockAdjustmentsPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [leaves, setLeaves] = useState<CatalogStockPower[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [countedQty, setCountedQty] = useState("");
  const [reasonCode, setReasonCode] = useState<string>("physical_mismatch");
  const [reasonText, setReasonText] = useState("");
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [history, setHistory] = useState<CatalogStockAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyQ, setHistoryQ] = useState("");
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<
    Array<{
      key: string;
      leaf: CatalogStockPower;
      countedQty: number;
      reasonCode: string;
      reasonText: string | null;
    }>
  >([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const selected = useMemo(
    () => leaves.find((l) => l.id === selectedId) ?? null,
    [leaves, selectedId]
  );

  const reasonOptions: AdminSelectOption[] = useMemo(
    () =>
      CATALOG_STOCK_ADJUSTMENT_REASONS.map((code) => ({
        value: code,
        label: CATALOG_STOCK_ADJUSTMENT_REASON_LABELS[code],
      })),
    []
  );

  const leafOptions: AdminSelectOption[] = useMemo(
    () =>
      leaves.map((leaf) => ({
        value: leaf.id,
        label: `${leaf.skuCode} · ${formatMatrixPower(leaf.sph)} / ${formatMatrixPower(leaf.cyl)} · on hand ${leaf.onHand}`,
      })),
    [leaves]
  );

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetchCatalogStockAdjustments({
        q: historyQ || undefined,
        limit: 50,
      });
      setHistory(res.items);
    } catch (err) {
      setHistoryError(errorMessage(err, "Failed to load adjustment history."));
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyQ]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function runLeafSearch() {
    setLeavesLoading(true);
    setFormError("");
    try {
      const res = await fetchCatalogStockPowers({
        q: search.trim() || undefined,
        limit: 50,
      });
      setLeaves(res.items);
      if (res.items.length === 1) {
        setSelectedId(res.items[0]!.id);
        setCountedQty(String(res.items[0]!.onHand));
      } else if (
        selectedId &&
        !res.items.some((item) => item.id === selectedId)
      ) {
        setSelectedId("");
      }
    } catch (err) {
      setFormError(errorMessage(err, "Failed to search stock leaves."));
      setLeaves([]);
    } finally {
      setLeavesLoading(false);
    }
  }

  useEffect(() => {
    void runLeafSearch();
    // initial load of recent leaves
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function onSelectLeaf(id: string) {
    setSelectedId(id);
    setFormError("");
    const leaf = leaves.find((l) => l.id === id);
    if (leaf) setCountedQty(String(leaf.onHand));
  }

  async function submitAdjustment() {
    if (!selectedId) {
      setFormError("Select a stock leaf first.");
      return;
    }
    const counted = Number(countedQty);
    if (!Number.isSafeInteger(counted) || counted < 0) {
      setFormError("Counted / new quantity must be a whole number ≥ 0.");
      return;
    }
    if (reasonCode === "other" && !reasonText.trim()) {
      setFormError("Notes are required when reason is Other.");
      return;
    }
    if (selected && counted === selected.onHand) {
      setFormError("Counted quantity matches current on hand — nothing to apply.");
      return;
    }

    setFormBusy(true);
    setFormError("");
    try {
      const targetPayload =
        selected && selected.id.startsWith("virtual:")
          ? {
            variantId: selected.variantId,
            sph: selected.sph,
            cyl: selected.cyl,
          }
          : { powerId: selectedId };
      await createCatalogStockAdjustmentRequest({
        ...targetPayload,
        countedQty: counted,
        reasonCode,
        reasonText: reasonText.trim() || null,
      });
      setReasonText("");
      await Promise.all([runLeafSearch(), loadHistory()]);
      const refreshed = await fetchCatalogStockPowers({
        q: search.trim() || undefined,
        limit: 50,
      });
      const next = refreshed.items.find((l) => l.id === selectedId);
      if (next) setCountedQty(String(next.onHand));
    } catch (err) {
      setFormError(errorMessage(err, "Failed to apply adjustment."));
    } finally {
      setFormBusy(false);
    }
  }

  const previewDelta =
    selected && Number.isSafeInteger(Number(countedQty))
      ? Number(countedQty) - selected.onHand
      : null;
  const canApply =
    Boolean(selectedId) &&
    previewDelta != null &&
    previewDelta !== 0 &&
    !formBusy;

  function addToBulkQueue() {
    if (!selected || previewDelta == null || previewDelta === 0) return;
    const counted = Number(countedQty);
    if (!Number.isSafeInteger(counted) || counted < 0) {
      setFormError("Counted / new quantity must be a whole number ≥ 0.");
      return;
    }
    if (reasonCode === "other" && !reasonText.trim()) {
      setFormError("Notes are required when reason is Other.");
      return;
    }
    setFormError("");
    setBulkQueue((prev) => {
      const filtered = prev.filter((item) => item.key !== selected.id);
      return [
        ...filtered,
        {
          key: selected.id,
          leaf: selected,
          countedQty: counted,
          reasonCode,
          reasonText: reasonText.trim() || null,
        },
      ];
    });
  }

  async function submitBulkQueue() {
    if (bulkQueue.length === 0) return;
    setBulkBusy(true);
    setFormError("");
    try {
      await createBulkCatalogStockAdjustmentsRequest({
        items: bulkQueue.map((item) => ({
          ...(item.leaf.id.startsWith("virtual:")
            ? {
              variantId: item.leaf.variantId,
              sph: item.leaf.sph,
              cyl: item.leaf.cyl,
            }
            : { powerId: item.leaf.id }),
          countedQty: item.countedQty,
          reasonCode: item.reasonCode,
          reasonText: item.reasonText,
        })),
      });
      setBulkQueue([]);
      await Promise.all([runLeafSearch(), loadHistory()]);
    } catch (err) {
      setFormError(errorMessage(err, "Failed to apply bulk adjustments."));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <AdminPage
      title="Stock adjustments"
      subtitle="Set physical on-hand for a catalog leaf (variant + SPH + CYL). Quantity is never free-edited on the matrix."
    >
      <section className={`${cardClass} mb-6`}>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          New adjustment
        </h2>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--brand-text-muted)" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runLeafSearch();
              }}
              placeholder="Search SKU / name / leaf id"
              className={`${inputClass} pl-9`}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void runLeafSearch()}
            disabled={leavesLoading}
            className="h-10 rounded-xl border-(--brand-card-border) bg-(--brand-card) px-4 text-sm font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10"
          >
            {leavesLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Search leaves"
            )}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-(--brand-label)">
              Stock leaf
            </label>
            <AdminSelect
              value={selectedId}
              onValueChange={onSelectLeaf}
              options={leafOptions}
              placeholder={
                leaves.length === 0
                  ? "No leaves yet — save thresholds on a catalog matrix first"
                  : "Select leaf"
              }
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-(--brand-label)">
              Reason
            </label>
            <AdminSelect
              value={reasonCode}
              onValueChange={setReasonCode}
              options={reasonOptions}
            />
          </div>
        </div>

        {selected ? (
          <dl className="mt-4 grid gap-3 rounded-xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-bold uppercase tracking-widest text-(--brand-label)">
                SKU
              </dt>
              <dd className="mt-1 font-semibold break-all">{selected.skuCode}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-widest text-(--brand-label)">
                Power
              </dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatMatrixPower(selected.sph)} /{" "}
                {formatMatrixPower(selected.cyl)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-widest text-(--brand-label)">
                On hand / blocked / avail
              </dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {selected.onHand} / {selected.blockedQty} / {selected.available}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-widest text-(--brand-label)">
                Family
              </dt>
              <dd className="mt-1 font-semibold">{selected.family}</dd>
            </div>
          </dl>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-(--brand-label)">
              Counted / new quantity
            </label>
            <Input
              inputMode="numeric"
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              className={inputClass}
              placeholder="e.g. 10"
            />
            {previewDelta != null && selected ? (
              <p
                className={
                  previewDelta === 0
                    ? "mt-1.5 text-xs text-(--brand-text-muted)"
                    : previewDelta > 0
                      ? "mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                      : "mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                }
              >
                {previewDelta === 0
                  ? "Same as current on hand — change the number (e.g. 10) then apply."
                  : `Will change ${selected.onHand} → ${Number(countedQty)} (${formatSigned(previewDelta)})`}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-(--brand-text-muted)">
                Enter the physical count on the shelf. Available must stay ≥ 0.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-(--brand-label)">
              Notes {reasonCode === "other" ? "(required)" : "(optional)"}
            </label>
            <Input
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              className={inputClass}
              placeholder="Why is stock changing?"
            />
          </div>
        </div>

        {formError ? (
          <div className={`mt-4 ${errorBannerClass}`}>{formError}</div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canApply || bulkBusy}
            onClick={addToBulkQueue}
            className="h-10 rounded-xl px-4 text-sm font-semibold"
          >
            Add to bulk queue
          </Button>
          <Button
            type="button"
            disabled={!canApply}
            onClick={() => void submitAdjustment()}
            className="h-10 rounded-xl bg-(--brand-primary) px-5 text-sm font-extrabold text-(--brand-primary-text) hover:opacity-95"
          >
            {formBusy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              "Apply adjustment"
            )}
          </Button>
        </div>

        {bulkQueue.length > 0 ? (
          <div className="mt-5 rounded-xl border border-(--brand-primary)/40 bg-(--brand-primary)/5 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-primary)">
                Bulk adjustment queue ({bulkQueue.length})
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setBulkQueue([])}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => void submitBulkQueue()}
                  className="bg-(--brand-primary) font-bold text-(--brand-primary-text)"
                >
                  {bulkBusy ? "Applying…" : `Apply all (${bulkQueue.length})`}
                </Button>
              </div>
            </div>
            <ul className="space-y-1 text-xs">
              {bulkQueue.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded bg-(--brand-card) px-2.5 py-1.5"
                >
                  <span>
                    <strong className="font-semibold">{item.leaf.skuCode}</strong>{" "}
                    · {formatMatrixPower(item.leaf.sph)} /{" "}
                    {formatMatrixPower(item.leaf.cyl)} · {item.leaf.onHand} →{" "}
                    {item.countedQty} (
                    {formatSigned(item.countedQty - item.leaf.onHand)})
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setBulkQueue((prev) =>
                        prev.filter((x) => x.key !== item.key)
                      )
                    }
                    className="text-(--brand-text-muted) underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            History
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setHistoryQ(q.trim());
              }}
              placeholder="Filter by CSA id / SKU / reason"
              className={`${inputClass} w-64`}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryQ(q.trim())}
              className="h-10 rounded-xl border-(--brand-card-border) bg-(--brand-card) px-4 text-sm font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10"
            >
              Filter
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadHistory()}
              className="h-10 w-10 rounded-xl border-(--brand-card-border) bg-(--brand-card) p-0 text-(--brand-text) hover:bg-(--brand-primary)/10"
              aria-label="Refresh history"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {historyError ? (
          <div className={`mb-3 ${errorBannerClass}`}>{historyError}</div>
        ) : null}

        {historyLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <AdminTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Leaf</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-(--brand-text-muted)"
                    >
                      No adjustments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.publicId}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold">
                          {row.leaf?.skuCode ?? "—"}
                        </div>
                        <div className="text-xs text-(--brand-text-muted)">
                          {row.leaf
                            ? `${formatMatrixPower(row.leaf.sph)} / ${formatMatrixPower(row.leaf.cyl)}`
                            : row.lensProductPowerId}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.qtyBefore}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatSigned(row.qtyDelta)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.qtyAfter}
                      </TableCell>
                      <TableCell>
                        <div>{row.reasonLabel}</div>
                        {row.reasonText ? (
                          <div className="text-xs text-(--brand-text-muted)">
                            {row.reasonText}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </AdminTable>
        )}
      </section>
    </AdminPage>
  );
}
