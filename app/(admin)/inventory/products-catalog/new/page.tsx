"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createCatalogProductRequest,
  type CatalogLensFamily,
} from "@/app/lib/admin-catalog";

const CATALOG_HREF = "/inventory/products-catalog";

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

type CreateForm = {
  lensFamily: CatalogLensFamily;
  category: string;
  brand: string;
  item: string;
  index: string;
  coating: string;
  progressiveType: string;
  defaultPrice: string;
  defaultCostPrice: string;
  notes: string;
};

const EMPTY_CREATE: CreateForm = {
  lensFamily: "SINGLE_VISION",
  category: "",
  brand: "",
  item: "",
  index: "1.56",
  coating: "",
  progressiveType: "",
  defaultPrice: "",
  defaultCostPrice: "",
  notes: "",
};

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

export default function NewCatalogProductPage() {
  const router = useRouter();
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  function goToProduct(id: string) {
    router.push(`${CATALOG_HREF}?selected=${encodeURIComponent(id)}`);
  }

  async function handleCreate() {
    setCreateBusy(true);
    setCreateError("");
    try {
      const price = Number(createForm.defaultPrice);
      if (!(price > 0)) {
        setCreateError("Default selling price must be a positive number.");
        return;
      }
      const indexNum =
        createForm.index.trim() === "" ? null : Number(createForm.index);
      if (
        (createForm.lensFamily === "SINGLE_VISION" ||
          createForm.lensFamily === "PROGRESSIVE") &&
        (indexNum == null || !Number.isFinite(indexNum))
      ) {
        setCreateError("Index is required for this lens family.");
        return;
      }
      const res = await createCatalogProductRequest({
        lensFamily: createForm.lensFamily,
        category: createForm.category.trim() || null,
        brand: createForm.brand.trim(),
        item: createForm.item.trim() || null,
        index: indexNum,
        coating: createForm.coating.trim(),
        progressiveType: createForm.progressiveType.trim() || null,
        defaultPrice: price,
        defaultCostPrice:
          createForm.defaultCostPrice.trim() === ""
            ? null
            : Number(createForm.defaultCostPrice),
        notes: createForm.notes.trim() || null,
      });
      goToProduct(res.product.id);
    } catch (err) {
      if (
        err instanceof AdminApiError &&
        err.code === "LEGACY_IDENTITY_EXISTS"
      ) {
        const link = window.confirm(
          `${errorMessage(err, "Legacy inventory exists for this identity.")}\n\nLink existing legacy bands into a catalog facade without changing stock? (Does not split band quantities.)`
        );
        if (link) {
          try {
            const res = await createCatalogProductRequest({
              lensFamily: createForm.lensFamily,
              category: createForm.category.trim() || null,
              brand: createForm.brand.trim(),
              item: createForm.item.trim() || null,
              index:
                createForm.index.trim() === ""
                  ? null
                  : Number(createForm.index),
              coating: createForm.coating.trim(),
              progressiveType: createForm.progressiveType.trim() || null,
              defaultPrice: Number(createForm.defaultPrice),
              defaultCostPrice:
                createForm.defaultCostPrice.trim() === ""
                  ? null
                  : Number(createForm.defaultCostPrice),
              notes: createForm.notes.trim() || null,
              linkLegacy: true,
            });
            goToProduct(res.product.id);
            return;
          } catch (linkErr) {
            setCreateError(
              errorMessage(linkErr, "Could not link legacy product.")
            );
            return;
          }
        }
      }
      setCreateError(errorMessage(err, "Could not create product."));
    } finally {
      setCreateBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleCreate();
  }

  return (
    <AdminPage title="Create product" subtitle="Products & catalog">
      <div className="mb-5">
        <Link
          href={CATALOG_HREF}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to catalog
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto grid max-w-2xl gap-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6"
      >
        <p className="text-sm text-(--brand-text-muted)">
          Define product identity first. Ranges and power bands are added on the
          detail screen.
        </p>

        {createError ? <p className={errorBannerClass}>{createError}</p> : null}

        <div>
          <label className={labelClass}>Lens type</label>
          <select
            className={selectClass}
            value={createForm.lensFamily}
            onChange={(e) =>
              setCreateForm((f) => ({
                ...f,
                lensFamily: e.target.value as CatalogLensFamily,
              }))
            }
          >
            <option value="SINGLE_VISION">Single Vision</option>
            <option value="KRYPTOK">Kryptok</option>
            <option value="PROGRESSIVE">Progressive</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Brand</label>
          <Input
            className={inputClass}
            value={createForm.brand}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, brand: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelClass}>Coating</label>
          <Input
            className={inputClass}
            value={createForm.coating}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, coating: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelClass}>Item / product line</label>
          <Input
            className={inputClass}
            value={createForm.item}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, item: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelClass}>Category / kind</label>
          <Input
            className={inputClass}
            value={createForm.category}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, category: e.target.value }))
            }
          />
        </div>
        {(createForm.lensFamily === "SINGLE_VISION" ||
          createForm.lensFamily === "PROGRESSIVE") && (
          <div>
            <label className={labelClass}>Index</label>
            <Input
              className={inputClass}
              value={createForm.index}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, index: e.target.value }))
              }
            />
          </div>
        )}
        {createForm.lensFamily === "PROGRESSIVE" ? (
          <div>
            <label className={labelClass}>Progressive type</label>
            <Input
              className={inputClass}
              value={createForm.progressiveType}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  progressiveType: e.target.value,
                }))
              }
            />
          </div>
        ) : null}
        <div>
          <label className={labelClass}>Default selling price</label>
          <Input
            className={inputClass}
            type="number"
            min={0}
            step="0.01"
            value={createForm.defaultPrice}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, defaultPrice: e.target.value }))
            }
          />
        </div>
        <div>
          <label className={labelClass}>Cost price (optional)</label>
          <Input
            className={inputClass}
            type="number"
            min={0}
            step="0.01"
            value={createForm.defaultCostPrice}
            onChange={(e) =>
              setCreateForm((f) => ({
                ...f,
                defaultCostPrice: e.target.value,
              }))
            }
          />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <Input
            className={inputClass}
            value={createForm.notes}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, notes: e.target.value }))
            }
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit" className="rounded-xl" disabled={createBusy}>
            {createBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={createBusy}
            onClick={() => router.push(CATALOG_HREF)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </AdminPage>
  );
}
