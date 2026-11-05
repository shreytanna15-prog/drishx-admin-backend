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

export type VariantPreviewRow = {
  powerRangeId: string;
  skuCode: string;
  name: string;
  rangeLabel: string;
};

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
              <TableHead>SKU</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.powerRangeId}>
                <TableCell className="font-semibold">{row.rangeLabel}</TableCell>
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
