"use client";

import Link from "next/link";
import {
  formatAuditAction,
  formatAuditDate,
  type AuditEventRow,
} from "@/app/lib/admin-audit";
import { Badge } from "@/components/ui/badge";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditTrailTableProps = {
  items: AuditEventRow[];
  showModule?: boolean;
};

export function AuditTrailTable({ items, showModule = true }: AuditTrailTableProps) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-(--brand-label)">
        No audit events match your filters.
      </p>
    );
  }

  return (
    <AdminTable className="overflow-x-auto">
      <Table>
      <TableHeader>
        <TableRow className="border-(--brand-card-border) hover:bg-transparent">
          <TableHead className="text-(--brand-label)">When</TableHead>
          <TableHead className="text-(--brand-label)">ID</TableHead>
          {showModule ? (
            <TableHead className="text-(--brand-label)">Module</TableHead>
          ) : null}
          <TableHead className="text-(--brand-label)">Action</TableHead>
          <TableHead className="text-(--brand-label)">Actor</TableHead>
          <TableHead className="text-(--brand-label)">Entity</TableHead>
          <TableHead className="text-(--brand-label)">Summary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow
            key={row.id}
            className="border-(--brand-card-border) hover:bg-(--brand-card-border)/20"
          >
            <TableCell className="whitespace-nowrap text-xs text-(--brand-text)">
              {formatAuditDate(row.occurredAt)}
            </TableCell>
            <TableCell className="font-mono text-xs">
              <Link
                href={`/audit/trail?event=${row.publicId}`}
                className="text-(--brand-primary) hover:underline"
              >
                {row.publicId}
              </Link>
            </TableCell>
            {showModule ? (
              <TableCell className="text-xs text-(--brand-text)">{row.module}</TableCell>
            ) : null}
            <TableCell>
              <Badge variant="outline" className="text-[10px]">
                {formatAuditAction(row.action)}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-(--brand-text)">
              {row.actorName || row.actorUserId || row.actorType}
            </TableCell>
            <TableCell className="max-w-[8rem] truncate text-xs text-(--brand-label)">
              {row.entityType}:{row.entityId.slice(0, 8)}…
            </TableCell>
            <TableCell className="max-w-xs truncate text-xs text-(--brand-text)">
              {row.message || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      </Table>
    </AdminTable>
  );
}
