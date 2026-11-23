"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Package, RefreshCw } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { CardGridSkeleton, TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  fetchCatalogStockOverview,
  type CatalogStockOverview,
} from "@/app/lib/admin-stock";

export default function CatalogStockOverviewPage() {
  const [overview, setOverview] = useState<CatalogStockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCatalogStockOverview();
      setOverview(res.overview);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load overview."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminPage
      title="Stock Overview"
      subtitle="Catalog stock leaves — on hand, available, shortages, and open PO coverage."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href="/inventory/power-wise-stock">Power-wise</Link>
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading || !overview ? (
        <CardGridSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Leaves" value={overview.leafCount} />
            <StatCard label="On hand" value={overview.onHandSum} />
            <StatCard label="Available" value={overview.availableSum} />
            <StatCard label="Blocked" value={overview.blockedSum} />
            <StatCard label="Shortages" value={overview.shortageCount} tone="warn" />
            <StatCard label="On open PO" value={overview.openPoLeafCount} />
          </div>

          <div className="rounded-lg border border-(--brand-card-border) bg-(--brand-card)">
            <div className="flex items-center justify-between border-b border-(--brand-card-border) px-4 py-3">
              <h2 className="text-sm font-semibold text-(--brand-text)">
                Top shortages
              </h2>
              <Badge variant="secondary">{overview.topShortages.length}</Badge>
            </div>
            {overview.topShortages.length === 0 ? (
              <p className="px-4 py-8 text-sm text-(--brand-text-muted)">
                No leaves at or below threshold.
              </p>
            ) : loading ? (
              <TableSkeleton rows={5} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Family</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Incoming</TableHead>
                    <TableHead>Open PO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.topShortages.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium text-(--brand-text)">
                          {row.skuCode}
                        </div>
                        <div className="text-xs text-(--brand-text-muted)">
                          {row.name}
                        </div>
                      </TableCell>
                      <TableCell>{row.family}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="size-3.5" />
                          {row.available}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.minStock}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.targetStock}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.incoming}
                      </TableCell>
                      <TableCell>
                        {row.openPoPublicId ? (
                          <Badge variant="outline">{row.openPoPublicId}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <p className="text-xs text-(--brand-text-muted)">
            Live matrix:{" "}
            <Link
              href="/inventory/products-catalog"
              className="underline underline-offset-2"
            >
              Products &amp; catalog
            </Link>
            . Legacy lens browser:{" "}
            <Link
              href="/inventory/stock-overview/legacy"
              className="underline underline-offset-2"
            >
              Legacy SKUs
            </Link>
            .
          </p>
        </div>
      )}
    </AdminPage>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-(--brand-card-border) bg-(--brand-card) px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-(--brand-text-muted)">
        <Package className="size-3.5" />
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-700" : "text-(--brand-text)"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
