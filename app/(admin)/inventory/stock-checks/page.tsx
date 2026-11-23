"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminTable } from "@/components/admin-table";
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
import { fetchLensProduct } from "@/app/lib/admin-lens-catalog";
import {
  cancelCatalogStockCheckRequest,
  fetchCatalogStockCheckSession,
  fetchCatalogStockCheckSessions,
  fetchCatalogStockPowers,
  saveCatalogStockCheckCountsRequest,
  startCatalogStockCheckRequest,
  verifyCatalogStockCheckRequest,
  type CatalogStockCheckSession,
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

function statusBadge(status: string) {
  const tone =
    status === "OPEN"
      ? "bg-sky-100 text-sky-900"
      : status === "SUBMITTED"
        ? "bg-amber-100 text-amber-900"
        : status === "VERIFIED"
          ? "bg-emerald-100 text-emerald-900"
          : "bg-zinc-100 text-zinc-700";
  return <Badge className={tone}>{status}</Badge>;
}

export default function StockChecksPage() {
  const [sessions, setSessions] = useState<CatalogStockCheckSession[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogStockCheckSession | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [productId, setProductId] = useState("");
  const [leafSearch, setLeafSearch] = useState("");
  const [leafHits, setLeafHits] = useState<CatalogStockPower[]>([]);
  const [pickedPowerIds, setPickedPowerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetchCatalogStockCheckSessions({ limit: 50 });
      setSessions(res.items);
    } catch (err) {
      setListError(errorMessage(err, "Failed to load stock checks."));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setFormError("");
    try {
      const res = await fetchCatalogStockCheckSession(id);
      setDetail(res.session);
      const drafts: Record<string, string> = {};
      for (const line of res.session.lines) {
        const v = line.effectiveCountedQty ?? line.countedQty;
        drafts[line.powerId] = v != null ? String(v) : "";
      }
      setCountDrafts(drafts);
    } catch (err) {
      setFormError(errorMessage(err, "Failed to load session."));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function searchLeaves() {
    setFormError("");
    try {
      const res = await fetchCatalogStockPowers({
        q: leafSearch.trim() || undefined,
        limit: 30,
      });
      setLeafHits(res.items);
    } catch (err) {
      setFormError(errorMessage(err, "Leaf search failed."));
    }
  }

  function togglePower(id: string) {
    setPickedPowerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function startSession() {
    setBusy(true);
    setFormError("");
    try {
      let resolvedProductId = productId.trim() || undefined;
      if (resolvedProductId) {
        // Validate product exists early for clearer error.
        await fetchLensProduct(resolvedProductId);
      }
      const res = await startCatalogStockCheckRequest({
        productId: resolvedProductId,
        powerIds: pickedPowerIds.length ? pickedPowerIds : undefined,
        notes: notes.trim() || null,
      });
      setProductId("");
      setPickedPowerIds([]);
      setNotes("");
      await loadList();
      setSelectedId(res.session.id);
    } catch (err) {
      setFormError(errorMessage(err, "Failed to start stock check."));
    } finally {
      setBusy(false);
    }
  }

  async function saveCounts() {
    if (!detail) return;
    setBusy(true);
    setFormError("");
    try {
      const lines = detail.lines
        .map((line) => {
          const raw = countDrafts[line.powerId]?.trim() ?? "";
          if (raw === "") return null;
          const countedQty = Number(raw);
          return { powerId: line.powerId, countedQty };
        })
        .filter(Boolean) as Array<{ powerId: string; countedQty: number }>;
      const res = await saveCatalogStockCheckCountsRequest(detail.id, lines);
      setDetail(res.session);
      await loadList();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to save counts."));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!detail) return;
    setBusy(true);
    setFormError("");
    try {
      // Persist drafts first so verify uses latest counts.
      const overrides = detail.lines
        .map((line) => {
          const raw = countDrafts[line.powerId]?.trim() ?? "";
          if (raw === "") return null;
          return { powerId: line.powerId, countedQty: Number(raw) };
        })
        .filter(Boolean) as Array<{ powerId: string; countedQty: number }>;
      const res = await verifyCatalogStockCheckRequest(detail.id, {
        lineOverrides: overrides,
      });
      setDetail(res.session);
      await loadList();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to verify stock check."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!detail) return;
    setBusy(true);
    setFormError("");
    try {
      const res = await cancelCatalogStockCheckRequest(detail.id);
      setDetail(res.session);
      await loadList();
    } catch (err) {
      setFormError(errorMessage(err, "Failed to cancel stock check."));
    } finally {
      setBusy(false);
    }
  }

  const canEditCounts =
    detail?.status === "OPEN" || detail?.status === "SUBMITTED";
  const canVerify =
    detail?.status === "OPEN" || detail?.status === "SUBMITTED";
  const canCancel =
    detail?.status === "OPEN" || detail?.status === "SUBMITTED";

  const pickedLabel = useMemo(() => {
    if (pickedPowerIds.length === 0) return "No individual leaves selected";
    return `${pickedPowerIds.length} leaf(s) selected`;
  }, [pickedPowerIds]);

  return (
    <AdminPage
      title="Stock checks"
      subtitle="Physical count sessions freeze leaves until verified or cancelled. Employees enter counted qty only (no system stock) via staff APIs."
    >
      <section className={`${cardClass} mb-6`}>
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          Start count session
        </h2>
        <p className="mb-4 text-xs text-(--brand-text-muted)">
          Provide a catalog product id (all current leaves) and/or pick specific
          leaves. Those leaves stay frozen until verify/cancel.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-(--brand-label)">
              Product id (optional)
            </label>
            <Input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={inputClass}
              placeholder="LensProduct id"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-(--brand-label)">
              Notes (optional)
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              placeholder="Cycle count / aisle A"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            value={leafSearch}
            onChange={(e) => setLeafSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void searchLeaves();
            }}
            className={`${inputClass} min-w-[220px] flex-1`}
            placeholder="Search leaves by SKU to add"
          />
          <Button type="button" variant="outline" onClick={() => void searchLeaves()}>
            Search leaves
          </Button>
          <Button
            type="button"
            disabled={busy || (!productId.trim() && pickedPowerIds.length === 0)}
            onClick={() => void startSession()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start + freeze"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-(--brand-text-muted)">{pickedLabel}</p>

        {leafHits.length > 0 ? (
          <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-sm">
            {leafHits.map((leaf) => {
              const on = pickedPowerIds.includes(leaf.id);
              return (
                <li key={leaf.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left ${
                      on
                        ? "border-(--brand-primary) bg-(--brand-primary)/10"
                        : "border-(--brand-card-border)"
                    }`}
                    onClick={() => togglePower(leaf.id)}
                  >
                    <span className="font-semibold">{leaf.skuCode}</span>{" "}
                    <span className="tabular-nums text-(--brand-text-muted)">
                      {formatMatrixPower(leaf.sph)} / {formatMatrixPower(leaf.cyl)}
                    </span>{" "}
                    <span className="text-(--brand-text-muted)">
                      · on hand {leaf.onHand}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {formError ? <div className={`mb-4 ${errorBannerClass}`}>{formError}</div> : null}
      {listError ? <div className={`mb-4 ${errorBannerClass}`}>{listError}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className={cardClass}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Sessions
            </h2>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadList()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          {listLoading ? (
            <TableSkeleton rows={5} />
          ) : (
            <AdminTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Leaves</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-(--brand-text-muted)">
                        No stock checks yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sessions.map((s) => (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer ${selectedId === s.id ? "bg-(--brand-primary)/10" : ""}`}
                        onClick={() => setSelectedId(s.id)}
                      >
                        <TableCell className="font-mono text-xs">{s.publicId}</TableCell>
                        <TableCell>{statusBadge(s.status)}</TableCell>
                        <TableCell className="tabular-nums">
                          {s.countedLineCount}/{s.lineCount}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(s.startedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </AdminTable>
          )}
        </section>

        <section className={cardClass}>
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Session detail
          </h2>
          {!selectedId ? (
            <p className="text-sm text-(--brand-text-muted)">Select a session.</p>
          ) : detailLoading || !detail ? (
            <TableSkeleton rows={6} />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{detail.publicId}</span>
                {statusBadge(detail.status)}
                <span className="text-xs text-(--brand-text-muted)">
                  {detail.countedLineCount}/{detail.lineCount} counted
                </span>
              </div>

              <AdminTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leaf</TableHead>
                      <TableHead className="text-right">System</TableHead>
                      <TableHead className="text-right">Counted</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lines.map((line) => {
                      const counted = Number(countDrafts[line.powerId] ?? "");
                      const delta =
                        Number.isSafeInteger(counted) && line.systemQtyAtStart != null
                          ? counted - line.systemQtyAtStart
                          : null;
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <div className="font-semibold">{line.skuCode}</div>
                            <div className="text-xs text-(--brand-text-muted)">
                              {formatMatrixPower(line.sph)} /{" "}
                              {formatMatrixPower(line.cyl)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {line.systemQtyAtStart ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              inputMode="numeric"
                              disabled={!canEditCounts || busy}
                              value={countDrafts[line.powerId] ?? ""}
                              onChange={(e) =>
                                setCountDrafts((prev) => ({
                                  ...prev,
                                  [line.powerId]: e.target.value,
                                }))
                              }
                              className="ml-auto h-8 w-20 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </AdminTable>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {canEditCounts ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void saveCounts()}
                  >
                    Save counts
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void cancel()}
                  >
                    Cancel (unfreeze)
                  </Button>
                ) : null}
                {canVerify ? (
                  <Button type="button" disabled={busy} onClick={() => void verify()}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Verify + adjust"
                    )}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
