"use client";

import { cn } from "@/lib/utils";

type InfiniteScrollSentinelProps = {
  setSentinelNode: (node: HTMLElement | null) => void;
  active: boolean;
  loadingMore?: boolean;
  label?: string;
  className?: string;
  /** Render as a full table row under the list (fallback / end of table). */
  asTableRow?: boolean;
  colSpan?: number;
};

/**
 * Scroll trigger for progressive / infinite loading.
 * When `active`, mounts an observer target. Prefer placing this on the
 * preload row (~index 22); otherwise render as an end-of-list row.
 */
export function InfiniteScrollSentinel({
  setSentinelNode,
  active,
  loadingMore = false,
  label = "Loading more…",
  className,
  asTableRow = false,
  colSpan = 1,
}: InfiniteScrollSentinelProps) {
  if (!active) return null;

  if (asTableRow) {
    return (
      <tr ref={setSentinelNode as (node: HTMLTableRowElement | null) => void}>
        <td
          colSpan={colSpan}
          className={cn(
            "h-10 py-3 text-center text-xs text-(--brand-text-muted)",
            className
          )}
        >
          {loadingMore ? label : <span className="sr-only">Load more</span>}
        </td>
      </tr>
    );
  }

  return (
    <div
      ref={setSentinelNode}
      className={cn(
        loadingMore
          ? "flex h-10 items-center justify-center py-3 text-xs text-(--brand-text-muted)"
          : "pointer-events-none h-px w-full opacity-0",
        className
      )}
      aria-hidden={!loadingMore}
    >
      {loadingMore ? label : null}
    </div>
  );
}
