"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Wider forms (max-w-lg default). */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_CLASS = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
} as const;

/**
 * Centered modal for small ERP forms (Maulik: page or modal, not sheet).
 * Escape / backdrop click close when not prevented by the parent.
 */
export function AdminModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  className,
}: AdminModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      aria-describedby={description ? "admin-modal-desc" : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        className={cn(
          "flex max-h-[min(90vh,880px)] w-full flex-col overflow-hidden rounded-xl border border-(--brand-card-border) bg-(--brand-card) shadow-lg",
          SIZE_CLASS[size],
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--brand-card-border) px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2
              id="admin-modal-title"
              className="text-lg font-extrabold tracking-tight text-(--brand-text)"
            >
              {title}
            </h2>
            {description ? (
              <p
                id="admin-modal-desc"
                className="text-sm leading-relaxed text-(--brand-text-muted)"
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 text-(--brand-text-muted) transition hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
