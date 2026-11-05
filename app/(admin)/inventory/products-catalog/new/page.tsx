"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import {
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

export default function NewLensProductPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);
  const [indexes, setIndexes] = useState<LensAttribute[]>([]);
  const [colors, setColors] = useState<LensAttribute[]>([]);
  const [allowedMaterialIds, setAllowedMaterialIds] = useState<Set<string>>(
    new Set()
  );
  const [attrsLoading, setAttrsLoading] = useState(true);

  const [familyId, setFamilyId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [indexId, setIndexId] = useState("");
  const [colorId, setColorId] = useState("");
  const [powerRangeIds, setPowerRangeIds] = useState<string[]>([]);
  const [defaultPrice, setDefaultPrice] = useState("");
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
        const [f, b, m, i, col] = await Promise.all([
          fetchLensAttributes("family", { activeOnly: true }),
          fetchLensAttributes("base", { activeOnly: true }),
          fetchLensAttributes("material", { activeOnly: true }),
          fetchLensAttributes("index", { activeOnly: true }),
          fetchLensAttributes("color", { activeOnly: true }),
        ]);
        setFamilies(f.items);
        setBases(b.items);
        setMaterials(m.items);
        setIndexes(i.items);
        setColors(col.items);
      } catch (err) {
        setError(errorMessage(err, "Failed to load attributes."));
      } finally {
        setAttrsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!baseId) {
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

  const canPreview =
    Boolean(familyId && baseId && indexId && colorId) &&
    powerRangeIds.length > 0;

  useEffect(() => {
    if (!canPreview) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setPreviewBusy(true);
        try {
          const res = await previewLensProductRequest({
            familyId,
            baseId,
            materialId: materialId || null,
            indexId,
            colorId,
            powerRangeIds,
          });
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
  }, [canPreview, familyId, baseId, materialId, indexId, colorId, powerRangeIds]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!familyId || !baseId || !indexId || !colorId) {
      setError("Family, base, index, and color are required.");
      return;
    }
    if (powerRangeIds.length === 0) {
      setError("Select at least one power range.");
      return;
    }
    setBusy(true);
    try {
      const res = await createLensProductRequest({
        familyId,
        baseId,
        materialId: materialId || null,
        indexId,
        colorId,
        powerRangeIds,
        defaultPrice: defaultPrice.trim() ? Number(defaultPrice) : null,
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
            required
            value={indexId}
            onValueChange={setIndexId}
            options={toOptions(indexes)}
            disabled={attrsLoading}
            placeholder="Select index"
          />
          <CatalogSelectField
            label="Color"
            required
            value={colorId}
            onValueChange={setColorId}
            options={toOptions(colors)}
            disabled={attrsLoading}
            placeholder="Select color"
          />
          <label className="grid gap-1.5">
            <span className={catalogLabelClass}>Default price (₹)</span>
            <Input
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
              className={inputClass}
              inputMode="decimal"
              placeholder="Optional — applied to new variants"
            />
          </label>
        </div>

        <PowerRangeMultiSelect
          options={powerRanges.map((r) => ({
            id: r.id,
            label: r.label,
            cylSummary: r.cylSummary,
          }))}
          selectedIds={powerRangeIds}
          onChange={setPowerRangeIds}
          disabled={powerRangesLoading}
        />

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
