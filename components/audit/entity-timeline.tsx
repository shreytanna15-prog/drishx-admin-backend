"use client";

import { useEffect, useState } from "react";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchAuditTimeline,
  formatAuditAction,
  formatAuditDate,
  type AuditEventRow,
} from "@/app/lib/admin-audit";
import { ListSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";

type EntityTimelineProps = {
  entityType: string;
  entityId: string;
  title?: string;
};

export function EntityTimeline({
  entityType,
  entityId,
  title = "Audit trail",
}: EntityTimelineProps) {
  const [items, setItems] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchAuditTimeline(entityType, entityId);
        if (!cancelled) setItems(data.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setError(
            err instanceof AdminApiError ? err.message : "Failed to load audit trail."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  return (
    <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
      <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
        {title}
      </h2>
      {loading ? (
        <ListSkeleton compact rows={4} />
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-(--brand-label)">No audit events recorded yet.</p>
      ) : (
        <ol className="space-y-4">
          {items.map((event) => (
            <li
              key={event.id}
              className="border-l-2 border-(--brand-primary)/40 pl-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-(--brand-label)">
                  {formatAuditDate(event.occurredAt)}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {formatAuditAction(event.action)}
                </Badge>
                {event.isHighRisk ? (
                  <Badge className="bg-amber-600/90 text-[10px]">High risk</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-(--brand-text)">
                {event.message ||
                  `${event.actorName || event.actorUserId || "System"} — ${formatAuditAction(event.action)}`}
              </p>
              {event.reasonText ? (
                <p className="mt-1 text-xs text-(--brand-label)">
                  Reason: {event.reasonText}
                </p>
              ) : null}
              <p className="mt-1 font-mono text-[10px] text-(--brand-label)">
                {event.publicId}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
