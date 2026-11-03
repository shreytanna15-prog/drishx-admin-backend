"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchSystemErrors,
  formatAuditDate,
  type SystemErrorRow,
} from "@/app/lib/admin-audit";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AuditErrorsPage() {
  const [items, setItems] = useState<SystemErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchSystemErrors(1)
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Failed to load error log.");
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
      title="System errors"
      subtitle="Technical failures — retained per AUDIT_RETENTION_DAYS (audit events are never purged)."
    >
      <Link
        href="/audit"
        className="mb-4 inline-block text-sm text-(--brand-primary) hover:underline"
      >
        ← Overview
      </Link>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <TableSkeleton compact columns={5} rows={8} />
      ) : (
        <AdminTable className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                <TableHead className="text-(--brand-label)">When</TableHead>
                <TableHead className="text-(--brand-label)">Route</TableHead>
                <TableHead className="text-(--brand-label)">Status</TableHead>
                <TableHead className="text-(--brand-label)">Message</TableHead>
                <TableHead className="text-(--brand-label)">Correlation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id} className="border-(--brand-card-border)">
                  <TableCell className="text-xs">{formatAuditDate(row.occurredAt)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.method} {row.route}
                  </TableCell>
                  <TableCell className="text-xs">{row.statusCode ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-xs">{row.message}</TableCell>
                  <TableCell className="font-mono text-[10px]">
                    {row.correlationId || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminPage>
  );
}
