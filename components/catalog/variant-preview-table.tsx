"use client";

import { AdminTable } from "@/components/admin-table";
import { SkuChip } from "@/components/catalog/sku-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VariantPreview } from "@/app/lib/admin-lens-catalog";

export type VariantPreviewRow = VariantPreview;

type VariantPreviewTableProps = {
  rows: VariantPreviewRow[];
  emptyMessage?: string;
  existingParentHint?: string | null;
};

export function VariantPreviewTable({
  rows,
  emptyMessage = "Select power ranges to preview SKUs and names.",
  existingParentHint,
}: VariantPreviewTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-(--brand-text-muted)">{emptyMessage}</p>
    );
  }

  const showAxis = rows.some((r) => r.axisLabel != null && r.axisLabel !== "");
  const showAdd = rows.some(
    (r) => r.additionLabel != null && r.additionLabel !== ""
  );
  const showEye = rows.some((r) => r.eye != null && r.eye !== "");

  function rowKey(row: VariantPreviewRow) {
    return `${row.powerRangeId}:${row.axisId ?? ""}:${row.additionId ?? ""}:${row.eye ?? ""}`;
  }

  return (
    <div className="grid gap-2">
      {existingParentHint ? (
        <p className="text-sm text-amber-200/90">{existingParentHint}</p>
      ) : null}
      <AdminTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Power range</TableHead>
              {showAxis ? <TableHead>Axis</TableHead> : null}
              {showAdd ? <TableHead>ADD</TableHead> : null}
              {showEye ? <TableHead>Eye</TableHead> : null}
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                <TableCell className="font-semibold">{row.rangeLabel}</TableCell>
                {showAxis ? (
                  <TableCell>{row.axisLabel ?? "—"}</TableCell>
                ) : null}
                {showAdd ? (
                  <TableCell>{row.additionLabel ?? "—"}</TableCell>
                ) : null}
                {showEye ? (
                  <TableCell>{row.eye ?? "—"}</TableCell>
                ) : null}
                <TableCell>
                  <SkuChip sku={row.skuCode} />
                </TableCell>
                <TableCell className="whitespace-normal">{row.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTable>
    </div>
  );
}