"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminSelect } from "@/components/admin-select";
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
  const [eye, setEye] = useState("");
  const [axisFilter, setAxisFilter] = useState("");
  const [additionFilter, setAdditionFilter] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const axis =
        axisFilter.trim() === "" ? undefined : Number(axisFilter.trim());
      const addition =
        additionFilter.trim() === ""
          ? undefined
          : Number(additionFilter.trim());
      const res = await fetchPowerWiseVariants(productId, {
        q: q.trim() || undefined,
        includeInactive,
        eye: eye || undefined,
        axis: axis != null && Number.isFinite(axis) ? axis : undefined,
        addition:
          addition != null && Number.isFinite(addition) ? addition : undefined,
      });
      setProductName(res.product.name);
      setFamilyCode(res.product.familyCode);
      setVariants(res.variants);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load variants."
      );
      setVariants([]);
    } finally {
      setLoading(false);
    }
  }, [productId, q, eye, axisFilter, additionFilter, includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminPage
      title={productName || "Variants"}
      subtitle="Pick one variant to open its read-only power matrix."
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
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
          <Input
            className="h-9 pl-8"
            placeholder="Search SKU, name, range…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <AdminSelect
          value={eye}
          onValueChange={setEye}
          options={[
            { value: "", label: "All eyes" },
            { value: "RE", label: "RE" },
            { value: "LE", label: "LE" },
          ]}
          triggerClassName="h-9 min-w-28"
        />
        <Input
          className="h-9 w-24"
          placeholder="Axis"
          value={axisFilter}
          onChange={(e) => setAxisFilter(e.target.value)}
        />
        <Input
          className="h-9 w-24"
          placeholder="ADD"
          value={additionFilter}
          onChange={(e) => setAdditionFilter(e.target.value)}
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
            No variants match the current filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-(--brand-card-border) bg-(--brand-card)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Power range</TableHead>
                <TableHead>Axis</TableHead>
                <TableHead>ADD</TableHead>
                <TableHead>Eye</TableHead>
                <TableHead className="text-right">On-hand</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {row.skuCode}
                      {!row.isActive ? (
                        <Badge variant="outline" className="text-[10px]">
                          Inactive
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-(--brand-text-muted)">
                    {row.rangeLabel}
                  </TableCell>
                  <TableCell>{row.axis ?? "—"}</TableCell>
                  <TableCell>
                    {row.addition != null ? row.addition.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>{row.eye ?? "—"}</TableCell>
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
