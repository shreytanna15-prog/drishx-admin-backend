"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import {
  createSupplierRequest,
  SupplierApiError,
  updateSupplierRequest,
  type AdminSupplier,
} from "@/app/lib/admin-suppliers";
import {
  checkSupplierConsistency,
  findStateByCode,
  findStateByName,
  formatIndianPhone,
  gstinFieldError,
  INDIAN_STATES,
  isValidGstin,
  normalizeGstin,
  normalizePan,
  panFieldError,
  SUPPLIER_ENTITY_TYPES,
  validateSupplierInput,
} from "@/app/lib/supplier-profile";
import {
  cardClass,
  errorBannerClass,
  errorMessage,
  inputClass,
  labelClass,
  sectionClass,
  sectionTitleClass,
  selectClass,
  textareaClass,
} from "@/components/supplier-ui";
import { cn } from "@/lib/utils";

export const SUPPLIER_FORM_FIELDS = [
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

export type SupplierFormField = (typeof SUPPLIER_FORM_FIELDS)[number];
export type SupplierFormState = Record<SupplierFormField, string>;

export const EMPTY_SUPPLIER_FORM: SupplierFormState = Object.fromEntries(
  SUPPLIER_FORM_FIELDS.map((f) => [f, ""])
) as SupplierFormState;

export function formFromSupplier(s: AdminSupplier): SupplierFormState {
  const out = { ...EMPTY_SUPPLIER_FORM };
  for (const field of SUPPLIER_FORM_FIELDS) {
    const value = s[field];
    out[field] = typeof value === "string" ? value : "";
  }
  if (s.phone) out.phone = formatIndianPhone(s.phone);
  if (s.alternatePhone) out.alternatePhone = formatIndianPhone(s.alternatePhone);
  return out;
}

export function FieldLabel({
  field,
  children,
  required,
}: {
  field: string;
  children: ReactNode;
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

export function FieldError({ field, error }: { field: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`supplier-${field}-error`} className="text-xs text-red-600 dark:text-red-400">
      {error}
    </p>
  );
}

export function SupplierForm({
  supplier,
  onSaved,
  onCancel,
}: {
  /** Omit (or null) to create; pass an existing supplier to edit. */
  supplier?: AdminSupplier | null;
  onSaved: (supplier: AdminSupplier, created: boolean) => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(supplier);
  // The page mounts this form once the supplier is loaded, so the initial
  // snapshot is taken a single time.
  const [initial] = useState<SupplierFormState>(() =>
    supplier ? formFromSupplier(supplier) : EMPTY_SUPPLIER_FORM
  );
  const [form, setForm] = useState<SupplierFormState>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [gstinTouched, setGstinTouched] = useState(false);
  const [panTouched, setPanTouched] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const dirtyKeys = useMemo(
    () => SUPPLIER_FORM_FIELDS.filter((f) => form[f].trim() !== initial[f].trim()),
    [form, initial]
  );
  const isDirty = dirtyKeys.length > 0;
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  function requestCancel() {
    if (submitting) return;
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  }

  function applyGstinFieldError(raw: string) {
    const err = gstinFieldError(raw);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next.gstin = err;
      else delete next.gstin;
      return next;
    });
    return err;
  }

  function applyPanFieldError(panRaw: string, gstinRaw: string) {
    const err = panFieldError(panRaw, gstinRaw);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (err) next.pan = err;
      else delete next.pan;
      return next;
    });
    return err;
  }

  function setField(field: SupplierFormField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "gstin") {
      if (gstinTouched) applyGstinFieldError(value);
      // Re-check PAN only after it has been touched (blur/submit).
      if (panTouched) applyPanFieldError(form.pan, value);
      return;
    }
    if (field === "pan") {
      if (panTouched) applyPanFieldError(value, form.gstin);
      return;
    }
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
    setGstinTouched(true);
    const gstin = normalizeGstin(form.gstin);
    if (!gstin) {
      if (form.gstin !== "") setForm((prev) => ({ ...prev, gstin: "" }));
      applyGstinFieldError("");
      if (panTouched || form.pan.trim()) applyPanFieldError(form.pan, "");
      return;
    }
    if (gstin !== form.gstin) setForm((prev) => ({ ...prev, gstin }));
    const err = applyGstinFieldError(gstin);
    if (err) {
      if (panTouched || form.pan.trim()) applyPanFieldError(form.pan, gstin);
      return;
    }
    const gstState = findStateByCode(gstin.slice(0, 2));
    // Never overwrite a manually entered PAN — only fill when blank.
    setForm((prev) => ({
      ...prev,
      gstin,
      state: prev.state ? prev.state : gstState?.name ?? "",
      pan: prev.pan ? prev.pan : gstin.slice(2, 12),
    }));
    // Re-check PAN against this GSTIN (mismatching manual edits stay visible).
    if (form.pan.trim()) {
      setPanTouched(true);
      applyPanFieldError(form.pan, gstin);
    }
  }

  function onPanBlur() {
    setPanTouched(true);
    const pan = normalizePan(form.pan);
    if (!pan) {
      if (form.pan !== "") setForm((prev) => ({ ...prev, pan: "" }));
      applyPanFieldError("", form.gstin);
      return;
    }
    if (pan !== form.pan) setForm((prev) => ({ ...prev, pan }));
    applyPanFieldError(pan, form.gstin);
  }

  const derivedState =
    findStateByName(form.state) ??
    (isValidGstin(form.gstin) ? findStateByCode(normalizeGstin(form.gstin).slice(0, 2)) : null);
  const legacyStateValue =
    form.state && !findStateByName(form.state) ? form.state : null;

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (!isEdit) {
      for (const field of SUPPLIER_FORM_FIELDS) {
        if (form[field].trim()) payload[field] = form[field];
      }
      return payload;
    }
    for (const field of dirtyKeys) {
      payload[field] = form[field].trim() === "" ? null : form[field];
    }
    return payload;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
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
      if (errors.gstin) setGstinTouched(true);
      if (errors.pan) setPanTouched(true);
      setFormError(errors._form ?? "Please fix the highlighted fields.");
      return;
    }
    if (isEdit && Object.keys(payload).length === 0) {
      onCancel();
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
      // Keep `submitting` true on success: the caller navigates away.
    } catch (err) {
      if (err instanceof SupplierApiError && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
      }
      setFormError(errorMessage(err, "Could not save supplier."));
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

  return (
    <form
      onSubmit={submit}
      noValidate
      className={cn(cardClass, "mx-auto max-w-3xl space-y-4 p-5 sm:p-6")}
    >
      <p className="text-sm text-(--brand-text-muted)">
        Only the supplier name is required. GST state and PAN are checked against the GSTIN.
      </p>

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
            <AdminSelect
              {...fieldProps("businessEntityType")}
              value={form.businessEntityType}
              onValueChange={(v) => setField("businessEntityType", v)}
              options={[
                { value: "", label: "Not specified" },
                ...SUPPLIER_ENTITY_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                })),
              ]}
              placeholder="Not specified"
              disabled={submitting}
            />
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
              onBlur={onPanBlur}
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
            <AdminSelect
              {...fieldProps("state")}
              value={legacyStateValue ?? findStateByName(form.state)?.name ?? ""}
              onValueChange={(v) => setField("state", v)}
              options={[
                { value: "", label: "Not specified" },
                ...(legacyStateValue
                  ? [
                      {
                        value: legacyStateValue,
                        label: `${legacyStateValue} (unrecognised — please reselect)`,
                      },
                    ]
                  : []),
                ...INDIAN_STATES.map((s) => ({ value: s.name, label: s.name })),
              ]}
              placeholder="Not specified"
              disabled={submitting}
            />
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

      <div className="border-t border-(--brand-card-border) pt-4">
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
                  onCancel();
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={submitting || hasFieldErrors || (isEdit && !isDirty)}
              className="h-10 rounded-xl bg-(--brand-primary) px-4 font-extrabold text-(--brand-primary-text) hover:opacity-95"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Create supplier"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={requestCancel}
              disabled={submitting}
              className="h-10 rounded-xl border-(--brand-input-border) px-4"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
