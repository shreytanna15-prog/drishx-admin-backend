import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const cardClass =
  "overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card)";

type SkeletonProps = {
  className?: string;
};

/** Default route/content placeholder: title block + large card. */
export function PageBodySkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-5", className)} aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 bg-(--brand-card-border)/60" />
        <Skeleton className="h-4 w-72 max-w-full bg-(--brand-card-border)/50" />
      </div>
      <div className={cn(cardClass, "p-4 sm:p-5")}>
        <Skeleton className="mb-4 h-4 w-40 bg-(--brand-card-border)/60" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 w-full bg-(--brand-card-border)/45"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type TableSkeletonProps = SkeletonProps & {
  rows?: number;
  columns?: number;
  /** When true, omit outer page title block (for use inside existing chrome). */
  compact?: boolean;
};

/** Table-shaped placeholder for orders, finance, audit lists. */
export function TableSkeleton({
  className,
  rows = 8,
  columns = 5,
  compact = false,
}: TableSkeletonProps) {
  return (
    <div className={cn(compact ? undefined : "space-y-5", className)} aria-hidden>
      {!compact ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-44 bg-(--brand-card-border)/60" />
          <Skeleton className="h-4 w-64 max-w-full bg-(--brand-card-border)/50" />
        </div>
      ) : null}
      <div className={cardClass}>
        <div
          className="grid gap-3 border-b border-(--brand-card-border) px-4 py-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-3 w-16 bg-(--brand-card-border)/55"
            />
          ))}
        </div>
        <div className="divide-y divide-(--brand-card-border)">
          {Array.from({ length: rows }).map((_, row) => (
            <div
              key={row}
              className="grid gap-3 px-4 py-3.5"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: columns }).map((_, col) => (
                <Skeleton
                  key={col}
                  className={cn(
                    "h-4 bg-(--brand-card-border)/45",
                    col === 0 ? "w-3/4" : "w-full"
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ListSkeletonProps = SkeletonProps & {
  rows?: number;
  compact?: boolean;
};

/** Row-list placeholder for employees, clients, roles, returns. */
export function ListSkeleton({
  className,
  rows = 7,
  compact = false,
}: ListSkeletonProps) {
  return (
    <div className={cn(compact ? undefined : "space-y-5", className)} aria-hidden>
      {!compact ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48 bg-(--brand-card-border)/60" />
            <Skeleton className="h-4 w-56 bg-(--brand-card-border)/50" />
          </div>
          <Skeleton className="h-10 w-full max-w-xs bg-(--brand-card-border)/50 sm:w-64" />
        </div>
      ) : null}
      <div className={cn(cardClass, "divide-y divide-(--brand-card-border)")}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full bg-(--brand-card-border)/55" />
              <Skeleton className="h-3 w-56 max-w-full bg-(--brand-card-border)/40" />
            </div>
            <Skeleton className="h-4 w-4 shrink-0 bg-(--brand-card-border)/45" />
          </div>
        ))}
      </div>
    </div>
  );
}

type DetailSkeletonProps = SkeletonProps & {
  cards?: number;
};

/** Detail page placeholder: title + stacked info cards. */
export function DetailSkeleton({ className, cards = 3 }: DetailSkeletonProps) {
  return (
    <div className={cn("space-y-5", className)} aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24 bg-(--brand-card-border)/50" />
        <Skeleton className="h-8 w-56 max-w-full bg-(--brand-card-border)/60" />
        <Skeleton className="h-4 w-40 bg-(--brand-card-border)/45" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className={cn(cardClass, "space-y-4 p-4 sm:p-5")}>
            <Skeleton className="h-4 w-32 bg-(--brand-card-border)/55" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-16 bg-(--brand-card-border)/40" />
                  <Skeleton className="h-4 w-28 bg-(--brand-card-border)/50" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dashboard-style KPI + panel placeholders. */
export function CardGridSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("admin-dash-skel", className)} aria-hidden>
      <div className="admin-dash-kpis">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="admin-dash-kpi">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="admin-dash-grid">
        <div className="admin-dash-panel">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
        <div className="admin-dash-panel">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Live status while a paginated list filter/search request is in flight. */
export function PaginatedListStatusBanner({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mb-3 flex items-center gap-2 rounded-xl border border-(--brand-primary)/35 bg-[rgba(240,161,50,0.12)] px-3 py-2 text-sm font-semibold text-(--brand-text)",
        className
      )}
    >
      <Loader2
        className="size-4 shrink-0 animate-spin text-(--brand-primary)"
        aria-hidden
      />
      <span>{message}</span>
    </div>
  );
}
