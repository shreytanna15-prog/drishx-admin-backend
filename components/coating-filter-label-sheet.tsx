"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Droplets, Loader2, Plus } from "lucide-react";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createAdminCoatingFilter,
  updateAdminCoatingFilter,
  type AdminCoatingFilterLabel,
  type LensCategoryType,
} from "@/app/lib/admin-lenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type CoatingFilterLabelSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lensType: LensCategoryType;
  editing: AdminCoatingFilterLabel | null;
  onSaved: (label: AdminCoatingFilterLabel) => void;
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

export function CoatingFilterLabelSheet({
  open,
  onOpenChange,
  lensType,
  editing,
  onSaved,
}: CoatingFilterLabelSheetProps) {
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
        const data = await updateAdminCoatingFilter(editing.id, {
          name: trimmedName,
          description: description.trim() || null,
          sortOrder: sortValue,
          isActive,
        });
        onSaved(data.item);
      } else {
        const data = await createAdminCoatingFilter({
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
            ? "Failed to update coating filter."
            : "Failed to create coating filter."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden border-(--brand-card-border) bg-(--brand-card) sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b border-(--brand-card-border) pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(240,161,50,0.16)] text-(--brand-primary)">
              {isEdit ? <Droplets className="size-4" /> : <Plus className="size-4" />}
            </span>
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-lg font-extrabold tracking-tight text-(--brand-text)">
                {isEdit ? "Edit coating filter" : "Add coating filter"}
              </SheetTitle>
              <SheetDescription className="text-sm leading-relaxed text-(--brand-text-muted)">
                {isEdit
                  ? "Renaming updates matching product coatings so shop chips stay in sync."
                  : `Create a coating chip under ${LENS_TYPE_LABEL[lensType]}. Products must use this coating name to show the chip.`}
              </SheetDescription>
              <span className="inline-flex rounded-full border border-[rgba(240,161,50,0.35)] bg-[rgba(240,161,50,0.1)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--brand-primary)">
                {LENS_TYPE_LABEL[lensType]}
              </span>
            </div>
          </div>
        </SheetHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
            {error ? (
              <div className="auth-alert-error" role="alert">
                {error}
              </div>
            ) : null}

            <section className="space-y-4 rounded-2xl border border-(--brand-card-border) bg-[rgba(255,255,255,0.02)] p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Filter details
              </p>

              <label className="block space-y-1.5" htmlFor="coating-filter-name">
                <span className={labelClass}>Name</span>
                <Input
                  id="coating-filter-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. GREEN"
                  className={inputClass}
                />
                <p className="text-xs text-(--brand-text-muted)">
                  {isEdit
                    ? "Changing the name rewrites coating on matching SKUs."
                    : "This exact name is stored on products and shown as a chip."}
                </p>
              </label>

              <label
                className="block space-y-1.5"
                htmlFor="coating-filter-description"
              >
                <span className={labelClass}>Description</span>
                <Input
                  id="coating-filter-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional note for your team"
                  className={inputClass}
                />
              </label>

              <label className="block space-y-1.5" htmlFor="coating-filter-sort">
                <span className={labelClass}>Sort order</span>
                <Input
                  id="coating-filter-sort"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-(--brand-text-muted)">
                  Lower numbers appear first in shop and wholesale filter chips.
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
                    Active in shop filters
                  </span>
                  <span className="block text-xs text-(--brand-text-muted)">
                    When off, this chip is hidden from shop and wholesale lists.
                  </span>
                </span>
              </label>
            ) : null}
          </div>

          <SheetFooter className="shrink-0 gap-2 border-t border-(--brand-card-border) px-4 py-4 sm:flex-row">
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
                  Create filter
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
