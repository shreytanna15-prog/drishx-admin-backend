"use client";

import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGetCatalogStockTransactions } from "@/app/lib/modules/stock/query/use-get-catalog-stock-transactions";

export default function CatalogStockTransactionsPage() {
  const [q, setQ] = useState("");
  const [movementType, setMovementType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, refreshing, error, refetch } = useGetCatalogStockTransactions({
    q: q.trim() || undefined,
    movementType: movementType || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit: 40,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <AdminPage
      title="Stock Transactions"
      subtitle="Ledger of catalog stock movements (receive, adjust, discrepancy)."
      actions={
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
          <Input
            className="pl-8"
            placeholder="Search SKU, variant or leaf id…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>
        <AdminSelect
          value={movementType}
          onValueChange={(value) => { setPage(1); setMovementType(value); }}
          options={[
            { value: "", label: "All movements" },
            ...["RECEIVED", "RESERVED", "RELEASED", "ADJUSTED", "PICKED", "RESTORED", "RETURNED", "DAMAGED", "WRITTEN_OFF", "SOLD"].map(
              (value) => ({ value, label: value.replaceAll("_", " ") })
            ),
          ]}
          triggerClassName="h-9 min-w-40"
        />
        <label className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
          From
          <Input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="w-36" />
        </label>
        <label className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
          To
          <Input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="w-36" />
        </label>
        <Badge variant="secondary">{total} rows</Badge>
        {refreshing ? <span className="text-xs text-(--brand-text-muted)">Refreshing…</span> : null}
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error.message}</p> : null}

      {loading ? (
        <TableSkeleton rows={10} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>SKU / Power</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm">
                    No catalog movements yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(row.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.movementType}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.skuCode ?? "—"}</div>
                      <div className="text-xs text-(--brand-text-muted)">
                        {row.family ?? ""}
                        {row.sph != null && row.cyl != null
                          ? ` · ${row.sph.toFixed(2)}/${row.cyl.toFixed(2)}`
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantityDelta > 0 ? "+" : ""}
                      {row.quantityDelta}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantityBefore}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantityAfter}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.sourceType ?? "—"}
                      {row.reasonCode ? (
                        <div className="text-(--brand-text-muted)">
                          {row.reasonCode}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.referenceId ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
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
          disabled={page * 40 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </AdminPage>
  );
}
