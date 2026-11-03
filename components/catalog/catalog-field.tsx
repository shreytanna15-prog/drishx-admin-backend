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
                  <span className="mt-0.5 block text-xs text-(--brand-text-muted)">
                    {opt.cylSummary}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
