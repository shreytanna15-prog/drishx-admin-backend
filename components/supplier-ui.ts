import { AdminApiError } from "@/app/lib/admin-api";

/** Shared styles + helpers for the supplier list, detail, create and edit pages. */

export const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
export const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
export const textareaClass =
  "w-full min-w-0 rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-2.5 py-2 text-sm text-(--brand-text) outline-none transition-colors placeholder:text-(--brand-placeholder) focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
export const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
export const sectionClass =
  "space-y-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4";
export const sectionTitleClass =
  "text-[11px] font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)";
export const cardClass =
  "rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)";
export const backLinkClass =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline";
export const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
export const successBannerClass =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
export const warningBannerClass =
  "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100";

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}
