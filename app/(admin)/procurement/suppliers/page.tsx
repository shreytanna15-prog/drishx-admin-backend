"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  createSupplierRequest,
  fetchSuppliers,
  setSupplierActive,
  SupplierApiError,
  updateSupplierRequest,
  type AdminSupplier,
} from "@/app/lib/admin-suppliers";
import {
  checkSupplierConsistency,
  findStateByCode,
  findStateByName,
  formatIndianPhone,
  formatSupplierAddress,
  INDIAN_STATES,
  isValidGstin,
  normalizeGstin,
  SUPPLIER_ENTITY_TYPES,
  supplierEntityTypeLabel,
  validateSupplierInput,
} from "@/app/lib/supplier-profile";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const FORM_FIELDS = [
  "name",
  "tradeName",
  "businessEntityType",
  "gstin",
  "pan",
  "state",
  "contactPerson",
  "phone",
  "alternatePhone",
  "email",
  "address",
  "city",
  "pincode",
  "dispatchAddress",
  "notes",
] as const;

type FormField = (typeof FORM_FIELDS)[number];
type FormState = Record<FormField, string>;

const EMPTY_FORM: FormState = Object.fromEntries(
  FORM_FIELDS.map((f) => [f, ""])
) as FormState;

function formFromSupplier(s: AdminSupplier): FormState {
  const out = { ...EMPTY_FORM };
  for (const field of FORM_FIELDS) {
    const value = s[field];
    out[field] = typeof value === "string" ? value : "";
  }
  if (s.phone) out.phone = formatIndianPhone(s.phone);
  if (s.alternatePhone) out.alternatePhone = formatIndianPhone(s.alternatePhone);
  return out;
}

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const textareaClass =
  "w-full min-w-0 rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-2.5 py-2 text-sm text-(--brand-text) outline-none transition-colors placeholder:text-(--brand-placeholder) focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";
const sectionClass =
  "space-y-4 rounded-2xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4";
const sectionTitleClass =
  "text-[11px] font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";
const successBannerClass =
  "rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100";
const warningBannerClass =
  "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

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

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [editing, setEditing] = useState<AdminSupplier | null>(null);
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

  function openCreate() {
    setEditing(null);
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  }

  function openSupplier(supplier: AdminSupplier) {
    setEditing(supplier);
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  }

  function handleSaved(supplier: AdminSupplier, created: boolean) {
    setNotice({
      kind: "success",
      text: created ? `Supplier "${supplier.name}" created.` : `Saved "${supplier.name}".`,
    });
    reload();
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
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" />
            Add supplier
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
            <Button type="button" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" />
              Add supplier
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
                      <button
                        type="button"
                        onClick={() => openSupplier(row)}
                        className="text-left font-medium text-(--brand-text) underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </button>
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
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openSupplier(row)}
                          aria-label={`${canEdit ? "Edit" : "View"} ${row.name}`}
                        >
                          {canEdit ? <Pencil className="size-3.5" /> : null}
                          {canEdit ? "Edit" : "View"}
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

      <SupplierSheet
        key={sheetKey}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        supplier={editing}
        canEdit={canEdit}
        onSaved={handleSaved}
      />

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

// ---------------------------------------------------------------------------
// Create / edit / view sheet
// ---------------------------------------------------------------------------

function SupplierSheet({
  open,
  onOpenChange,
  supplier,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: AdminSupplier | null;
  canEdit: boolean;
  onSaved: (supplier: AdminSupplier, created: boolean) => void;
}) {
  const isEdit = Boolean(supplier);
  const readOnly = !canEdit;
  // The parent remounts this sheet (via `key`) each time it opens, so the
  // initial form snapshot is taken once per open.
  const [initial] = useState<FormState>(() =>
    supplier ? formFromSupplier(supplier) : EMPTY_FORM
  );
  const [form, setForm] = useState<FormState>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirtyKeys = useMemo(
    () => FORM_FIELDS.filter((f) => form[f].trim() !== initial[f].trim()),
    [form, initial]
  );
  const isDirty = dirtyKeys.length > 0;

  function requestClose(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (submitting) return;
    if (isDirty && !readOnly) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(false);
  }

  function setField(field: FormField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field] || (field === "state" && fieldErrors.stateCode)) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        if (field === "state") delete next.stateCode;
        return next;
      });
    }
  }

  function onGstinBlur() {
    const gstin = normalizeGstin(form.gstin);
    if (!gstin) return;
    if (gstin !== form.gstin) setForm((prev) => ({ ...prev, gstin }));
    if (isValidGstin(gstin)) {
      const gstState = findStateByCode(gstin.slice(0, 2));
      setForm((prev) => ({
        ...prev,
        gstin,
        state: prev.state ? prev.state : gstState?.name ?? "",
        pan: prev.pan ? prev.pan : gstin.slice(2, 12),
      }));
    }
  }

  const derivedState =
    findStateByName(form.state) ??
    (isValidGstin(form.gstin) ? findStateByCode(normalizeGstin(form.gstin).slice(0, 2)) : null);
  const legacyStateValue =
    form.state && !findStateByName(form.state) ? form.state : null;

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (!isEdit) {
      for (const field of FORM_FIELDS) {
        if (form[field].trim()) payload[field] = form[field];
      }
      return payload;
    }
    for (const field of dirtyKeys) {
      payload[field] = form[field].trim() === "" ? null : form[field];
    }
    return payload;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || submitting) return;
    setFormError("");

    const payload = buildPayload();
    const result = validateSupplierInput(payload, isEdit ? "update" : "create");
    let errors: Record<string, string> = result.ok ? {} : result.errors;
    if (result.ok && isEdit && supplier) {
      // Mirror the server: check tax identity against stored values when touched.
      const d = result.data;
      const taxTouched =
        d.gstin !== undefined || d.pan !== undefined || d.stateCode !== undefined;
      if (taxTouched) {
        errors = checkSupplierConsistency({
          gstin: d.gstin !== undefined ? d.gstin : supplier.gstin,
          pan: d.pan !== undefined ? d.pan : supplier.pan,
          stateCode: d.stateCode !== undefined ? d.stateCode : supplier.stateCode,
        });
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(errors._form ?? "Please fix the highlighted fields.");
      return;
    }
    if (isEdit && Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && supplier) {
        const res = await updateSupplierRequest(supplier.id, payload);
        onSaved(res.supplier, false);
      } else {
        const res = await createSupplierRequest(payload);
        onSaved(res.supplier, true);
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof SupplierApiError && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      }
      setFormError(errorMessage(err, "Could not save supplier."));
    } finally {
      setSubmitting(false);
    }
  }

  function errorFor(field: string): string | undefined {
    return fieldErrors[field] ?? (field === "state" ? fieldErrors.stateCode : undefined);
  }

  function fieldProps(field: string) {
    const err = errorFor(field);
    return {
      id: `supplier-${field}`,
      "aria-invalid": err ? true : undefined,
      "aria-describedby": err ? `supplier-${field}-error` : undefined,
      disabled: submitting,
    } as const;
  }

  const title = readOnly
    ? supplier?.name ?? "Supplier"
    : isEdit
      ? "Edit supplier"
      : "Add supplier";

  return (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-(--brand-card-border) bg-(--brand-card) sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-(--brand-card-border) pr-12 pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(--brand-input-bg) text-(--brand-primary)">
              {isEdit && !readOnly ? <Pencil className="size-4" /> : <Building2 className="size-4" />}
            </span>
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-lg font-extrabold tracking-tight text-(--brand-text)">
                {title}
              </SheetTitle>
              <SheetDescription className="text-sm leading-relaxed text-(--brand-text-muted)">
                {readOnly
                  ? "Read-only supplier profile. Only admins can make changes."
                  : "Only the supplier name is required. GST state and PAN are checked against the GSTIN."}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {readOnly && supplier ? (
          <SupplierReadOnly supplier={supplier} />
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {formError ? (
                <p className={errorBannerClass} role="alert">
                  {formError}
                </p>
              ) : null}

              <section className={sectionClass} aria-labelledby="supplier-sec-business">
                <p id="supplier-sec-business" className={sectionTitleClass}>
                  Business
                </p>
                <div className="space-y-1.5">
                  <FieldLabel field="name" required>
                    Legal name
                  </FieldLabel>
                  <Input
                    {...fieldProps("name")}
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    className={inputClass}
                    maxLength={120}
                    autoComplete="organization"
                    required
                  />
                  <FieldError field="name" error={errorFor("name")} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel field="tradeName">Trade name</FieldLabel>
                    <Input
                      {...fieldProps("tradeName")}
                      value={form.tradeName}
                      onChange={(e) => setField("tradeName", e.target.value)}
                      className={inputClass}
                      maxLength={120}
                    />
                    <FieldError field="tradeName" error={errorFor("tradeName")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="businessEntityType">Business entity</FieldLabel>
                    <select
                      {...fieldProps("businessEntityType")}
                      value={form.businessEntityType}
                      onChange={(e) => setField("businessEntityType", e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Not specified</option>
                      {SUPPLIER_ENTITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <FieldError field="businessEntityType" error={errorFor("businessEntityType")} />
                  </div>
                </div>
              </section>

              <section className={sectionClass} aria-labelledby="supplier-sec-tax">
                <p id="supplier-sec-tax" className={sectionTitleClass}>
                  GST &amp; tax
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel field="gstin">GSTIN</FieldLabel>
                    <Input
                      {...fieldProps("gstin")}
                      value={form.gstin}
                      onChange={(e) => setField("gstin", e.target.value.toUpperCase())}
                      onBlur={onGstinBlur}
                      className={cn(inputClass, "font-mono uppercase")}
                      maxLength={15}
                      placeholder="24ABCDE1234F1Z5"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                    <FieldError field="gstin" error={errorFor("gstin")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="pan">PAN</FieldLabel>
                    <Input
                      {...fieldProps("pan")}
                      value={form.pan}
                      onChange={(e) => setField("pan", e.target.value.toUpperCase())}
                      className={cn(inputClass, "font-mono uppercase")}
                      maxLength={10}
                      placeholder="ABCDE1234F"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                    <FieldError field="pan" error={errorFor("pan")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="state">State</FieldLabel>
                    <select
                      {...fieldProps("state")}
                      value={legacyStateValue ?? findStateByName(form.state)?.name ?? ""}
                      onChange={(e) => setField("state", e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Not specified</option>
                      {legacyStateValue ? (
                        <option value={legacyStateValue}>
                          {legacyStateValue} (unrecognised — please reselect)
                        </option>
                      ) : null}
                      {INDIAN_STATES.map((s) => (
                        <option key={s.code} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <FieldError field="state" error={errorFor("state")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="stateCode">GST state code</FieldLabel>
                    <Input
                      id="supplier-stateCode"
                      value={derivedState?.code ?? ""}
                      readOnly
                      tabIndex={-1}
                      placeholder="Derived from state"
                      aria-readonly="true"
                      className={cn(inputClass, "bg-(--brand-input-bg) font-mono")}
                    />
                  </div>
                </div>
              </section>

              <section className={sectionClass} aria-labelledby="supplier-sec-contact">
                <p id="supplier-sec-contact" className={sectionTitleClass}>
                  Contact
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <FieldLabel field="contactPerson">Contact person</FieldLabel>
                    <Input
                      {...fieldProps("contactPerson")}
                      value={form.contactPerson}
                      onChange={(e) => setField("contactPerson", e.target.value)}
                      className={inputClass}
                      maxLength={120}
                      autoComplete="name"
                    />
                    <FieldError field="contactPerson" error={errorFor("contactPerson")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="phone">Phone</FieldLabel>
                    <Input
                      {...fieldProps("phone")}
                      value={form.phone}
                      onChange={(e) => setField("phone", e.target.value)}
                      className={inputClass}
                      type="tel"
                      inputMode="tel"
                      placeholder="+91 98765 43210"
                      autoComplete="tel"
                    />
                    <FieldError field="phone" error={errorFor("phone")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="alternatePhone">Alternate phone</FieldLabel>
                    <Input
                      {...fieldProps("alternatePhone")}
                      value={form.alternatePhone}
                      onChange={(e) => setField("alternatePhone", e.target.value)}
                      className={inputClass}
                      type="tel"
                      inputMode="tel"
                      placeholder="022 2654 3210"
                    />
                    <FieldError field="alternatePhone" error={errorFor("alternatePhone")} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <FieldLabel field="email">Email</FieldLabel>
                    <Input
                      {...fieldProps("email")}
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      className={inputClass}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="orders@supplier.in"
                    />
                    <FieldError field="email" error={errorFor("email")} />
                  </div>
                </div>
              </section>

              <section className={sectionClass} aria-labelledby="supplier-sec-address">
                <p id="supplier-sec-address" className={sectionTitleClass}>
                  Addresses
                </p>
                <div className="space-y-1.5">
                  <FieldLabel field="address">Registered address</FieldLabel>
                  <textarea
                    {...fieldProps("address")}
                    value={form.address}
                    onChange={(e) => setField("address", e.target.value)}
                    className={textareaClass}
                    rows={3}
                    maxLength={500}
                  />
                  <FieldError field="address" error={errorFor("address")} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel field="city">City</FieldLabel>
                    <Input
                      {...fieldProps("city")}
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      className={inputClass}
                      maxLength={80}
                    />
                    <FieldError field="city" error={errorFor("city")} />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel field="pincode">PIN code</FieldLabel>
                    <Input
                      {...fieldProps("pincode")}
                      value={form.pincode}
                      onChange={(e) => setField("pincode", e.target.value)}
                      className={inputClass}
                      inputMode="numeric"
                      maxLength={7}
                      placeholder="380001"
                    />
                    <FieldError field="pincode" error={errorFor("pincode")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel field="dispatchAddress">Dispatch address</FieldLabel>
                  <textarea
                    {...fieldProps("dispatchAddress")}
                    value={form.dispatchAddress}
                    onChange={(e) => setField("dispatchAddress", e.target.value)}
                    className={textareaClass}
                    rows={3}
                    maxLength={500}
                    placeholder="Leave blank if same as registered address"
                  />
                  <FieldError field="dispatchAddress" error={errorFor("dispatchAddress")} />
                </div>
              </section>

              <section className={sectionClass} aria-labelledby="supplier-sec-notes">
                <p id="supplier-sec-notes" className={sectionTitleClass}>
                  Notes
                </p>
                <div className="space-y-1.5">
                  <FieldLabel field="notes">Internal notes</FieldLabel>
                  <textarea
                    {...fieldProps("notes")}
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    className={textareaClass}
                    rows={3}
                    maxLength={1000}
                  />
                  <p className="text-right text-xs text-(--brand-text-muted)">
                    {form.notes.length}/1000
                  </p>
                  <FieldError field="notes" error={errorFor("notes")} />
                </div>
              </section>
            </div>

            <SheetFooter className="shrink-0 gap-2 border-t border-(--brand-card-border) px-4 py-4">
              {confirmDiscard ? (
                <div
                  role="alertdialog"
                  aria-labelledby="supplier-discard-title"
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p id="supplier-discard-title" className="text-sm text-(--brand-text)">
                    Discard unsaved changes?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmDiscard(false)}
                      autoFocus
                    >
                      Keep editing
                    </Button>
                    <Button
                      type="button"
                      className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                      onClick={() => {
                        setConfirmDiscard(false);
                        onOpenChange(false);
                      }}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => requestClose(false)}
                    disabled={submitting}
                    className="h-10 flex-1 rounded-xl border-(--brand-input-border)"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || (isEdit && !isDirty)}
                    className="h-10 flex-1 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text) hover:opacity-95"
                  >
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                    {isEdit ? "Save changes" : "Create supplier"}
                  </Button>
                </div>
              )}
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function FieldLabel({
  field,
  children,
  required,
}: {
  field: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={`supplier-${field}`} className={labelClass}>
      {children}
      {required ? (
        <span className="text-red-600 dark:text-red-400" aria-hidden>
          {" "}*
        </span>
      ) : null}
    </label>
  );
}

function FieldError({ field, error }: { field: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`supplier-${field}-error`} className="text-xs text-red-600 dark:text-red-400">
      {error}
    </p>
  );
}

function SupplierReadOnly({ supplier }: { supplier: AdminSupplier }) {
  const address = formatSupplierAddress(supplier);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Legal name", value: supplier.name },
    { label: "Trade name", value: supplier.tradeName },
    { label: "Business entity", value: supplierEntityTypeLabel(supplier.businessEntityType) },
    { label: "Status", value: supplier.isActive ? "Active" : "Inactive" },
    { label: "GSTIN", value: supplier.gstin },
    { label: "PAN", value: supplier.pan },
    {
      label: "State",
      value: supplier.state
        ? `${supplier.state}${supplier.stateCode ? ` (${supplier.stateCode})` : ""}`
        : null,
    },
    { label: "Contact person", value: supplier.contactPerson },
    { label: "Phone", value: supplier.phone ? formatIndianPhone(supplier.phone) : null },
    {
      label: "Alternate phone",
      value: supplier.alternatePhone ? formatIndianPhone(supplier.alternatePhone) : null,
    },
    { label: "Email", value: supplier.email },
    {
      label: "Registered address",
      value: address.length ? (
        <span className="whitespace-pre-line">{address.join("\n")}</span>
      ) : null,
    },
    {
      label: "Dispatch address",
      value: supplier.dispatchAddress ? (
        <span className="whitespace-pre-line">{supplier.dispatchAddress}</span>
      ) : null,
    },
    { label: "Open purchase orders", value: supplier.openPoCount ?? null },
    {
      label: "Notes",
      value: supplier.notes ? (
        <span className="whitespace-pre-line">{supplier.notes}</span>
      ) : null,
    },
  ];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <dl className="divide-y divide-(--brand-card-border) rounded-2xl border border-(--brand-card-border)">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className={labelClass}>{row.label}</dt>
            <dd className="text-sm break-words text-(--brand-text)">
              {row.value === null || row.value === undefined || row.value === "" ? (
                <span className="text-(--brand-text-muted)">—</span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
