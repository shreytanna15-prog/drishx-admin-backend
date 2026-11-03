"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchSecurityEvents,
  formatAuditDate,
  type SecurityEventRow,
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

export default function AuditSecurityPage() {
  const [items, setItems] = useState<SecurityEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchSecurityEvents(1)
      .then((data) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Failed to load security log.");
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
    <AdminPage title="Security events" subtitle="Authentication and access control.">
      <Link
        href="/audit"
        className="mb-4 inline-block text-sm text-(--brand-primary) hover:underline"
      >
        ← Overview
      </Link>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <TableSkeleton compact columns={6} rows={8} />
      ) : (
        <AdminTable className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                <TableHead className="text-(--brand-label)">When</TableHead>
                <TableHead className="text-(--brand-label)">Action</TableHead>
                <TableHead className="text-(--brand-label)">Actor</TableHead>
                <TableHead className="text-(--brand-label)">IP</TableHead>
                <TableHead className="text-(--brand-label)">Result</TableHead>
                <TableHead className="text-(--brand-label)">Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id} className="border-(--brand-card-border)">
                  <TableCell className="text-xs">{formatAuditDate(row.occurredAt)}</TableCell>
                  <TableCell className="text-xs">{row.action}</TableCell>
                  <TableCell className="text-xs">
                    {row.actorName || row.actorUserId || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{row.ipAddress || "—"}</TableCell>
                  <TableCell className="text-xs">{row.result}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs">{row.message || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminPage>
  );
}
