"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, ShoppingCart, Store, X } from "lucide-react";
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
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  formatPowerValue,
  PRIORITY_BADGE_CLASS,
  PROCUREMENT_PRIORITIES,
  PROCUREMENT_SOURCES,
  PROCUREMENT_STATUSES,
  sourceLabel,
  STATUS_BADGE_CLASS,
  listProcurementRequests,
  procurementRequestAction,
  updateProcurementCartItemsRequest,
  type ProcurementRequestRow,
  type ProcurementRequestsResponse,
} from "@/app/lib/admin-procurement";
import { createPurchaseOrderDraft } from "@/app/lib/admin-purchase-orders";
import {
  procurementRequestsEmptyMessage,
  shouldCommitListResult,
} from "@/app/lib/procurement-request-filters";
import { cn } from "@/lib/utils";

type SupplierOption = { id: string; name: string };

export default function ProcurementRequestsPage() {
  const router = useRouter();
  const [data, setData] = useState<ProcurementRequestsResponse | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [creatingPoFor, setCreatingPoFor] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cart" | "list">("cart");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [assigningSupplier, setAssigningSupplier] = useState(false);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const loadSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++loadSeqRef.current;
    try {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (openOnly) params.set("openOnly", "true");
      params.set("limit", "300");

      const [res, supRes] = await Promise.all([
        listProcurementRequests(params, { signal: controller.signal }),
        adminFetch<{ suppliers: Array<{ id: string; name: string; isActive?: boolean }> }>(
          "/api/procurement/suppliers",
          { signal: controller.signal }
        ).catch(() => ({ suppliers: [] })),
      ]);
      if (!shouldCommitListResult(seq, loadSeqRef.current)) return;
      setData(res);
      setSuppliers(
        (supRes.suppliers ?? [])
          .filter((s) => s.isActive !== false)
          .map((s) => ({ id: s.id, name: s.name }))
      );
    } catch (err) {
      if (!shouldCommitListResult(seq, loadSeqRef.current)) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load procurement cart."
      );
    } finally {
      if (shouldCommitListResult(seq, loadSeqRef.current)) {
        setLoading(false);
      }
    }
  }, [source, status, priority, openOnly]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  function changeFilter(setter: (value: string) => void) {
    return (value: string) => {
      setLoading(true);
      setError("");
      setter(value);
    };
  }

  const changeOpenOnly = (value: boolean) => {
    setLoading(true);
    setOpenOnly(value);
  };

  const rows = useMemo(() => {
    const list = data?.requests ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (row) =>
        (row.lensLabel ?? "").toLowerCase().includes(q) ||
        (row.productName ?? "").toLowerCase().includes(q) ||
        (row.skuCode ?? "").toLowerCase().includes(q) ||
        (row.supplierName ?? "").toLowerCase().includes(q) ||
        row.publicId.toLowerCase().includes(q) ||
        (row.order?.orderNumber ?? "").toLowerCase().includes(q)
    );
  }, [data, query]);

  const supplierGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        supplierId: string | null;
        supplierName: string;
        items: ProcurementRequestRow[];
        totalQty: number;
      }
    >();
    for (const row of rows) {
      const key = row.supplierId ?? "__unassigned__";
      const existing = groups.get(key) ?? {
        supplierId: row.supplierId ?? null,
        supplierName: row.supplierName ?? "Unassigned Supplier",
        items: [],
        totalQty: 0,
      };
      existing.items.push(row);
      existing.totalQty += row.outstandingQuantity;
      groups.set(key, existing);
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (!a.supplierId && b.supplierId) return -1;
      if (a.supplierId && !b.supplierId) return 1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }, [rows]);

  async function act(row: ProcurementRequestRow, action: "approve" | "cancel") {
    setBusyId(row.id);
    setError("");
    setNotice("");
    try {
      await procurementRequestAction(
        row.id,
        action,
        action === "cancel" ? { reason: "Removed from procurement cart" } : undefined
      );
      setNotice(
        action === "approve"
          ? `${row.publicId} approved and ready to purchase.`
          : `${row.publicId} cancelled.`
      );
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Action failed.");
    } finally {
      setBusyId("");
    }
  }

  async function assignSupplierToSelected() {
    if (selectedIds.size === 0 || !bulkSupplierId) return;
    setAssigningSupplier(true);
    setError("");
    setNotice("");
    try {
      const res = await updateProcurementCartItemsRequest({
        ids: Array.from(selectedIds),
        supplierId: bulkSupplierId,
      });
      setSelectedIds(new Set());
      setNotice(`Assigned supplier to ${res.updatedCount} cart item(s).`);
      await load();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to assign supplier."
      );
    } finally {
      setAssigningSupplier(false);
    }
  }

  async function saveRowQty(row: ProcurementRequestRow) {
    const raw = qtyDrafts[row.id];
    if (raw == null) return;
    const qty = Number(raw.trim());
    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Quantity must be a whole number > 0.");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      await updateProcurementCartItemsRequest({
        ids: [row.id],
        requestedQuantity: qty,
      });
      setQtyDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to update qty.");
    } finally {
      setBusyId("");
    }
  }

  async function createConsolidatedPoForSupplier(
    supplierId: string,
    groupItems: ProcurementRequestRow[]
  ) {
    const eligible = groupItems.filter(
      (r) =>
        (r.status === "OPEN" ||
          r.status === "UNDER_REVIEW" ||
          r.status === "APPROVED") &&
        r.outstandingQuantity > 0
    );
    if (eligible.length === 0) {
      setError("No eligible items in this supplier group.");
      return;
    }
    setCreatingPoFor(supplierId);
    setError("");
    setNotice("");
    try {
      // Auto-approve OPEN/UNDER_REVIEW items so they can be allocated cleanly on PO submit/approve.
      for (const item of eligible) {
        if (item.status === "OPEN" || item.status === "UNDER_REVIEW") {
          await procurementRequestAction(item.id, "approve");
        }
      }
      const res = await createPurchaseOrderDraft({
        supplierId,
        warehouseCode: "MAIN",
        lines: eligible.map((item) => ({
          lensType: item.lensType ?? null,
          lensId: item.lensId ?? null,
          lensProductPowerId: item.lensProductPowerId ?? null,
          requiredQuantity: item.outstandingQuantity,
          poQuantity: item.outstandingQuantity,
          procurementRequestId: item.id,
          productLabel: item.lensLabel ?? null,
          powerLabel: formatPowerValue(item.power),
        })),
      });
      router.push(`/procurement/purchase-orders/new?draft=${res.purchaseOrder.id}`);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to create Purchase Order from cart."
      );
      setCreatingPoFor(null);
    }
  }

  const summary = data?.summary;

  return (
    <AdminPage
      title="Procurement Cart"
      subtitle="Shortages and manual matrix picks grouped by supplier for consolidated multi-product Purchase Orders."
      actions={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={viewMode === "cart" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("cart")}
          >
            <ShoppingCart className="size-4" />
            Cart (By Supplier)
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            Flat Queue
          </Button>
        </div>
      }
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Procurement Cart &amp; Requests
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            Group shortages across products by supplier and generate one consolidated Purchase Order.
          </p>
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-2">
            <StatPill label="Open" value={summary.open} tone="amber" />
            <StatPill label="Under review" value={summary.underReview} tone="sky" />
            <StatPill label="Approved" value={summary.approved} tone="indigo" />
            <StatPill label="Critical" value={summary.critical} tone="red" />
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AdminSelect
          value={source}
          onValueChange={changeFilter(setSource)}
          options={[...PROCUREMENT_SOURCES]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <AdminSelect
          value={status}
          onValueChange={changeFilter(setStatus)}
          options={[...PROCUREMENT_STATUSES]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <AdminSelect
          value={priority}
          onValueChange={changeFilter(setPriority)}
          options={[...PROCUREMENT_PRIORITIES]}
          size="sm"
          triggerClassName="h-10 w-auto min-w-[10rem]"
        />
        <label className="flex items-center gap-2 text-sm text-(--brand-text-muted)">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => changeOpenOnly(e.target.checked)}
            className="size-4"
          />
          Unresolved only
        </label>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--brand-placeholder)" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PR, SKU, product, supplier…"
            className="h-10 border-(--brand-input-border) bg-(--brand-input-bg) pl-9 text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-(--brand-primary)/40 bg-(--brand-primary)/5 p-3 text-sm">
          <span className="font-bold text-(--brand-text)">
            {selectedIds.size} selected
          </span>
          <AdminSelect
            value={bulkSupplierId}
            onValueChange={setBulkSupplierId}
            size="sm"
            options={[
              { value: "", label: "Select supplier…" },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
            triggerClassName="h-9 w-48 shrink-0"
          />
          <Button
            type="button"
            size="sm"
            disabled={!bulkSupplierId || assigningSupplier}
            onClick={() => void assignSupplierToSelected()}
          >
            {assigningSupplier ? "Assigning…" : "Assign Supplier"}
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-(--brand-text-muted) underline underline-offset-2"
          >
            Clear selection
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={8} rows={8} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
          {procurementRequestsEmptyMessage(
            Boolean(query.trim() || source || status || priority || !openOnly)
          )}
        </div>
      ) : viewMode === "cart" ? (
        <div className="space-y-5">
          {supplierGroups.map((group) => {
            const groupKey = group.supplierId ?? "__unassigned__";
            const allGroupSelected = group.items.every((r) => selectedIds.has(r.id));
            return (
              <section
                key={groupKey}
                className="overflow-hidden rounded-xl border border-(--brand-card-border) bg-(--brand-card)"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--brand-card-border) bg-(--brand-input-bg)/40 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select all in ${group.supplierName}`}
                      checked={allGroupSelected}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          for (const r of group.items) {
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                          }
                          return next;
                        });
                      }}
                    />
                    <Store className="size-4 text-(--brand-primary)" />
                    <h2 className="text-sm font-bold text-(--brand-text)">
                      {group.supplierName}
                    </h2>
                    <Badge variant="secondary">
                      {group.items.length} {group.items.length === 1 ? "line" : "lines"} · {group.totalQty} pcs
                    </Badge>
                  </div>

                  {group.supplierId ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={creatingPoFor !== null}
                      onClick={() =>
                        void createConsolidatedPoForSupplier(
                          group.supplierId!,
                          group.items
                        )
                      }
                      className="h-9 rounded-xl bg-(--brand-primary) px-4 text-xs font-extrabold text-(--brand-primary-text)"
                    >
                      {creatingPoFor === group.supplierId ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Creating PO…
                        </>
                      ) : (
                        `Create Purchase Order (${group.items.length})`
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Select rows above and assign a supplier to create a PO.
                    </span>
                  )}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Product / Variant / Power</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((row) => {
                      const draftVal = qtyDrafts[row.id];
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={(e) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(row.id);
                                  else next.delete(row.id);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-(--brand-text)">
                              {row.lensLabel ?? row.publicId}
                            </div>
                            <div className="text-xs text-(--brand-text-muted)">
                              {row.publicId}
                              {row.power ? ` · ${formatPowerValue(row.power)}` : ""}
                              {row.order?.orderNumber ? ` · Order ${row.order.orderNumber}` : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{sourceLabel(row.source)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                STATUS_BADGE_CLASS[row.status] ??
                                  "bg-zinc-100 text-zinc-700"
                              )}
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Input
                                inputMode="numeric"
                                value={draftVal ?? String(row.requestedQuantity)}
                                onChange={(e) =>
                                  setQtyDrafts((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                className="h-8 w-16 text-right tabular-nums"
                              />
                              {draftVal != null &&
                              draftVal !== String(row.requestedQuantity) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busyId === row.id}
                                  onClick={() => void saveRowQty(row)}
                                  className="h-8 px-2 text-xs"
                                >
                                  Save
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              {(row.status === "OPEN" ||
                                row.status === "UNDER_REVIEW") && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busyId === row.id}
                                  onClick={() => void act(row, "approve")}
                                  title="Approve"
                                >
                                  <Check className="size-3.5" />
                                </Button>
                              )}
                              {row.status !== "CANCELLED" &&
                                row.status !== "RECEIVED" && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={busyId === row.id}
                                    onClick={() => void act(row, "cancel")}
                                    title="Remove"
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </section>
            );
          })}
        </div>
      ) : (
        <AdminTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR</TableHead>
                <TableHead>Product / Power</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.publicId}</TableCell>
                  <TableCell>
                    <div>{row.lensLabel ?? "—"}</div>
                    {row.power ? (
                      <div className="text-xs text-(--brand-text-muted)">
                        {formatPowerValue(row.power)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.supplierName ?? "Unassigned"}</TableCell>
                  <TableCell>{sourceLabel(row.source)}</TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        PRIORITY_BADGE_CLASS[row.priority] ??
                          "bg-zinc-100 text-zinc-700"
                      )}
                    >
                      {row.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        STATUS_BADGE_CLASS[row.status] ??
                          "bg-zinc-100 text-zinc-700"
                      )}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.requestedQuantity}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {(row.status === "OPEN" ||
                        row.status === "UNDER_REVIEW") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          onClick={() => void act(row, "approve")}
                        >
                          Approve
                        </Button>
                      )}
                      {row.status !== "CANCELLED" &&
                        row.status !== "RECEIVED" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row.id}
                            onClick={() => void act(row, "cancel")}
                          >
                            Cancel
                          </Button>
                        )}
                    </div>
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

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "sky" | "indigo" | "red";
}) {
  const cls =
    tone === "red"
      ? "border-red-300 bg-red-50 text-red-900"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : tone === "sky"
          ? "border-sky-300 bg-sky-50 text-sky-900"
          : "border-indigo-300 bg-indigo-50 text-indigo-900";
  return (
    <div className={cn("rounded-xl border px-3 py-1.5 text-xs font-semibold", cls)}>
      {label}: <span className="font-extrabold tabular-nums">{value}</span>
    </div>
  );
}
