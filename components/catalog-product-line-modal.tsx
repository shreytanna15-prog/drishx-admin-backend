"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Layers, Loader2, Pencil, Plus } from "lucide-react";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createAdminCatalogLine,
  updateAdminCatalogLine,
  type AdminCatalogProductLine,
  type LensCategoryType,
} from "@/app/lib/admin-lenses";
import { AdminModal } from "@/components/admin-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CatalogProductLineModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lensType: LensCategoryType;
  editing: AdminCatalogProductLine | null;
  onSaved: (line: AdminCatalogProductLine) => void;
};

const LENS_TYPE_LABEL: Record<LensCategoryType, string> = {
  "single-vision": "Single Vision",
  kryptok: "Kryptok",
  progressive: "Progressive",
};

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-11 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";

export function CatalogProductLineModal({
  open,
  onOpenChange,
  lensType,
  editing,
  onSaved,
}: CatalogProductLineModalProps) {
  const isEdit = Boolean(editing);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setSortOrder(String(editing.sortOrder ?? 0));
      setIsActive(editing.isActive);
    } else {
      setName("");
      setDescription("");
      setSortOrder("999");
      setIsActive(true);
    }
    setError("");
    setSubmitting(false);
  }, [open, editing]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    const parsedSort = Number(sortOrder);
    const sortValue = Number.isFinite(parsedSort) ? parsedSort : 0;

    setSubmitting(true);
    try {
      if (editing) {
        const data = await updateAdminCatalogLine(editing.id, {
          name: editing.isSystem ? undefined : trimmedName,
          description: description.trim() || null,
          sortOrder: sortValue,
          isActive,
        });
        onSaved(data.item);
      } else {
        const data = await createAdminCatalogLine({
          lensType,
          name: trimmedName,
          description: description.trim() || null,
          sortOrder: sortValue,
        });
        onSaved(data.item);
      }
      handleOpenChange(false);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : isEdit
            ? "Failed to update product line."
            : "Failed to create product line."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminModal
      open={open}
      onOpenChange={handleOpenChange}
      size="md"
      title={isEdit ? "Edit product line" : "Add product line"}
      description={
        isEdit
          ? "Update how this line appears in stock and shop catalogs."
          : `Create a custom line under ${LENS_TYPE_LABEL[lensType]}. Stock matching uses the same category or item name.`
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(240,161,50,0.16)] text-(--brand-primary)">
            {isEdit ? (
              <Pencil className="size-4" />
            ) : (
              <Layers className="size-4" />
            )}
          </span>
          <span className="inline-flex rounded-full border border-[rgba(240,161,50,0.35)] bg-[rgba(240,161,50,0.1)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--brand-primary)">
            {LENS_TYPE_LABEL[lensType]}
          </span>
        </div>

        {error ? (
          <div className="auth-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-(--brand-card-border) bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Line details
          </p>

          <label className="block space-y-1.5" htmlFor="catalog-line-name">
            <span className={labelClass}>Name</span>
            <Input
              id="catalog-line-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CUSTOM BRC"
              disabled={Boolean(editing?.isSystem)}
              className={inputClass}
            />
            {editing?.isSystem ? (
              <p className="text-xs text-(--brand-text-muted)">
                System lines cannot be renamed.
              </p>
            ) : (
              <p className="text-xs text-(--brand-text-muted)">
                This name is used to group matching SKUs.
              </p>
            )}
          </label>

          <label
            className="block space-y-1.5"
            htmlFor="catalog-line-description"
          >
            <span className={labelClass}>Description</span>
            <Input
              id="catalog-line-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note for your team"
              className={inputClass}
            />
          </label>

          <label className="block space-y-1.5" htmlFor="catalog-line-sort">
            <span className={labelClass}>Sort order</span>
            <Input
              id="catalog-line-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-(--brand-text-muted)">
              Lower numbers appear first in the catalog.
            </p>
          </label>
        </section>

        {isEdit ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-(--brand-card-border) bg-[rgba(255,255,255,0.02)] p-4 transition hover:border-[rgba(240,161,50,0.4)]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-0.5 size-4 rounded border-(--brand-input-border) accent-(--brand-primary)"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-bold text-(--brand-text)">
                Active in catalogs
              </span>
              <span className="block text-xs text-(--brand-text-muted)">
                When off, this line stays hidden from shop and stock lists.
              </span>
            </span>
          </label>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-(--brand-card-border) pt-4 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
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
            ) : isEdit ? (
              "Save changes"
            ) : (
              <>
                <Plus className="size-4" />
                Create line
              </>
            )}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
