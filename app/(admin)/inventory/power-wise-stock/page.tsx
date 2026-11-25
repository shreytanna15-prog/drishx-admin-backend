"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Play, RefreshCw, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { AdminSelect } from "@/components/admin-select";
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
  patchCatalogStockPowerRules,
  runCatalogReorderCheckRequest,
} from "@/app/lib/admin-stock";
import { useGetCatalogStockPowers } from "@/app/lib/modules/stock/query/use-get-catalog-stock-powers";

export default function CatalogPowerWiseStockPage() {
  const [q, setQ] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [shortageOnly, setShortageOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { minStock: string; targetStock: string }>
  >({});

  const { data, loading, refreshing, error: queryError, refetch } = useGetCatalogStockPowers({
    q: q.trim() || undefined,
    familyCode: familyCode || undefined,
    shortageOnly,
    page,
    limit: 50,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const error = actionError ?? queryError?.message ?? null;

  async function saveRules(id: string) {
    const row = items.find((item) => item.id === id);
    const draft = drafts[id] ?? (row
      ? { minStock: String(row.minStock), targetStock: String(row.targetStock) }
      : null);
    if (!draft) return;
    setActionError(null);
    try {
      await patchCatalogStockPowerRules(id, {
        minStock: Number(draft.minStock),
        targetStock: Number(draft.targetStock),
      });
      setMessage("Rules saved.");
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refetch();
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Save failed.");
    }
  }

  async function runReorder() {
    setRunning(true);
    setMessage(null);
    setActionError(null);
    try {
      const res = await runCatalogReorderCheckRequest();
      setMessage(
        `Scanned ${res.scanned ?? 0}: created ${res.created ?? 0}, suppressed ${res.suppressed ?? 0}, not needed ${res.notNeeded ?? 0}.`
      );
      await refetch();
    } catch (err) {
      setActionError(
        err instanceof AdminApiError ? err.message : "Reorder check failed."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <AdminPage
      title="Power-wise Inventory"
      subtitle="Catalog stock leaves — available, incoming, threshold/target, and Run reorder."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
            className="h-9 rounded-xl border-(--brand-card-border) bg-(--brand-card) px-4 text-sm font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10"
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            onClick={() => void runReorder()}
            disabled={running}
            className="h-9 rounded-xl bg-(--brand-primary) px-4 text-sm font-extrabold text-(--brand-primary-text) hover:opacity-95"
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Run reorder
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
          <Input
            className="pl-8"
            placeholder="Search SKU / name…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>
        <AdminSelect
          value={familyCode}
          onValueChange={(value) => {
            setPage(1);
            setFamilyCode(value);
          }}
          options={[
            { value: "", label: "All families" },
            { value: "SV", label: "Single Vision" },
            { value: "KT", label: "Kryptok" },
            { value: "V2", label: "Progressive V2" },
          ]}
          triggerClassName="h-9 min-w-36"
        />
        <label className="flex items-center gap-2 text-sm text-(--brand-text)">
          <input
            type="checkbox"
            checked={shortageOnly}
            onChange={(e) => {
              setPage(1);
              setShortageOnly(e.target.checked);
            }}
          />
          Shortages only
        </label>
        <Badge variant="secondary">{total} leaves</Badge>
        {refreshing ? <span className="text-xs text-(--brand-text-muted)">Refreshing…</span> : null}
      </div>

      {message ? (
        <p className="mb-3 text-sm text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU / Power</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Incoming</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Open PO</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm">
                    No catalog leaves yet. Set threshold/target on a product
                    matrix, or confirm a receipt.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => {
                  const draft = drafts[row.id] ?? {
                    minStock: String(row.minStock),
                    targetStock: String(row.targetStock),
                  };
                  const short = row.available <= row.minStock && row.minStock > 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.skuCode}</div>
                        <div className="text-xs text-(--brand-text-muted)">
                          {row.family} · SPH {row.sph.toFixed(2)} / CYL{" "}
                          {row.cyl.toFixed(2)}
                          {row.axis != null ? ` · AXIS ${row.axis}` : ""}
                          {row.addition != null ? ` · ADD ${row.addition.toFixed(2)}` : ""}
                          {row.eye ? ` · ${row.eye}` : ""}
                          {short ? (
                            <Badge className="ml-2" variant="destructive">
                              Short
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.onHand}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.reservedQty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.blockedQty}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.available}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.incoming}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-9 w-20 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg)"
                          value={draft.minStock}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...draft,
                                minStock: e.target.value,
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-9 w-20 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg)"
                          value={draft.targetStock}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [row.id]: {
                                ...draft,
                                targetStock: e.target.value,
                              },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {row.openPo ? (
                          <Badge variant="outline">{row.openPo.publicId}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void saveRules(row.id)}
                          className="h-9 rounded-xl border-(--brand-card-border) bg-(--brand-card) px-3 text-sm font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10"
                        >
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </Button>
        <span className="text-(--brand-text-muted)">Page {page}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={page * 50 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <p className="mt-4 text-xs text-(--brand-text-muted)">
        Parent matrix:{" "}
        <Link href="/inventory/products-catalog" className="underline">
          Products &amp; catalog
        </Link>
        . Ledger:{" "}
        <Link href="/inventory/stock-transactions" className="underline">
          Stock transactions
        </Link>
        .
      </p>
    </AdminPage>
  );
}
