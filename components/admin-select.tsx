"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EMPTY_VALUE = "__admin_select_empty__";

export type AdminSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AdminSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AdminSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Defaults to full width of parent; pass e.g. `w-[12rem]` for filters */
  triggerClassName?: string;
  size?: "sm" | "default";
  id?: string;
  "aria-label"?: string;
};

/**
 * Simple shadcn select for admin filters/forms.
 * Prefer this over native `<select>` in the admin panel.
 */
export function AdminSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  triggerClassName,
  size = "default",
  id,
  "aria-label": ariaLabel,
}: AdminSelectProps) {
  const selectValue = value === "" ? EMPTY_VALUE : value;

  return (
    <Select
      value={selectValue}
      onValueChange={(next) =>
        onValueChange(next === EMPTY_VALUE ? "" : next)
      }
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        className={cn("w-full min-w-[10rem]", triggerClassName, className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => {
          const itemValue = opt.value === "" ? EMPTY_VALUE : opt.value;
          return (
            <SelectItem
              key={itemValue}
              value={itemValue}
              disabled={opt.disabled}
            >
              {opt.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
