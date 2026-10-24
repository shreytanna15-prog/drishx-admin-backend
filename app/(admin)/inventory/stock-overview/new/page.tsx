"use client";

import {
  Suspense,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Glasses,
  Loader2,
  PackagePlus,
  Plus,
  Ruler,
} from "lucide-react";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  type LensCategoryType,
  createAdminLens,
  fetchAdminCoatingFilters,
} from "@/app/lib/admin-lenses";
import { Eye } from "@prisma/client";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AXIS_OPTIONS = [90, 180, 45, 135, -45, -135] as const;

const LENS_TYPE_LABEL: Record<LensCategoryType, string> = {
  "single-vision": "Single Vision",
  kryptok: "Kryptok",
  progressive: "Progressive",
};

const LENS_TYPES = Object.keys(LENS_TYPE_LABEL) as LensCategoryType[];

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-11 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const selectClass =
  "h-11 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) [&>option]:bg-(--brand-card) [&>option]:text-(--brand-text)";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-(--brand-text-muted)">{hint}</span>
      ) : null}
    </label>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-(--brand-card-border) bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-[rgba(240,161,50,0.14)] text-(--brand-primary)">
          {icon}
        </span>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

function isLensType(value: string | null): value is LensCategoryType {
  return value != null && (LENS_TYPES as string[]).includes(value);
}

/** Stock Overview URL that restores the view the user came from. */
function buildStockOverviewHref(
  lensType: LensCategoryType,
  defaultItem: string | null
) {
  const params = new URLSearchParams({ type: lensType });
  if (defaultItem) params.set("item", defaultItem);
  return `/inventory/stock-overview?${params.toString()}`;
}

function AddLensForm({
  lensType,
  defaultItem,
}: {
  lensType: LensCategoryType;
  defaultItem: string | null;
}) {
  const router = useRouter();
  const backHref = buildStockOverviewHref(lensType, defaultItem);

  const isSV = lensType === "single-vision";
  const isKT = lensType === "kryptok";
  const isProg = lensType === "progressive";

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [category, setCategory] = useState(defaultItem ?? "");
  const [brand, setBrand] = useState("");
  const [item, setItem] = useState(isKT ? (defaultItem ?? "") : "");
  const [index, setIndex] = useState("");
  const [coating, setCoating] = useState("");
  const [coatingOptions, setCoatingOptions] = useState<string[]>([]);
  const [coatingsLoading, setCoatingsLoading] = useState(true);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [costPrice, setCostPrice] = useState("");

  const [sph, setSph] = useState("");
  const [sphStartRange, setSphStartRange] = useState("");
  const [cyl, setCyl] = useState("");
  const [cylStartRange, setCylStartRange] = useState("");

  const [crossPowerMode, setCrossPowerMode] = useState(false);
  const [crossPower, setCrossPower] = useState("");

  const [axis, setAxis] = useState("");
  const [add, setAdd] = useState("");

  const [progType, setProgType] = useState("");
  const [eye, setEye] = useState<Eye | "">("");

  const pageTitle = isSV
    ? "Add Single Vision product"
    : isKT
      ? "Add Kryptok product"
      : "Add Progressive product";

  useEffect(() => {
    let cancelled = false;
    setCoatingsLoading(true);
    void fetchAdminCoatingFilters(lensType, { includeInactive: false })
      .then((res) => {
        if (cancelled) return;
        const names = (Array.isArray(res.items) ? res.items : [])
          .filter((label) => label.isActive)
          .map((label) => label.name);
        setCoatingOptions(names);
      })
      .catch(() => {
        if (cancelled) return;
        setCoatingOptions([]);
      })
      .finally(() => {
        if (!cancelled) setCoatingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lensType]);

  function validate(): string | null {
    const require = (v: string, name: string) => {
      if (!v.trim()) return `${name} is required.`;
      return null;
    };

    if (isSV) {
      if (crossPowerMode) {
        const msg = require(crossPower, "Cross power");
        if (msg) return msg;
        const n = Number(crossPower.trim());
        if (!Number.isFinite(n) || Math.abs(n) <= 1e-9) {
          return "Cross power must be a non-zero number.";
        }
        return null;
      }
      return (
        require(brand, "Brand") ??
        require(index, "Index") ??
        require(coating, "Coating") ??
        require(price, "Price") ??
        require(sph, "SPH") ??
        require(sphStartRange, "SPH start range") ??
        (cyl.trim() ? require(cylStartRange, "CYL start range") : null)
      );
    }

    if (isKT) {
      return (
        require(sph, "SPH") ??
        require(sphStartRange, "SPH start range") ??
        require(add, "ADD") ??
        require(price, "Price") ??
        (cyl.trim() ? require(cylStartRange, "CYL start range") : null)
      );
    }

    return (
      require(item, "Item") ??
      require(brand, "Brand") ??
      require(index, "Index") ??
      require(progType, "Type") ??
      require(coating, "Coating") ??
      require(sph, "SPH") ??
      require(sphStartRange, "SPH start range") ??
      require(add, "ADD") ??
      require(eye as string, "Eye") ??
      require(price, "Price") ??
      (cyl.trim() ? require(cylStartRange, "CYL start range") : null)
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    setSubmitting(true);
    try {
      if (isSV) {
        await createAdminLens("single-vision", {
          category: category.trim() || null,
          brand: brand.trim(),
          item: item.trim() || null,
          index: index.trim(),
          coating: coating.trim(),
          sph: crossPowerMode ? null : sph.trim(),
          sphStartRange: crossPowerMode ? null : sphStartRange.trim(),
          cyl: crossPowerMode ? null : cyl.trim() || null,
          cylStartRange: crossPowerMode ? null : cylStartRange.trim() || null,
          crossPower: crossPowerMode ? crossPower.trim() : null,
          price: price.trim(),
          quantity: quantity.trim() ? quantity.trim() : 0,
          costPrice: costPrice.trim() ? costPrice.trim() : null,
        });
      } else if (isKT) {
        await createAdminLens("kryptok", {
          category: category.trim() || null,
          brand: brand.trim() || null,
          item: item.trim() || null,
          coating: coating.trim() || null,
          sph: sph.trim(),
          sphStartRange: sphStartRange.trim(),
          cyl: cyl.trim() || null,
          cylStartRange: cylStartRange.trim() || null,
          axis: axis.trim() ? axis.trim() : null,
          add: add.trim(),
          price: price.trim(),
          quantity: quantity.trim() ? quantity.trim() : 0,
          costPrice: costPrice.trim() ? costPrice.trim() : null,
        });
      } else {
        await createAdminLens("progressive", {
          category: category.trim() || null,
          item: item.trim(),
          brand: brand.trim(),
          index: index.trim(),
          type: progType.trim(),
          coating: coating.trim(),
          sph: sph.trim(),
          sphStartRange: sphStartRange.trim(),
          cyl: cyl.trim() || null,
          cylStartRange: cylStartRange.trim() || null,
          axis: axis.trim() ? axis.trim() : null,
          add: add.trim(),
          eye,
          price: price.trim(),
          quantity: quantity.trim() ? quantity.trim() : 0,
          costPrice: costPrice.trim() ? costPrice.trim() : null,
        });
      }

      router.push(backHref);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create product."
      );
      setSubmitting(false);
    }
  }

  return (
    <AdminPage title={pageTitle} subtitle="Inventory · Stock Overview">
      <div className="mb-5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to Stock Overview
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-2xl flex-col gap-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(240,161,50,0.16)] text-(--brand-primary)">
            <PackagePlus className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm leading-relaxed text-(--brand-text-muted)">
              Create one inventory SKU. It will appear under the matching
              product line in Stock Overview.
            </p>
            <span className="inline-flex rounded-full border border-[rgba(240,161,50,0.35)] bg-[rgba(240,161,50,0.1)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--brand-primary)">
              {LENS_TYPE_LABEL[lensType]}
            </span>
          </div>
        </div>

        {error ? (
          <div className="auth-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <Section icon={<Glasses className="size-3.5" />} title="Identity">
          <Field
            id="admin-add-product-category"
            label="Product line / category"
            hint="Prefills from the line you opened. Keep this matching the catalog card."
          >
            <Input
              id="admin-add-product-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. BRC, HC KT, BRC V2"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="admin-add-product-brand"
              label={isKT ? "Brand (optional)" : "Brand"}
            >
              <Input
                id="admin-add-product-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Brand / product name"
                className={inputClass}
              />
            </Field>

            <Field
              id="admin-add-product-item"
              label={isProg ? "Item" : "Item (optional)"}
            >
              <Input
                id="admin-add-product-item"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder={isProg ? "e.g. WHITE PROGRESSIVE" : "Optional"}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {isSV || isProg ? (
              <Field id="admin-add-product-index" label="Index">
                <Input
                  id="admin-add-product-index"
                  value={index}
                  onChange={(e) => setIndex(e.target.value)}
                  placeholder="e.g. 1.56"
                  className={inputClass}
                />
              </Field>
            ) : null}

            <Field
              id="admin-add-product-coating"
              label={isKT ? "Coating (optional)" : "Coating"}
              hint={
                coatingsLoading
                  ? "Loading coating filters…"
                  : coatingOptions.length === 0
                    ? "No managed coatings yet — create them under Coating filters in Stock Overview."
                    : "Choose a managed coating filter chip."
              }
            >
              <select
                id="admin-add-product-coating"
                value={coating}
                onChange={(e) => setCoating(e.target.value)}
                disabled={coatingsLoading || coatingOptions.length === 0}
                className={selectClass}
              >
                <option value="">
                  {coatingsLoading
                    ? "Loading…"
                    : coatingOptions.length === 0
                      ? "No coatings available"
                      : "Select coating"}
                </option>
                {coatingOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {isProg ? (
            <Field id="admin-add-product-prog-type" label="Type">
              <Input
                id="admin-add-product-prog-type"
                value={progType}
                onChange={(e) => setProgType(e.target.value)}
                placeholder="e.g. HC, HMC, SHMC"
                className={inputClass}
              />
            </Field>
          ) : null}
        </Section>

        <Section icon={<Ruler className="size-3.5" />} title="Power & range">
          {isSV ? (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--brand-card-border) bg-[rgba(0,0,0,0.15)] p-3 transition hover:border-[rgba(240,161,50,0.4)]">
                <input
                  id="sv-crossPowerMode"
                  type="checkbox"
                  checked={crossPowerMode}
                  onChange={(e) => setCrossPowerMode(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-(--brand-input-border) accent-(--brand-primary)"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-bold text-(--brand-text)">
                    Cross power mode
                  </span>
                  <span className="block text-xs text-(--brand-text-muted)">
                    Hides SPH/CYL and stores a cross-cylinder power instead.
                  </span>
                </span>
              </label>

              {crossPowerMode ? (
                <Field id="sv-crossPower" label="Cross power">
                  <Input
                    id="sv-crossPower"
                    value={crossPower}
                    onChange={(e) => setCrossPower(e.target.value)}
                    placeholder="e.g. -2.00"
                    className={inputClass}
                  />
                </Field>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="sv-sph" label="SPH">
                      <Input
                        id="sv-sph"
                        value={sph}
                        onChange={(e) => setSph(e.target.value)}
                        placeholder="e.g. -0.25"
                        className={inputClass}
                      />
                    </Field>
                    <Field id="sv-sph-range" label="SPH start range">
                      <Input
                        id="sv-sph-range"
                        value={sphStartRange}
                        onChange={(e) => setSphStartRange(e.target.value)}
                        placeholder="e.g. -0.25"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="sv-cyl" label="CYL (optional)">
                      <Input
                        id="sv-cyl"
                        value={cyl}
                        onChange={(e) => setCyl(e.target.value)}
                        placeholder="e.g. -0.75"
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      id="sv-cyl-range"
                      label="CYL start range"
                      hint="Required when CYL is set."
                    >
                      <Input
                        id="sv-cyl-range"
                        value={cylStartRange}
                        onChange={(e) => setCylStartRange(e.target.value)}
                        placeholder="e.g. -0.75"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </>
              )}
            </>
          ) : null}

          {isKT || isProg ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="power-sph" label="SPH">
                  <Input
                    id="power-sph"
                    value={sph}
                    onChange={(e) => setSph(e.target.value)}
                    placeholder={isKT ? "e.g. 1.75" : "e.g. -0.25"}
                    className={inputClass}
                  />
                </Field>
                <Field id="power-sph-range" label="SPH start range">
                  <Input
                    id="power-sph-range"
                    value={sphStartRange}
                    onChange={(e) => setSphStartRange(e.target.value)}
                    placeholder={isKT ? "e.g. 1.75" : "e.g. -0.25"}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="power-cyl" label="CYL (optional)">
                  <Input
                    id="power-cyl"
                    value={cyl}
                    onChange={(e) => setCyl(e.target.value)}
                    placeholder="e.g. -2.00"
                    className={inputClass}
                  />
                </Field>
                <Field
                  id="power-cyl-range"
                  label="CYL start range"
                  hint="Required when CYL is set."
                >
                  <Input
                    id="power-cyl-range"
                    value={cylStartRange}
                    onChange={(e) => setCylStartRange(e.target.value)}
                    placeholder="e.g. -2.00"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="power-add" label="ADD">
                  <Input
                    id="power-add"
                    value={add}
                    onChange={(e) => setAdd(e.target.value)}
                    placeholder={isKT ? "e.g. 1.00" : "e.g. 2.00"}
                    className={inputClass}
                  />
                </Field>

                {isProg ? (
                  <Field id="power-eye" label="Eye">
                    <select
                      id="power-eye"
                      className={selectClass}
                      value={eye}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return setEye("");
                        setEye(v as Eye);
                      }}
                    >
                      <option value="">Select eye</option>
                      <option value="LEFT">LEFT</option>
                      <option value="RIGHT">RIGHT</option>
                    </select>
                  </Field>
                ) : (
                  <Field id="power-axis" label="Axis (optional)">
                    <select
                      id="power-axis"
                      className={selectClass}
                      value={axis}
                      onChange={(e) => setAxis(e.target.value)}
                    >
                      <option value="">None</option>
                      {AXIS_OPTIONS.map((a) => (
                        <option key={a} value={String(a)}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {isProg ? (
                <Field id="power-axis-prog" label="Axis (optional)">
                  <select
                    id="power-axis-prog"
                    className={selectClass}
                    value={axis}
                    onChange={(e) => setAxis(e.target.value)}
                  >
                    <option value="">None</option>
                    {AXIS_OPTIONS.map((a) => (
                      <option key={a} value={String(a)}>
                        {a}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </>
          ) : null}
        </Section>

        <Section
          icon={<CircleDollarSign className="size-3.5" />}
          title="Stock & pricing"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="admin-add-lens-price" label="Selling price">
              <Input
                id="admin-add-lens-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 525"
                className={inputClass}
              />
            </Field>
            <Field id="admin-add-lens-qty" label="Quantity">
              <Input
                id="admin-add-lens-qty"
                value={quantity}
                type="number"
                min={0}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </Field>
          </div>
          <Field id="admin-add-lens-cost" label="Cost price (optional)">
            <Input
              id="admin-add-lens-cost"
              value={costPrice}
              type="number"
              min={0}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>
        </Section>

        <div className="flex flex-col gap-2 border-t border-(--brand-card-border) pt-4 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backHref)}
            disabled={submitting}
            className="h-11 flex-1 rounded-xl border-(--brand-input-border)"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 flex-1 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text) hover:opacity-95"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Plus className="size-4" />
                Add product
              </>
            )}
          </Button>
        </div>
      </form>
    </AdminPage>
  );
}

function NewStockLensContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const itemParam = searchParams.get("item");

  if (!isLensType(typeParam)) {
    return (
      <AdminPage title="Add product" subtitle="Inventory · Stock Overview">
        <div className="mb-5">
          <Link
            href="/inventory/stock-overview"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
          >
            <ArrowLeft className="size-4" />
            Back to Stock Overview
          </Link>
        </div>
        <div className="auth-alert-error" role="alert">
          Missing or invalid lens type. Open Add product from a category in
          Stock Overview.
        </div>
      </AdminPage>
    );
  }

  const defaultItem = itemParam?.trim() ? itemParam.trim() : null;

  return (
    <AddLensForm
      key={`${typeParam}:${defaultItem ?? ""}`}
      lensType={typeParam}
      defaultItem={defaultItem}
    />
  );
}

export default function NewStockLensPage() {
  return (
    <Suspense
      fallback={
        <AdminPage title="Add product" subtitle="Inventory · Stock Overview">
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <NewStockLensContent />
    </Suspense>
  );
}
