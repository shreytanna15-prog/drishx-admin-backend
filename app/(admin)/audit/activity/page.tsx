"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { AdminApiError } from "@/app/lib/admin-api";
import { fetchAuditEvents, type AuditEventRow } from "@/app/lib/admin-audit";

export default function AuditActivityPage() {
  const [items, setItems] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchAuditEvents({ page: 1, limit: 50 })
      .then((data) => {
        if (!cancelled) {
          setItems(
            (data.items ?? []).filter((row) => Boolean(row.message?.trim()))
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Failed to load activity.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminPage
      title="Activity feed"
      subtitle="Human-readable operational lines from audit events."
    >
      <Link
        href="/audit"
        className="mb-4 inline-block text-sm text-(--brand-primary) hover:underline"
      >
        ← Overview
      </Link>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <TableSkeleton compact columns={4} rows={8} />
      ) : (
        <AuditTrailTable items={items} showModule={false} />
      )}
    </AdminPage>
  );
}
