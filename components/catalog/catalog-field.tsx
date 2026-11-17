"use client";

import { AdminSelect, type AdminSelectOption } from "@/components/admin-select";
import { cn } from "@/lib/utils";

export const catalogLabelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";

export const catalogSelectTriggerClass =
  "h-10 w-full min-w-0 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg)";

type CatalogSelectFieldProps = {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: AdminSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  hint?: string;
};

export function CatalogSelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  required,
  className,
  hint,
}: CatalogSelectFieldProps) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className={catalogLabelClass}>
        {label}
        {required ? " *" : ""}
      </span>
      <AdminSelect
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder}
        disabled={disabled}
        triggerClassName={catalogSelectTriggerClass}
      />
      {hint ? (
        <span className="text-xs text-(--brand-text-muted)">{hint}</span>
      ) : null}
    </label>
  );
}

type PowerRangeOption = {
  id: string;
  label: string;
  cylSummary: string;
  disabled?: boolean;
};

type PowerRangeMultiSelectProps = {
  label?: string;
  options: PowerRangeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function PowerRangeMultiSelect({
  label = "Power ranges",
  options,
  selectedIds,
  onChange,
  disabled,
}: PowerRangeMultiSelectProps) {
  const selected = new Set(selectedIds);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <div className="grid gap-2">
      <span className={catalogLabelClass}>{label} *</span>
      {options.length === 0 ? (
        <p className="text-sm text-(--brand-text-muted)">
          No active power ranges. Add some under Attributes → Power range.
        </p>
      ) : (
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-(--brand-card-border) p-2 sm:grid-cols-2">
          {options.map((opt) => {
            const checked = selected.has(opt.id);
            return (
              <label
                key={opt.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-(--brand-primary)/10",
                  opt.disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-(--brand-input-border)"
                  checked={checked}
                  disabled={disabled || opt.disabled}
                  onChange={() => toggle(opt.id)}
                />
                <span>
                  <span className="font-semibold text-(--brand-text)">
                    {opt.label}
                  </span>
                  {opt.cylSummary ? (
                    <span className="mt-0.5 block text-xs text-(--brand-text-muted)">
                      {opt.cylSummary}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Numeric attribute option for Axis / ADD pickers (no SKU codes in UI). */
export type AttrNumericOption = {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
};

function sortedNumericOptions(options: AttrNumericOption[]): AttrNumericOption[] {
  return options.toSorted((a, b) => a.value - b.value);
}

type AxisMultiSelectProps = {
  options: AttrNumericOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function AxisMultiSelect({
  options,
  selectedIds,
  onChange,
  disabled,
}: AxisMultiSelectProps) {
  const ordered = sortedNumericOptions(options);
  const selected = new Set(selectedIds);
  const step10Ids = ordered
    .filter((o) => !o.disabled && o.value % 10 === 0)
    .map((o) => o.id);
  const ninetyEighty = ordered
    .filter((o) => !o.disabled && (o.value === 90 || o.value === 180))
    .map((o) => o.id);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function applyPreset(ids: string[]) {
    onChange([...new Set(ids)]);
  }

  if (ordered.length === 0) {
    return (
      <div className="grid gap-2">
        <span className={catalogLabelClass}>Axis</span>
        <p className="text-sm text-(--brand-text-muted)">
          No active axis values. Add some under Attributes → Axis.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className={catalogLabelClass}>Axis</span>
      <span className="text-xs text-(--brand-text-muted)">
        Optional. Combined only with power ranges that have CYL ≠ 0.
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || step10Ids.length === 0}
          onClick={() => applyPreset(step10Ids)}
          className="h-8 rounded-lg border border-(--brand-card-border) px-2.5 text-xs font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10 disabled:opacity-50"
        >
          All 10°
        </button>
        <button
          type="button"
          disabled={disabled || ninetyEighty.length === 0}
          onClick={() => applyPreset(ninetyEighty)}
          className="h-8 rounded-lg border border-(--brand-card-border) px-2.5 text-xs font-semibold text-(--brand-text) hover:bg-(--brand-primary)/10 disabled:opacity-50"
        >
          90 & 180
        </button>
        <button
          type="button"
          disabled={disabled || selectedIds.length === 0}
          onClick={() => onChange([])}
          className="h-8 rounded-lg border border-(--brand-card-border) px-2.5 text-xs font-semibold text-(--brand-text-muted) hover:bg-(--brand-primary)/10 disabled:opacity-50"
        >
          Clear
        </button>
        {selectedIds.length > 0 ? (
          <span className="self-center text-xs text-(--brand-text-muted)">
            {selectedIds.length} selected
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-(--brand-card-border) p-2">
        {ordered.map((opt) => {
          const checked = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || opt.disabled}
              onClick={() => toggle(opt.id)}
              aria-pressed={checked}
              className={cn(
                "h-8 min-w-11 rounded-lg border px-2.5 text-sm font-semibold tabular-nums transition-colors",
                checked
                  ? "border-(--brand-primary) bg-(--brand-primary)/20 text-(--brand-text)"
                  : "border-(--brand-card-border) text-(--brand-text) hover:bg-(--brand-primary)/10",
                (disabled || opt.disabled) && "cursor-not-allowed opacity-50"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type AdditionMultiSelectProps = {
  options: AttrNumericOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function AdditionMultiSelect({
  options,
  selectedIds,
  onChange,
  disabled,
}: AdditionMultiSelectProps) {
  const ordered = sortedNumericOptions(options.filter((o) => !o.disabled));
  const selected = ordered.filter((o) => selectedIds.includes(o.id));
  const selectOptions: AdminSelectOption[] = ordered.map((o) => ({
    value: String(o.value),
    label: o.label,
  }));

  const fromValue =
    selected.length > 0
      ? String(Math.min(...selected.map((o) => o.value)))
      : "";
  const toValue =
    selected.length > 0
      ? String(Math.max(...selected.map((o) => o.value)))
      : "";

  function applyRange(fromRaw: string, toRaw: string) {
    if (!fromRaw || !toRaw) {
      onChange([]);
      return;
    }
    const a = Number(fromRaw);
    const b = Number(toRaw);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      onChange([]);
      return;
    }
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    onChange(
      ordered
        .filter((o) => o.value >= lo - 1e-9 && o.value <= hi + 1e-9)
        .map((o) => o.id)
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="grid gap-2">
        <span className={catalogLabelClass}>Addition (ADD)</span>
        <p className="text-sm text-(--brand-text-muted)">
          No active addition values. Add some under Attributes → Addition.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <span className={catalogLabelClass}>Addition (ADD)</span>
      <span className="text-xs text-(--brand-text-muted)">
        Optional. Pick a from–to band; every 0.25 step in between is included.
      </span>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-(--brand-text-muted)">
            From
          </span>
          <AdminSelect
            value={fromValue}
            onValueChange={(v) => applyRange(v, toValue || v)}
            options={selectOptions}
            placeholder="—"
            disabled={disabled}
            triggerClassName={catalogSelectTriggerClass}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-(--brand-text-muted)">
            To
          </span>
          <AdminSelect
            value={toValue}
            onValueChange={(v) => applyRange(fromValue || v, v)}
            options={selectOptions}
            placeholder="—"
            disabled={disabled}
            triggerClassName={catalogSelectTriggerClass}
          />
        </label>
        <button
          type="button"
          disabled={disabled || selectedIds.length === 0}
          onClick={() => onChange([])}
          className="h-10 rounded-xl border border-(--brand-card-border) px-3 text-sm font-semibold text-(--brand-text-muted) hover:bg-(--brand-primary)/10 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      {selected.length > 0 ? (
        <p className="text-xs text-(--brand-text-muted)">
          Includes {selected.length} value
          {selected.length === 1 ? "" : "s"}:{" "}
          <span className="font-semibold text-(--brand-text)">
            {selected.map((o) => o.label).join(", ")}
          </span>
        </p>
      ) : (
        <p className="text-xs text-(--brand-text-muted)">No ADD selected.</p>
      )}
    </div>
  );
}
