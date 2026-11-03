"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminTableProps = {
  children: ReactNode;
  className?: string;
  /** Optional filter/actions row above the table */
  toolbar?: ReactNode;
} & ComponentPropsWithoutRef<"div">;

/**
 * Card shell for admin data tables. Put shadcn `Table` (and friends) as children.
 * Padding and cell spacing come from `components/ui/table.tsx`.
 */
export function AdminTable({
  children,
  className,
  toolbar,
  ...rest
}: AdminTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)",
        className
      )}
      {...rest}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-(--brand-card-border) px-4 py-3">
          {toolbar}
        </div>
      ) : null}
      {children}
    </div>
  );
}
