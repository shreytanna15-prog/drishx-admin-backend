"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  errorBannerClass,
  errorMessage,
  successBannerClass,
  warningBannerClass,
} from "@/components/supplier-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchSuppliers,
  setSupplierActive,
  type AdminSupplier,
} from "@/app/lib/admin-suppliers";
import { formatIndianPhone } from "@/app/lib/supplier-profile";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

export default function SuppliersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminSupplier[]>([]);
  const [total, setTotal] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "warning"; text: string } | null>(
    null
  );
  const requestId = useRef(0);

  const [toggleTarget, setToggleTarget] = useState<AdminSupplier | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const handle = setTimeout(() => {
      setLoading(true);
      setSearch(next);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, search]);

  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const id = ++requestId.current;
    fetchSuppliers({ search, includeInactive, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (id !== requestId.current) return;
        setError("");
        setRows(res.suppliers);
        setTotal(res.total);
        setCanEdit(res.canEdit);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setError(errorMessage(err, "Failed to load suppliers."));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [search, includeInactive, page, reloadToken]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(total, page * PAGE_SIZE);

  function goToPage(next: number) {
    setLoading(true);
    setPage(next);
  }

  function reload() {
    setLoading(true);
    setReloadToken((t) => t + 1);
  }

  return (
    <AdminPage
      title="Suppliers"
      subtitle="Supplier profiles used on purchase orders, receipts and purchase bills — business details, GST, contacts and addresses."
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, GSTIN, contact, phone, city"
              className="pl-9"
              aria-label="Search suppliers"
              type="search"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--brand-text)">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setLoading(true);
                setIncludeInactive(e.target.checked);
                setPage(1);
              }}
              className="size-4 rounded border-(--brand-input-border) accent-(--brand-primary)"
            />
            Show inactive
          </label>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href="/procurement/suppliers/new">
              <Plus className="size-4" />
              Add supplier
            </Link>
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className={cn("mb-4", errorBannerClass)} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className={cn(
            "mb-4",
            notice.kind === "success" ? successBannerClass : warningBannerClass
          )}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <TableSkeleton rows={8} columns={7} compact />
      ) : !loading && rows.length === 0 && !error ? (
        <div className="rounded-lg border border-dashed border-(--brand-card-border) px-6 py-16 text-center">
          <p className="text-sm font-medium text-(--brand-text)">
            {search || includeInactive ? "No suppliers match" : "No suppliers yet"}
          </p>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {search
              ? "Try a different name, GSTIN, phone number or city."
              : canEdit
                ? "Add your first supplier to use it on purchase orders and bills."
                : "Suppliers added by an admin will appear here."}
          </p>
          {canEdit && !search ? (
            <Button asChild className="mt-4">
              <Link href="/procurement/suppliers/new">
                <Plus className="size-4" />
                Add supplier
              </Link>
            </Button>
          ) : null}
        </div>
      ) : rows.length > 0 ? (
        <>
          <div
            className={cn(
              "overflow-x-auto rounded-lg border border-(--brand-card-border) transition-opacity",
              loading && "opacity-60"
            )}
            aria-busy={loading}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">Supplier</TableHead>
                  <TableHead>Contact person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>City / State</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Open POs</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/procurement/suppliers/${encodeURIComponent(row.id)}`}
                        className="text-left font-medium text-(--brand-text) underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.tradeName && row.tradeName !== row.name ? (
                        <div className="text-xs text-(--brand-text-muted)">
                          {row.tradeName}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.contactPerson ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.phone ? formatIndianPhone(row.phone) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.email ? (
                        <a
                          href={`mailto:${row.email}`}
                          className="text-(--brand-text) underline-offset-4 hover:underline"
                        >
                          {row.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.gstin ?? "—"}</TableCell>
                    <TableCell>
                      {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          row.isActive
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                            : "border-(--brand-card-border) bg-(--brand-input-bg) text-(--brand-text-muted)"
                        )}
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.openPoCount ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                        >
                          <Link
                            href={
                              canEdit
                                ? `/procurement/suppliers/${encodeURIComponent(row.id)}/edit`
                                : `/procurement/suppliers/${encodeURIComponent(row.id)}`
                            }
                            aria-label={`${canEdit ? "Edit" : "View"} ${row.name}`}
                          >
                            {canEdit ? <Pencil className="size-3.5" /> : null}
                            {canEdit ? "Edit" : "View"}
                          </Link>
                        </Button>
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setToggleTarget(row)}
                            aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.name}`}
                          >
                            <Power className="size-3.5" />
                            {row.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex flex-col items-center justify-between gap-2 text-sm text-(--brand-text-muted) sm:flex-row">
            <span>
              Showing {firstRow}–{lastRow} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(Math.max(1, page - 1))}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="tabular-nums">
                Page {page} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pageCount || loading}
                onClick={() => goToPage(Math.min(pageCount, page + 1))}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {toggleTarget ? (
        <ToggleActiveDialog
          supplier={toggleTarget}
          onClose={() => setToggleTarget(null)}
          onDone={(supplier, warning) => {
            setToggleTarget(null);
            setNotice(
              warning
                ? { kind: "warning", text: `${supplier.name} deactivated. ${warning}` }
                : {
                    kind: "success",
                    text: `${supplier.name} ${supplier.isActive ? "activated" : "deactivated"}.`,
                  }
            );
            reload();
          }}
        />
      ) : null}
    </AdminPage>
  );
}

// ---------------------------------------------------------------------------
// Activate / deactivate confirmation
// ---------------------------------------------------------------------------

function ToggleActiveDialog({
  supplier,
  onClose,
  onDone,
}: {
  supplier: AdminSupplier;
  onClose: () => void;
  onDone: (supplier: AdminSupplier, warning: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deactivating = supplier.isActive;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await setSupplierActive(supplier.id, !supplier.isActive);
      onDone(res.supplier, res.warning);
    } catch (err) {
      setError(errorMessage(err, "Could not update supplier status."));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supplier-toggle-title"
      aria-describedby="supplier-toggle-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-lg">
        <h2 id="supplier-toggle-title" className="text-lg font-semibold text-(--brand-text)">
          {deactivating ? "Deactivate supplier" : "Activate supplier"}
        </h2>
        <p id="supplier-toggle-desc" className="mt-2 text-sm text-(--brand-text-muted)">
          {deactivating
            ? `${supplier.name} will be hidden from supplier pickers for new purchase orders and bills. History is kept and the profile can be reactivated any time.`
            : `${supplier.name} will be available again for new purchase orders and bills.`}
        </p>
        {deactivating && (supplier.openPoCount ?? 0) > 0 ? (
          <p className={cn("mt-3", warningBannerClass)}>
            This supplier has {supplier.openPoCount} open purchase order
            {supplier.openPoCount === 1 ? "" : "s"}. They stay open and can still be received.
          </p>
        ) : null}
        {error ? (
          <p className={cn("mt-3", errorBannerClass)} role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            autoFocus
            className={cn(
              deactivating &&
                "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {deactivating ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
