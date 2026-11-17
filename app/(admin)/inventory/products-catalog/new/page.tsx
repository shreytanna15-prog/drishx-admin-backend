"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import {
  AdditionMultiSelect,
  AxisMultiSelect,
  CatalogSelectField,
  PowerRangeMultiSelect,
} from "@/components/catalog/catalog-field";
import { VariantPreviewTable } from "@/components/catalog/variant-preview-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createLensProductRequest,
  fetchAttributeCompatibility,
  fetchLensAttributes,
  previewLensProductRequest,
  type LensAttribute,
  type VariantPreview,
} from "@/app/lib/admin-lens-catalog";
import { useGetPowerRanges } from "@/app/lib/modules/lens-catalog/query/use-get-power-ranges";
import { formatPowerRangeCompact } from "@/app/lib/catalog/catalog-power-select-options";
import type { AdminSelectOption } from "@/components/admin-select";

const CATALOG_HREF = "/inventory/products-catalog";

const catalogLabelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function toOptions(
  items: LensAttribute[],
  emptyLabel?: string
): AdminSelectOption[] {
  const opts = items.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
  }));
  return emptyLabel ? [{ value: "", label: emptyLabel }, ...opts] : opts;
}

function powerRangeAllowsAxis(cylMin: number, cylMax: number): boolean {
  return Math.max(Math.abs(cylMin), Math.abs(cylMax)) !== 0;
}

function attrNumericOptions(items: LensAttribute[]) {
  return items
    .filter((a) => a.value != null && Number.isFinite(a.value))
    .map((a) => ({
      id: a.id,
      label: a.name?.trim() || a.code,
      value: Number(a.value),
    }));
}

export default function NewLensProductPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);
  const [indexes, setIndexes] = useState<LensAttribute[]>([]);
  const [coatings, setCoatings] = useState<LensAttribute[]>([]);
  const [colors, setColors] = useState<LensAttribute[]>([]);
  const [axes, setAxes] = useState<LensAttribute[]>([]);
  const [additions, setAdditions] = useState<LensAttribute[]>([]);
  const [diameters, setDiameters] = useState<LensAttribute[]>([]);
  const [progressiveTypes, setProgressiveTypes] = useState<LensAttribute[]>(
    []
  );
  const [allowedMaterialIds, setAllowedMaterialIds] = useState<Set<string>>(
    new Set()
  );
  const [attrsLoading, setAttrsLoading] = useState(true);

  const [familyId, setFamilyId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [indexId, setIndexId] = useState("");
  const [coatingId, setCoatingId] = useState("");
  const [colorId, setColorId] = useState("");
  const [diameterId, setDiameterId] = useState("");
  const [progressiveTypeId, setProgressiveTypeId] = useState("");
  const [axisIds, setAxisIds] = useState<string[]>([]);
  const [additionIds, setAdditionIds] = useState<string[]>([]);
  const [powerRangeIds, setPowerRangeIds] = useState<string[]>([]);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [preview, setPreview] = useState<{
    baseCode: string;
    existingParentId: string | null;
    variants: VariantPreview[];
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const {
    data: powerRangeData,
    loading: powerRangesLoading,
    error: powerRangesError,
  } = useGetPowerRanges({ activeOnly: true });
  const powerRanges = useMemo(
    () => powerRangeData?.items ?? [],
    [powerRangeData]
  );

  useEffect(() => {
    void (async () => {
      setAttrsLoading(true);
      try {
        const [f, b, m, i, coat, col, ax, add, dia, pt] = await Promise.all([
          fetchLensAttributes("family", { activeOnly: true }),
          fetchLensAttributes("base", { activeOnly: true }),
          fetchLensAttributes("material", { activeOnly: true }),
          fetchLensAttributes("index", { activeOnly: true }),
          fetchLensAttributes("coating", { activeOnly: true }),
          fetchLensAttributes("color", { activeOnly: true }),
          fetchLensAttributes("axis", { activeOnly: true }),
          fetchLensAttributes("addition", { activeOnly: true }),
          fetchLensAttributes("diameter", { activeOnly: true }),
          fetchLensAttributes("progressive-type", { activeOnly: true }),
        ]);
        setFamilies(f.items);
        setBases(b.items);
        setMaterials(m.items);
        setIndexes(i.items);
        setCoatings(coat.items);
        setColors(col.items);
        setAxes(ax.items);
        setAdditions(add.items);
        setDiameters(dia.items);
        setProgressiveTypes(pt.items);
      } catch (err) {
        setError(errorMessage(err, "Failed to load attributes."));
      } finally {
        setAttrsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!baseId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset compatibility on base change
      setAllowedMaterialIds(new Set());
      return;
    }
    void (async () => {
      try {
        const res = await fetchAttributeCompatibility(baseId);
        const row = res.bases.find((x) => x.baseId === baseId);
        setAllowedMaterialIds(
          new Set((row?.materials ?? []).filter((m) => m.isActive).map((m) => m.id))
        );
      } catch {
        setAllowedMaterialIds(new Set());
      }
    })();
  }, [baseId]);

  useEffect(() => {
    if (materialId && allowedMaterialIds.size > 0 && !allowedMaterialIds.has(materialId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear material when base compatibility changes
      setMaterialId("");
    }
  }, [allowedMaterialIds, materialId]);

  const materialOptions = useMemo(() => {
    const filtered =
      allowedMaterialIds.size > 0
        ? materials.filter((m) => allowedMaterialIds.has(m.id))
        : materials;
    return toOptions(filtered, "None (optional)");
  }, [materials, allowedMaterialIds]);

  const selectedFamily = useMemo(
    () => families.find((f) => f.id === familyId) ?? null,
    [families, familyId]
  );

  const supportsAxis = Boolean(selectedFamily?.supportsAxis);
  const supportsAdd = Boolean(selectedFamily?.supportsAdd);
  const supportsEye = Boolean(selectedFamily?.supportsEye);
  const supportsProgressiveType = Boolean(
    selectedFamily?.supportsProgressiveType
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset family-scoped selections
    if (!supportsAxis) setAxisIds([]);
    if (!supportsAdd) setAdditionIds([]);
    if (!supportsProgressiveType) setProgressiveTypeId("");
  }, [familyId, supportsAxis, supportsAdd, supportsProgressiveType]);

  const selectedRangesAllowAxis = useMemo(() => {
    if (powerRangeIds.length === 0) return false;
    const byId = new Map(powerRanges.map((r) => [r.id, r]));
    return powerRangeIds.some((id) => {
      const r = byId.get(id);
      return r ? powerRangeAllowsAxis(r.cylMin, r.cylMax) : false;
    });
  }, [powerRangeIds, powerRanges]);

  const showAxisMulti = supportsAxis && selectedRangesAllowAxis;

  const catalogPayload = useMemo(
    () => ({
      familyId,
      baseId,
      materialId: materialId || null,
      indexId: indexId || null,
      coatingId,
      colorId: colorId || null,
      diameterId: diameterId || null,
      progressiveTypeId: supportsProgressiveType
        ? progressiveTypeId || null
        : null,
      powerRangeIds,
      axisIds: showAxisMulti ? axisIds : [],
      additionIds: supportsAdd ? additionIds : [],
    }),
    [
      familyId,
      baseId,
      materialId,
      indexId,
      coatingId,
      colorId,
      diameterId,
      supportsProgressiveType,
      progressiveTypeId,
      powerRangeIds,
      showAxisMulti,
      axisIds,
      supportsAdd,
      additionIds,
    ]
  );

  const canPreview =
    Boolean(familyId && baseId && coatingId) && powerRangeIds.length > 0;

  useEffect(() => {
    if (!canPreview) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale preview
      setPreview(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setPreviewBusy(true);
        try {
          const res = await previewLensProductRequest(catalogPayload);
          if (!cancelled) setPreview(res.preview);
        } catch {
          if (!cancelled) setPreview(null);
        } finally {
          if (!cancelled) setPreviewBusy(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [canPreview, catalogPayload]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!familyId || !baseId || !coatingId) {
      setError("Family, base, and coating are required.");
      return;
    }
    if (powerRangeIds.length === 0) {
      setError("Select at least one power range.");
      return;
    }
    setBusy(true);
    try {
      const res = await createLensProductRequest({
        ...catalogPayload,
        purchasePrice: purchasePrice.trim() ? Number(purchasePrice) : null,
        sellingPrice: sellingPrice.trim() ? Number(sellingPrice) : null,
      });
      router.push(`${CATALOG_HREF}/${res.product.id}`);
    } catch (err) {
      setError(errorMessage(err, "Failed to create product."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage
      title="New product"
      subtitle="Pick attributes once, then one or more power ranges → variants"
    >
      <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4">
        <Button asChild variant="ghost" className="h-9 gap-1.5 px-2">
          <Link href={CATALOG_HREF}>
            <ArrowLeft className="size-4" />
            Back to catalog
          </Link>
        </Button>
      </div>

      {error ? <div className={`${errorBannerClass} mb-4`}>{error}</div> : null}
      {powerRangesError ? (
        <div className={`${errorBannerClass} mb-4`}>
          {powerRangesError.message}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="grid gap-5 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CatalogSelectField
            label="Family"
            required
            value={familyId}
            onValueChange={setFamilyId}
            options={toOptions(families)}
            disabled={attrsLoading}
            placeholder="Select family"
          />
          <CatalogSelectField
            label="Base"
            required
            value={baseId}
            onValueChange={setBaseId}
            options={toOptions(bases)}
            disabled={attrsLoading}
            placeholder="Select base"
          />
          <CatalogSelectField
            label="Material"
            value={materialId}
            onValueChange={setMaterialId}
            options={materialOptions}
            disabled={attrsLoading || !baseId}
            placeholder="Optional"
            hint={!baseId ? "Select a base first for compatible materials." : undefined}
          />
          <CatalogSelectField
            label="Index"
            value={indexId}
            onValueChange={setIndexId}
            options={toOptions(indexes, "None (optional)")}
            disabled={attrsLoading}
            placeholder="Optional"
          />
          <CatalogSelectField
            label="Coating"
            required
            value={coatingId}
            onValueChange={setCoatingId}
            options={toOptions(coatings)}
            disabled={attrsLoading}
            placeholder="Select coating"
            hint="Each coating has its own product and variants; power ranges can be shared."
          />
          <CatalogSelectField
            label="Color"
            value={colorId}
            onValueChange={setColorId}
            options={toOptions(colors, "None (optional)")}
            disabled={attrsLoading}
            placeholder="Optional"
          />
          <CatalogSelectField
            label="Diameter"
            value={diameterId}
            onValueChange={setDiameterId}
            options={toOptions(diameters, "None (optional)")}
            disabled={attrsLoading}
            placeholder="Optional"
          />
          {supportsProgressiveType ? (
            <CatalogSelectField
              label="Progressive type"
              value={progressiveTypeId}
              onValueChange={setProgressiveTypeId}
              options={toOptions(progressiveTypes, "None (optional)")}
              disabled={attrsLoading}
              placeholder="Optional"
              hint="Optional — no default. Included in SKU and parent identity."
            />
          ) : null}
          <label className="grid gap-1.5">
            <span className={catalogLabelClass}>Purchase price (₹)</span>
            <Input
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className={inputClass}
              inputMode="decimal"
              placeholder="Optional — 0 if blank"
            />
          </label>
          <label className="grid gap-1.5">
            <span className={catalogLabelClass}>Selling price (₹)</span>
            <Input
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className={inputClass}
              inputMode="decimal"
              placeholder="Optional — 0 if blank"
            />
          </label>
        </div>

        <PowerRangeMultiSelect
          options={powerRanges.map((r) => ({
            id: r.id,
            label: formatPowerRangeCompact(
              r.sphMin,
              r.sphMax,
              r.cylMin,
              r.cylMax
            ),
            cylSummary: "",
          }))}
          selectedIds={powerRangeIds}
          onChange={setPowerRangeIds}
          disabled={powerRangesLoading}
        />

        {showAxisMulti ? (
          <AxisMultiSelect
            options={attrNumericOptions(axes)}
            selectedIds={axisIds}
            onChange={setAxisIds}
            disabled={attrsLoading}
          />
        ) : null}

        {supportsAdd ? (
          <AdditionMultiSelect
            options={attrNumericOptions(additions)}
            selectedIds={additionIds}
            onChange={setAdditionIds}
            disabled={attrsLoading}
          />
        ) : null}

        {supportsEye ? (
          <p className="text-xs text-(--brand-text-muted)">
            This family creates separate LEFT and RIGHT variants automatically
            for each combination — you do not pick eye here.
          </p>
        ) : null}

        <div className="grid gap-2">
          <span className={catalogLabelClass}>
            Variant preview {previewBusy ? "(updating…)" : ""}
          </span>
          <VariantPreviewTable
            rows={preview?.variants ?? []}
            existingParentHint={
              preview?.existingParentId
                ? "Matching parent already exists — save will add these ranges to it."
                : null
            }
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={busy || attrsLoading}
            className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : preview?.existingParentId ? (
              "Add ranges to existing parent"
            ) : (
              "Create parent + variants"
            )}
          </Button>
          <Button asChild type="button" variant="outline" className="h-10 rounded-xl">
            <Link href={CATALOG_HREF}>Cancel</Link>
          </Button>
        </div>
      </form>
      </div>
    </AdminPage>
  );
}
