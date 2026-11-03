"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FilePlus2, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchPurchaseOrders,
  formatPoMoney,
  PO_STATUS_BADGE_CLASS,
  PO_STATUSES,
  poStatusLabel,
  type PurchaseOrderListRow,
} from "@/app/lib/admin-purchase-orders";
import { formatProcDate } from "@/app/lib/admin-procurement";
import { cn } from "@/lib/utils";

export default function PurchaseOrdersListPage() {
  const [rows, setRows] = useState<PurchaseOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await fetchPurchaseOrders(status || undefined);
      setRows(res.purchaseOrders);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load purchase orders."
      );
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.publicId.toLowerCase().includes(q) ||
        (row.supplier?.name ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <AdminPage
      title="Purchase Orders"
      subtitle="Create drafts from the reorder queue, review, and approve. Approval opens the PO — stock is unchanged until receiving."
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search PO or supplier"
              className="pl-9"
              aria-label="Search purchase orders"
            />
          </div>
          <AdminSelect
            value={status}
            onValueChange={(v) => {
              setLoading(true);
              setStatus(v);
            }}
            options={PO_STATUSES.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
            placeholder="All statuses"
            size="sm"
            triggerClassName="h-9 w-[12rem] min-w-0"
            aria-label="Filter by status"
          />
        </div>
        <Button asChild>
          <Link href="/procurement/purchase-orders/new">
            <FilePlus2 className="size-4" />
            Create purchase order
          </Link>
        </Button>
      </div>

      {error ? (
        <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <TableSkeleton rows={8} columns={6} compact />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-(--brand-card-border) px-6 py-16 text-center">
          <p className="text-sm font-medium text-(--brand-text)">
            No purchase orders yet
          </p>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            Create a draft from the reorder queue, then review and approve.
          </p>
          <Button asChild className="mt-4">
            <Link href="/procurement/purchase-orders/new">Create purchase order</Link>
          </Button>
        </div>
      ) : (
        <AdminTable className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/procurement/purchase-orders/${row.id}`}
                      className="font-medium text-(--brand-text) underline-offset-4 hover:underline"
                    >
                      {row.publicId}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-normal",
                        PO_STATUS_BADGE_CLASS[row.status]
                      )}
                    >
                      {poStatusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.supplier?.name ?? "—"}</TableCell>
                  <TableCell>{row.warehouseCode}</TableCell>
                  <TableCell className="text-right">{row.lineCount}</TableCell>
                  <TableCell className="text-right">
                    {formatPoMoney(row.totalAmount)}
                  </TableCell>
                  <TableCell>{formatProcDate(row.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminPage>
  );
}
