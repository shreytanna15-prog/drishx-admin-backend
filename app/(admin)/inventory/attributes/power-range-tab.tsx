"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCylSummary,
  formatPowerRangeLabel,
  getPowerSelectOptions,
  type LensPowerRange,
} from "@/app/lib/admin-lens-catalog";
import { validatePowerRangeBounds } from "@/app/lib/catalog/catalog-power-select-options";
import { useGetPowerRanges } from "@/app/lib/modules/lens-catalog/query/use-get-power-ranges";
import { useCreatePowerRange } from "@/app/lib/modules/lens-catalog/mutation/use-create-power-range";
import {
  useUpdatePowerRange,
  type UpdatePowerRangeVariables,
} from "@/app/lib/modules/lens-catalog/mutation/use-update-power-range";

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

type FormState = {
  sphMin: string;
  sphMax: string;
  cylMin: string;
  cylMax: string;
  sortOrder: string;
};

const EMPTY_FORM: FormState = {
  sphMin: "",
  sphMax: "",
  cylMin: "",
  cylMax: "",
  sortOrder: "0",
};

const POWER_OPTIONS = getPowerSelectOptions();

function BoundSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <AdminSelect
        value={value}
        onValueChange={onChange}
        options={[
          { value: "", label: "Select…" },
          ...POWER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
        ]}
        placeholder="Select…"
        size="sm"
        triggerClassName={selectClass}
      />
    </label>
  );
}

function isActiveToggle(vars: UpdatePowerRangeVariables) {
  const keys = Object.keys(vars.payload);
  return keys.length === 1 && keys[0] === "isActive";
}

function parseBounds(form: FormState) {
  if (
    form.sphMin === "" ||
    form.sphMax === "" ||
    form.cylMin === "" ||
    form.cylMax === ""
  ) {
    return null;
  }
  return {
    sphMin: Number(form.sphMin),
    sphMax: Number(form.sphMax),
    cylMin: Number(form.cylMin),
    cylMax: Number(form.cylMax),
  };
}

/** Attributes → Power range tab: list + add/edit via stepped selects (RC-03). */
export function PowerRangeTab({
  showForm,
  onShowFormChange,
}: {
  showForm: boolean;
  onShowFormChange: (open: boolean) => void;
}) {
  const { data, loading, error, refetch } = useGetPowerRanges();
  const items = data?.items ?? [];

  const [editing, setEditing] = useState<LensPowerRange | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const createMutation = useCreatePowerRange({
    onSuccess: () => {
      onShowFormChange(false);
      void refetch();
    },
    onError: (err) => setFormError(err.message || "Save failed."),
  });
  const updateMutation = useUpdatePowerRange({
    onSuccess: (_res, vars) => {
      if (!isActiveToggle(vars)) onShowFormChange(false);
      setBusyId(null);
      void refetch();
    },
    onError: (err, vars) => {
      if (isActiveToggle(vars)) {
        setActionError(err.message || "Failed to update active state.");
      } else {
        setFormError(err.message || "Save failed.");
      }
      setBusyId(null);
    },
  });
  const formBusy = createMutation.pending || updateMutation.pending;

  const bounds = useMemo(() => parseBounds(form), [form]);
  const preview = useMemo(() => {
    if (!bounds) return null;
    if (validatePowerRangeBounds(bounds)) return null;
    return {
      label: formatPowerRangeLabel(bounds.sphMin, bounds.sphMax),
      cyl: formatCylSummary(bounds.cylMin, bounds.cylMax),
    };
  }, [bounds]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    onShowFormChange(true);
  }

  function openEdit(row: LensPowerRange) {
    setEditing(row);
    setForm({
      sphMin: String(row.sphMin),
      sphMax: String(row.sphMax),
      cylMin: String(row.cylMin),
      cylMax: String(row.cylMax),
      sortOrder: String(row.sortOrder),
    });
    setFormError("");
    onShowFormChange(true);
  }

  async function handleSave() {
    setFormError("");
    if (!bounds) {
      setFormError("Select SPH min/max and CYL min/max.");
      return;
    }
    const message = validatePowerRangeBounds(bounds);
    if (message) {
      setFormError(message);
      return;
    }
    const payload = { ...bounds, sortOrder: Number(form.sortOrder) || 0 };
    if (editing) {
      await updateMutation.mutate({ id: editing.id, payload });
    } else {
      await createMutation.mutate(payload);
    }
  }

  async function toggleActive(row: LensPowerRange) {
    setBusyId(row.id);
    setActionError("");
    await updateMutation.mutate({
      id: row.id,
      payload: { isActive: !row.isActive },
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={openCreate}
          className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
        >
          <Plus className="mr-1 size-4" />
          Add Power range
        </Button>
      </div>

      {error ? (
        <div className={errorBannerClass}>
          {error.message || "Failed to load power ranges."}
        </div>
      ) : null}
      {actionError ? <div className={errorBannerClass}>{actionError}</div> : null}

      <AdminModal
        open={showForm}
        onOpenChange={onShowFormChange}
        size="md"
        title={editing ? "Edit Power range" : "Add Power range"}
        description="Pick SPH and CYL bounds from the stepped lists (−40 … +8). The label is generated from SPH, e.g. -6.00/+2.00."
      >
        <div className="flex flex-col gap-4">
          {formError ? (
            <div className={errorBannerClass} role="alert">
              {formError}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <BoundSelect
              label="SPH min"
              value={form.sphMin}
              onChange={(v) => setForm((f) => ({ ...f, sphMin: v }))}
            />
            <BoundSelect
              label="SPH max"
              value={form.sphMax}
              onChange={(v) => setForm((f) => ({ ...f, sphMax: v }))}
            />
            <BoundSelect
              label="CYL min"
              value={form.cylMin}
              onChange={(v) => setForm((f) => ({ ...f, cylMin: v }))}
            />
            <BoundSelect
              label="CYL max"
              value={form.cylMax}
              onChange={(v) => setForm((f) => ({ ...f, cylMax: v }))}
            />
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
            <div className="space-y-1.5">
              <span className={labelClass}>Label (auto)</span>
              <div className="flex min-h-10 flex-col justify-center text-sm">
                {preview ? (
                  <>
                    <span className="font-mono font-bold">{preview.label}</span>
                    <span className="text-xs text-(--brand-text-muted)">
                      {preview.cyl}
                    </span>
                  </>
                ) : (
                  <span className="text-(--brand-text-muted)">
                    Select all four bounds
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-(--brand-card-border) pt-4 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={formBusy}
              onClick={() => onShowFormChange(false)}
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
              {formBusy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      </AdminModal>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-(--brand-card-border) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
          No power range values yet. Add one to get started.
        </div>
      ) : (
        <AdminTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Range (SPH)</TableHead>
                <TableHead>CYL</TableHead>
                <TableHead>Sort</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm font-bold">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-sm text-(--brand-text-muted)">
                    {row.cylSummary}
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
        </AdminTable>
      )}
    </>
  );
}
