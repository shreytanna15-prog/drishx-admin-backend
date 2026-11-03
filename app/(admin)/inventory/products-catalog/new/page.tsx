"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { SkuChip } from "@/components/catalog/sku-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createLensProductRequest,
  fetchAttributeCompatibility,
  fetchLensAttributes,
  type LensAttribute,
} from "@/app/lib/admin-lens-catalog";
import { useGetPowerRanges } from "@/app/lib/modules/lens-catalog/query/use-get-power-ranges";
import { buildLensProductSkuCode } from "@/app/lib/catalog/lens-product-sku";

const CATALOG_HREF = "/inventory/products-catalog";

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const selectTriggerClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) min-w-0";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

type FormState = {
  name: string;
  familyId: string;
  baseId: string;
  materialId: string;
  indexId: string;
  coatingId: string;
  colorId: string;
  rangeType: string;
  powerRangeId: string;
  addMin: string;
  addMax: string;
  axis: string;
  eye: string;
  defaultPrice: string;
};

const EMPTY: FormState = {
  name: "",
  familyId: "",
  baseId: "",
  materialId: "",
  indexId: "",
  coatingId: "",
  colorId: "",
  rangeType: "NORMAL",
  powerRangeId: "",
  addMin: "",
  addMax: "",
  axis: "",
  eye: "",
  defaultPrice: "",
};

export default function NewLensProductPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);
  const [indexes, setIndexes] = useState<LensAttribute[]>([]);
  const [coatings, setCoatings] = useState<LensAttribute[]>([]);
  const [colors, setColors] = useState<LensAttribute[]>([]);
  const [allowedMaterialIds, setAllowedMaterialIds] = useState<Set<string>>(
    new Set()
  );
  const [attrsLoading, setAttrsLoading] = useState(true);
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
        const [f, b, m, i, c, col] = await Promise.all([
          fetchLensAttributes("family", { activeOnly: true }),
          fetchLensAttributes("base", { activeOnly: true }),
          fetchLensAttributes("material", { activeOnly: true }),
          fetchLensAttributes("index", { activeOnly: true }),
          fetchLensAttributes("coating", { activeOnly: true }),
          fetchLensAttributes("color", { activeOnly: true }),
        ]);
        setFamilies(f.items);
        setBases(b.items);
        setMaterials(m.items);
        setIndexes(i.items);
        setCoatings(c.items);
        setColors(col.items);
      } catch (err) {
        setError(errorMessage(err, "Failed to load attributes."));
      } finally {
        setAttrsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.baseId) {
      setAllowedMaterialIds(new Set());
      return;
    }
    void (async () => {
      try {
        const res = await fetchAttributeCompatibility(form.baseId);
        const ids = new Set(
          res.bases
            .flatMap((b) => b.materials)
            .filter((m) => m.isActive)
            .map((m) => m.id)
        );
        setAllowedMaterialIds(ids);
        setForm((prev) =>
          prev.materialId && !ids.has(prev.materialId)
            ? { ...prev, materialId: "" }
            : prev
        );
      } catch {
        setAllowedMaterialIds(new Set(materials.map((m) => m.id)));
      }
    })();
  }, [form.baseId, materials]);

  const materialOptions = useMemo(() => {
    if (!form.baseId) return [];
    return materials.filter((m) => allowedMaterialIds.has(m.id));
  }, [materials, allowedMaterialIds, form.baseId]);

  const selectedFamily = families.find((f) => f.id === form.familyId);
  const showKtFields =
    selectedFamily?.code === "KT" || selectedFamily?.code === "V2";

  const generatedSku = useMemo(() => {
    const family = families.find((f) => f.id === form.familyId);
    const base = bases.find((b) => b.id === form.baseId);
    const material = materials.find((m) => m.id === form.materialId);
    const range = powerRanges.find((r) => r.id === form.powerRangeId);
    if (!family || !base || !range) return "";
    const { sphMin, sphMax, cylMin, cylMax } = range;
    try {
      return buildLensProductSkuCode({
        familyCode: family.code,
        baseCode: base.code,
        materialCode: material?.code ?? null,
        indexCode: indexes.find((i) => i.id === form.indexId)?.code ?? null,
        coatingCode:
          coatings.find((c) => c.id === form.coatingId)?.code ?? null,
        colorCode: colors.find((c) => c.id === form.colorId)?.code ?? null,
        sphMin,
        sphMax,
        cylMin,
        cylMax,
        rangeType: form.rangeType,
      });
    } catch {
      return "";
    }
  }, [
    families,
    bases,
    materials,
    indexes,
    coatings,
    colors,
    form.familyId,
    form.baseId,
    form.materialId,
    form.indexId,
    form.coatingId,
    form.colorId,
    form.powerRangeId,
    powerRanges,
    form.rangeType,
  ]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        familyId: form.familyId,
        baseId: form.baseId,
        materialId: form.materialId || null,
        indexId: form.indexId || null,
        coatingId: form.coatingId || null,
        colorId: form.colorId || null,
        rangeType: form.rangeType,
        powerRangeId: form.powerRangeId,
        defaultPrice:
          form.defaultPrice.trim() === "" ? null : Number(form.defaultPrice),
      };
      if (showKtFields) {
        body.addMin = form.addMin.trim() === "" ? null : Number(form.addMin);
        body.addMax = form.addMax.trim() === "" ? null : Number(form.addMax);
        body.axis = form.axis.trim() === "" ? null : Number(form.axis);
        body.eye = form.eye || null;
      }
      const res = await createLensProductRequest(body);
      router.push(`${CATALOG_HREF}/${res.product.id}`);
    } catch (err) {
      setError(errorMessage(err, "Failed to create product."));
    } finally {
      setBusy(false);
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <AdminPage
      title="Create product"
      subtitle="Pick attributes and a power range. SKU is generated automatically."
    >
      <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6">
        <Button asChild variant="outline" className="h-9 rounded-xl">
          <Link href={CATALOG_HREF}>
            <ArrowLeft className="mr-1 size-4" />
            Back to catalog
          </Link>
        </Button>

        {error ? <div className={errorBannerClass}>{error}</div> : null}
        {attrsLoading ? (
          <p className="text-sm text-(--brand-text-muted)">Loading attributes…</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className={labelClass}>Product name</span>
            <Input
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Hard Coat Single Vision +"
            />
          </label>
          <div className="space-y-1">
            <span className={labelClass}>SKU (auto)</span>
            <div className="flex min-h-10 items-center" aria-live="polite">
              {generatedSku ? (
                <SkuChip sku={generatedSku} />
              ) : (
                <span className="text-sm text-(--brand-text-muted)">
                  Select Family, Base + power range
                </span>
              )}
            </div>
          </div>
          <label className="space-y-1">
            <span className={labelClass}>Default price (optional)</span>
            <Input
              className={inputClass}
              value={form.defaultPrice}
              onChange={(e) => set("defaultPrice", e.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className={labelClass}>Family *</span>
            <AdminSelect
              value={form.familyId}
              onValueChange={(v) => set("familyId", v)}
              options={[
                { value: "", label: "Select…" },
                ...families.map((f) => ({
                  value: f.id,
                  label: `${f.code} — ${f.name}`,
                })),
              ]}
              placeholder="Select…"
              triggerClassName={selectTriggerClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Base *</span>
            <AdminSelect
              value={form.baseId}
              onValueChange={(v) => set("baseId", v)}
              options={[
                { value: "", label: "Select…" },
                ...bases.map((b) => ({
                  value: b.id,
                  label: `${b.code} — ${b.name}`,
                })),
              ]}
              placeholder="Select…"
              triggerClassName={selectTriggerClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Material (optional)</span>
            <AdminSelect
              value={form.materialId}
              disabled={!form.baseId}
              onValueChange={(v) => set("materialId", v)}
              options={[
                {
                  value: "",
                  label: form.baseId ? "None" : "Pick base first",
                },
                ...materialOptions.map((m) => ({
                  value: m.id,
                  label: `${m.code} — ${m.name}`,
                })),
              ]}
              placeholder="None"
              triggerClassName={selectTriggerClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Index</span>
            <AdminSelect
              value={form.indexId}
              onValueChange={(v) => set("indexId", v)}
              options={[
                { value: "", label: "None" },
                ...indexes.map((i) => ({ value: i.id, label: i.code })),
              ]}
              placeholder="None"
              triggerClassName={selectTriggerClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Coating</span>
            <AdminSelect
              value={form.coatingId}
              onValueChange={(v) => set("coatingId", v)}
              options={[
                { value: "", label: "None" },
                ...coatings.map((c) => ({
                  value: c.id,
                  label: `${c.code} — ${c.name}`,
                })),
              ]}
              placeholder="None"
              triggerClassName={selectTriggerClass}
            />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Color (tint)</span>
            <AdminSelect
              value={form.colorId}
              onValueChange={(v) => set("colorId", v)}
              options={[
                { value: "", label: "None" },
                ...colors.map((c) => ({
                  value: c.id,
                  label: `${c.code} — ${c.name}`,
                })),
              ]}
              placeholder="None"
              triggerClassName={selectTriggerClass}
            />
          </label>
        </div>

        <div className="space-y-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4">
          <p className="text-sm font-bold text-(--brand-text)">Power range</p>
          <p className="text-xs text-(--brand-text-muted)">
            Pick an active power range from Attributes → Power range. Its SPH/CYL
            bounds drive the matrix and the SKU.
          </p>
          {powerRangesError ? (
            <div className={errorBannerClass}>
              {powerRangesError.message || "Failed to load power ranges."}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className={labelClass}>Power range *</span>
              <AdminSelect
                value={form.powerRangeId}
                disabled={powerRangesLoading}
                onValueChange={(v) => set("powerRangeId", v)}
                options={[
                  {
                    value: "",
                    label: powerRangesLoading
                      ? "Loading…"
                      : powerRanges.length === 0
                        ? "No active power ranges"
                        : "Select…",
                  },
                  ...powerRanges.map((r) => ({
                    value: r.id,
                    label: `${r.label} (${r.cylSummary})`,
                  })),
                ]}
                placeholder="Select…"
                triggerClassName={selectTriggerClass}
              />
            </label>
            <label className="space-y-1">
              <span className={labelClass}>Range type</span>
              <AdminSelect
                value={form.rangeType}
                onValueChange={(v) => set("rangeType", v)}
                options={[
                  { value: "NORMAL", label: "NORMAL" },
                  { value: "CROSS", label: "CROSS" },
                ]}
                placeholder="Range type"
                triggerClassName={selectTriggerClass}
              />
            </label>
          </div>

          {showKtFields ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1">
                <span className={labelClass}>ADD min</span>
                <Input
                  className={inputClass}
                  value={form.addMin}
                  onChange={(e) => set("addMin", e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>ADD max</span>
                <Input
                  className={inputClass}
                  value={form.addMax}
                  onChange={(e) => set("addMax", e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>AXIS</span>
                <Input
                  className={inputClass}
                  value={form.axis}
                  onChange={(e) => set("axis", e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>EYE</span>
                <AdminSelect
                  value={form.eye}
                  onValueChange={(v) => set("eye", v)}
                  options={[
                    { value: "", label: "None" },
                    { value: "LEFT", label: "LEFT" },
                    { value: "RIGHT", label: "RIGHT" },
                    { value: "BOTH", label: "BOTH" },
                  ]}
                  placeholder="None"
                  triggerClassName={selectTriggerClass}
                />
              </label>
            </div>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={busy || attrsLoading || powerRangesLoading}
          className="h-11 rounded-xl bg-(--brand-primary) px-6 font-bold text-black"
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Create product
        </Button>
      </form>
    </AdminPage>
  );
}
