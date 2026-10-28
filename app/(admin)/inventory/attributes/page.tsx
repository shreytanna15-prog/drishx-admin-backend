"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
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
  createLensAttributeRequest,
  fetchLensAttributes,
  updateLensAttributeRequest,
  type LensAttribute,
  type LensAttributeType,
} from "@/app/lib/admin-lens-catalog";
import { cn } from "@/lib/utils";

const TABS: { id: LensAttributeType; label: string }[] = [
  { id: "family", label: "Family" },
  { id: "base", label: "Base" },
  { id: "material", label: "Material" },
  { id: "index", label: "Index" },
  { id: "coating", label: "Coating" },
  { id: "color", label: "Color" },
];

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

type FormState = {
  code: string;
  name: string;
  sortOrder: string;
  value: string;
};

const EMPTY_FORM: FormState = { code: "", name: "", sortOrder: "0", value: "" };

export default function InventoryAttributesPage() {
  const [tab, setTab] = useState<LensAttributeType>("family");
  const [items, setItems] = useState<LensAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LensAttribute | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchLensAttributes(tab);
      setItems(res.items);
    } catch (err) {
      setError(errorMessage(err, "Failed to load attributes."));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(row: LensAttribute) {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      sortOrder: String(row.sortOrder),
      value: row.value != null ? String(row.value) : "",
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSave() {
    setFormBusy(true);
    setFormError("");
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        sortOrder: Number(form.sortOrder) || 0,
        value:
          tab === "index" && form.value.trim() !== ""
            ? Number(form.value)
            : tab === "index"
              ? null
              : undefined,
      };
      if (!payload.code || !payload.name) {
        setFormError("Code and name are required.");
        return;
      }
      if (editing) {
        await updateLensAttributeRequest(tab, editing.id, payload);
      } else {
        await createLensAttributeRequest(tab, payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Save failed."));
    } finally {
      setFormBusy(false);
    }
  }

  async function toggleActive(row: LensAttribute) {
    setBusyId(row.id);
    setError("");
    try {
      await updateLensAttributeRequest(tab, row.id, {
        isActive: !row.isActive,
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to update active state."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPage
      title="Attributes"
      subtitle="Master lists for Family, Base, Material, Index, Coating, and Color. Inactive values are hidden from Create product."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setShowForm(false);
                }}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm font-bold transition",
                  tab === item.id
                    ? "border-(--brand-primary) bg-[rgba(240,161,50,0.14)] text-(--brand-primary)"
                    : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:bg-[rgba(240,161,50,0.06)]"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            onClick={openCreate}
            className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
          >
            <Plus className="mr-1 size-4" />
            Add {TABS.find((t) => t.id === tab)?.label}
          </Button>
        </div>

        {error ? <div className={errorBannerClass}>{error}</div> : null}

        {showForm ? (
          <div className="space-y-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4">
            <p className="text-sm font-bold text-(--brand-text)">
              {editing ? "Edit attribute" : "Add attribute"}
            </p>
            {formError ? <div className={errorBannerClass}>{formError}</div> : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1">
                <span className={labelClass}>Code</span>
                <Input
                  className={inputClass}
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="e.g. TINTABLE"
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Name</span>
                <Input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Display name"
                />
              </label>
              <label className="space-y-1">
                <span className={labelClass}>Sort order</span>
                <Input
                  className={inputClass}
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sortOrder: e.target.value }))
                  }
                />
              </label>
              {tab === "index" ? (
                <label className="space-y-1">
                  <span className={labelClass}>Numeric value</span>
                  <Input
                    className={inputClass}
                    value={form.value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, value: e.target.value }))
                    }
                    placeholder="1.56"
                  />
                </label>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={formBusy}
                onClick={() => void handleSave()}
                className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black"
              >
                {formBusy ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : null}
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={formBusy}
                onClick={() => setShowForm(false)}
                className="h-10 rounded-xl"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <TableSkeleton rows={6} />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-(--brand-card-border) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
            No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} values yet.
            Add one to get started.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border)">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Sort</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-sm">{row.code}</TableCell>
                    <TableCell>
                      {row.name}
                      {row.value != null ? (
                        <span className="ml-2 text-xs text-(--brand-text-muted)">
                          ({row.value})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.sortOrder}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          row.isActive
                            ? "border-emerald-500/40 text-emerald-700"
                            : "border-zinc-400/40 text-zinc-500"
                        }
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="mr-1 size-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg"
                          disabled={busyId === row.id}
                          onClick={() => void toggleActive(row)}
                        >
                          {busyId === row.id ? (
                            <Loader2 className="mr-1 size-3.5 animate-spin" />
                          ) : null}
                          {row.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
