"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminTable } from "@/components/admin-table";
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
  getAdditionSelectOptions,
  getAxisSelectOptions,
  getDiameterSelectOptions,
  updateLensAttributeRequest,
  type LensAttribute,
  type LensAttributeType,
} from "@/app/lib/admin-lens-catalog";
import { AdminSelect } from "@/components/admin-select";
import { cn } from "@/lib/utils";
import { PowerRangeTab } from "./power-range-tab";

type TabId = LensAttributeType | "power-range";

const TABS: { id: TabId; label: string }[] = [
  { id: "family", label: "Family" },
  { id: "base", label: "Base" },
  { id: "material", label: "Material" },
  { id: "index", label: "Index" },
  { id: "coating", label: "Coating" },
  { id: "color", label: "Color" },
  { id: "axis", label: "Axis" },
  { id: "addition", label: "Addition" },
  { id: "diameter", label: "Diameter" },
  { id: "progressive-type", label: "Progressive type" },
  { id: "power-range", label: "Power range" },
];

const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const UNIVERSE_SELECT_CONTENT_CLASS = "max-h-[18rem]";

const UNIVERSE_OPTIONS: Record<
  "axis" | "addition" | "diameter",
  { value: string; label: string }[]
> = {
  axis: getAxisSelectOptions(),
  addition: getAdditionSelectOptions(),
  diameter: getDiameterSelectOptions(),
};

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(() =>
    isTabId(tabFromUrl) ? tabFromUrl : "family"
  );
  const isPowerRange = tab === "power-range";
  const isUniverseTab =
    tab === "axis" || tab === "addition" || tab === "diameter";
  // Name/code list state + handlers only run for the non-power-range tabs.
  const attrTab: LensAttributeType = tab === "power-range" ? "family" : tab;
  const [items, setItems] = useState<LensAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LensAttribute | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (isTabId(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl);
      setShowForm(false);
    }
    // Only sync when the URL tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional URL→state sync
  }, [tabFromUrl]);

  function selectTab(next: TabId) {
    setTab(next);
    setShowForm(false);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "family") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const load = useCallback(async () => {
    if (isPowerRange) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchLensAttributes(attrTab);
      setItems(res.items);
    } catch (err) {
      setError(errorMessage(err, "Failed to load attributes."));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [attrTab, isPowerRange]);

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
      const sortOrder = Number(form.sortOrder) || 0;
      let payload: {
        code: string;
        name: string;
        sortOrder: number;
        value?: number | null;
      };

      if (isUniverseTab) {
        if (form.value.trim() === "") {
          setFormError("Select a value from the list.");
          return;
        }
        payload = {
          code: "",
          name: "",
          sortOrder,
          value: Number(form.value),
        };
      } else {
        payload = {
          code: form.code.trim(),
          name: form.name.trim(),
          sortOrder,
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
      }
      if (editing) {
        await updateLensAttributeRequest(attrTab, editing.id, payload);
      } else {
        await createLensAttributeRequest(attrTab, payload);
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
      await updateLensAttributeRequest(attrTab, row.id, {
        isActive: !row.isActive,
      });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to update active state."));
    } finally {
      setBusyId(null);
    }
  }

  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? "attribute";

  return (
    <AdminPage
      title="Attributes"
      subtitle="Master lists for lens catalog attributes, power range, axis, addition, diameter, and progressive type. Family capability flags are seed-defined. Inactive values are hidden from Create product."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
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
          {isPowerRange ? null : (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
            >
              <Plus className="mr-1 size-4" />
              Add {tabLabel}
            </Button>
          )}
        </div>

        {isPowerRange ? (
          <PowerRangeTab
            showForm={showForm}
            onShowFormChange={setShowForm}
          />
        ) : (
        <>
        {error ? <div className={errorBannerClass}>{error}</div> : null}

        <AdminModal
          open={showForm}
          onOpenChange={setShowForm}
          size="md"
          title={editing ? `Edit ${tabLabel}` : `Add ${tabLabel}`}
          description={
            editing
              ? `Update this ${tabLabel.toLowerCase()} value. Inactive values stay hidden from Create product.`
              : `Create a new ${tabLabel.toLowerCase()} master value for the product catalog.`
          }
        >
          <div className="flex flex-col gap-4">
            {formError ? (
              <div className={errorBannerClass} role="alert">
                {formError}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {isUniverseTab ? (
                <label className="space-y-1.5 sm:col-span-2">
                  <span className={labelClass}>Value</span>
                  <AdminSelect
                    value={form.value}
                    onValueChange={(value) =>
                      setForm((f) => ({ ...f, value }))
                    }
                    options={UNIVERSE_OPTIONS[attrTab as "axis" | "addition" | "diameter"]}
                    placeholder="Select…"
                    size="sm"
                    triggerClassName={selectClass}
                    contentClassName={UNIVERSE_SELECT_CONTENT_CLASS}
                  />
                </label>
              ) : (
                <>
                  <label className="space-y-1.5">
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
                  <label className="space-y-1.5">
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
                </>
              )}
              <label className="space-y-1.5">
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
                <label className="space-y-1.5">
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
            <div className="flex flex-col gap-2 border-t border-(--brand-card-border) pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={formBusy}
                onClick={() => setShowForm(false)}
                className="h-11 flex-1 rounded-xl border-(--brand-input-border)"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={formBusy}
                onClick={() => void handleSave()}
                className="h-11 flex-1 rounded-xl bg-(--brand-primary) font-extrabold text-black hover:bg-(--brand-primary)/90"
              >
                {formBusy ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : null}
                {editing ? "Save changes" : "Create"}
              </Button>
            </div>
          </div>
        </AdminModal>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-(--brand-card-border) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
            No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} values yet.
            Add one to get started.
          </div>
        ) : (
          <AdminTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  {tab === "family" ? <TableHead>Capabilities</TableHead> : null}
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
                      {row.value != null && tab !== "family" ? (
                        <span className="ml-2 text-xs text-(--brand-text-muted)">
                          ({row.value})
                        </span>
                      ) : null}
                    </TableCell>
                    {tab === "family" ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.supportsAxis ? (
                            <Badge
                              variant="outline"
                              className="border-sky-500/40 text-sky-700 dark:text-sky-300"
                            >
                              Axis
                            </Badge>
                          ) : null}
                          {row.supportsAdd ? (
                            <Badge
                              variant="outline"
                              className="border-violet-500/40 text-violet-700 dark:text-violet-300"
                            >
                              ADD
                            </Badge>
                          ) : null}
                          {row.supportsEye ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 text-amber-800 dark:text-amber-300"
                            >
                              Eye
                            </Badge>
                          ) : null}
                          {row.supportsProgressiveType ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                            >
                              Prog. type
                            </Badge>
                          ) : null}
                          {!row.supportsAxis &&
                          !row.supportsAdd &&
                          !row.supportsEye &&
                          !row.supportsProgressiveType ? (
                            <span className="text-xs text-(--brand-text-muted)">
                              —
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
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
          </AdminTable>
        )}
        </>
        )}
      </div>
    </AdminPage>
  );
}
