"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
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
  fetchPowerWiseVariants,
  type PowerWiseVariantRow,
} from "@/app/lib/admin-power-wise-stock";

function formatAdditions(adds: number[]) {
  if (adds.length === 0) return "—";
  return adds.map((n) => n.toFixed(2)).join(", ");
}

function formatEyes(eyes: string[]) {
  if (eyes.length === 0) return "—";
  return eyes.join(", ");
}

export default function PowerWiseVariantsPage() {
  const params = useParams();
  const productId =
    typeof params.productId === "string" ? params.productId : "";

  const [productName, setProductName] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [variants, setVariants] = useState<PowerWiseVariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [axisFilter, setAxisFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const axis =
        axisFilter.trim() === "" ? undefined : Number(axisFilter.trim());
      const res = await fetchPowerWiseVariants(productId, {
        q: q.trim() || undefined,
        includeInactive,
        axis: axis != null && Number.isFinite(axis) ? axis : undefined,
      });
      setProductName(res.product.name);
      setFamilyCode(res.product.familyCode);
      setVariants(res.variants);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load matrix sheets."
      );
      setVariants([]);
    } finally {
      setLoading(false);
    }
  }, [productId, q, axisFilter, includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminPage
      title={productName || "Power matrices"}
      subtitle="One row per power range + axis — same sheets as Products / Stock by Product. ADD and eye are columns inside the matrix."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href="/inventory/power-wise-stock">
            <ArrowLeft className="size-4" />
            Parents
          </Link>
        </Button>
        {familyCode ? (
          <Badge variant="outline" className="text-[11px]">
            {familyCode}
          </Badge>
        ) : null}
        <div className="relative min-w-50 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
          <Input
            className="h-9 pl-8"
            placeholder="Search range, axis, ADD…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Input
          className="h-9 w-24"
          placeholder="Axis"
          value={axisFilter}
          onChange={(e) => setAxisFilter(e.target.value)}
        />
        <label className="flex h-9 items-center gap-2 rounded-md border border-(--brand-card-border) bg-(--brand-card) px-3 text-xs font-medium text-(--brand-text)">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive
        </label>
        <Button variant="outline" size="sm" className="h-9" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <TableSkeleton rows={8} />
      ) : variants.length === 0 ? (
        <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-12 text-center">
          <p className="text-sm text-(--brand-text-muted)">
            No power-range sheets match the current filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-(--brand-card-border) bg-(--brand-card)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Power range</TableHead>
                <TableHead>Axis</TableHead>
                <TableHead>ADD columns</TableHead>
                <TableHead>Eye</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead className="text-right">On-hand</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((row) => (
                <TableRow key={row.groupKey}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {row.rangeLabel}
                      {!row.isActive ? (
                        <Badge variant="outline" className="text-[10px]">
                          Inactive
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{row.axis ?? "—"}</TableCell>
                  <TableCell className="text-(--brand-text-muted)">
                    {formatAdditions(row.additions)}
                  </TableCell>
                  <TableCell className="text-(--brand-text-muted)">
                    {formatEyes(row.eyes)}
                  </TableCell>
                  <TableCell>{row.variantCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.totalOnHand}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                    {row.totalAvailable}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/inventory/power-wise-stock/${productId}/${row.id}`}
                      >
                        Open matrix
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminPage>
  );
}
