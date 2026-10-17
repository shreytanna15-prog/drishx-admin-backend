"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Compact error + retry block for list/table screens (RW-11 Phase D). */
export function QueryErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-destructive">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** Empty list placeholder. */
export function QueryEmptyState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground",
        className
      )}
    >
      {message}
    </div>
  );
}

/** Load-more control for paginated lists. */
export function QueryLoadMoreButton({
  hasMore,
  loading,
  onLoadMore,
  className,
}: {
  hasMore: boolean;
  loading?: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  if (!hasMore) return null;
  return (
    <div className={cn("flex justify-center py-3", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={onLoadMore}
      >
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
