"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = {
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string;
  stateCode: string;
  gstin: string | null;
  pan: string | null;
  invoiceSeriesPrefix: string;
  defaultHsnCode: string;
  defaultGstRatePercent: number | string;
  paymentTermsDays: number;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  invoiceFooterNotes: string | null;
};

const inputClass =
  "h-10 border-(--brand-input-border) bg-(--brand-input-bg)";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function FinanceSettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch<Settings>("/api/finance/settings");
        if (!cancelled) setForm(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AdminApiError ? err.message : "Failed to load settings."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await adminFetch<Settings>("/api/finance/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          defaultGstRatePercent: Number(form.defaultGstRatePercent),
          paymentTermsDays: Number(form.paymentTermsDays),
        }),
      });
      setForm(updated);
      setMessage("Finance settings saved.");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <AdminPage
      title="Finance Settings"
      subtitle="Company GSTIN, invoice series, and tax defaults"
    >
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-(--brand-text)">
            Finance Settings
          </h1>
          <p className="mt-1 text-sm text-(--brand-muted)">
            Company identity, GST defaults, invoice numbering, and bank details used
            on tax invoices.
          </p>
        </div>

        {error ? (
          <div className="auth-alert-error" role="alert">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-(--brand-success-border) bg-(--brand-success-bg) px-3 py-2 text-sm text-(--brand-success)">
            {message}
          </div>
        ) : null}

        {loading || !form ? (
          <DetailSkeleton cards={3} />
        ) : (
          <>
            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Company & GST
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Legal name">
                  <Input
                    className={inputClass}
                    value={form.legalName}
                    onChange={(e) => set("legalName", e.target.value)}
                  />
                </Field>
                <Field label="Trade name">
                  <Input
                    className={inputClass}
                    value={form.tradeName ?? ""}
                    onChange={(e) => set("tradeName", e.target.value || null)}
                  />
                </Field>
                <Field label="GSTIN">
                  <Input
                    className={inputClass}
                    value={form.gstin ?? ""}
                    onChange={(e) => set("gstin", e.target.value || null)}
                  />
                </Field>
                <Field label="PAN">
                  <Input
                    className={inputClass}
                    value={form.pan ?? ""}
                    onChange={(e) => set("pan", e.target.value || null)}
                  />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <Input
                    className={inputClass}
                    value={form.addressLine1 ?? ""}
                    onChange={(e) => set("addressLine1", e.target.value || null)}
                  />
                </Field>
                <Field label="City">
                  <Input
                    className={inputClass}
                    value={form.city ?? ""}
                    onChange={(e) => set("city", e.target.value || null)}
                  />
                </Field>
                <Field label="State">
                  <Input
                    className={inputClass}
                    value={form.state}
                    onChange={(e) => set("state", e.target.value)}
                  />
                </Field>
                <Field label="State code">
                  <Input
                    className={inputClass}
                    value={form.stateCode}
                    onChange={(e) => set("stateCode", e.target.value)}
                    placeholder="e.g. 24"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Invoice defaults
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Invoice series prefix">
                  <Input
                    className={inputClass}
                    value={form.invoiceSeriesPrefix}
                    onChange={(e) => set("invoiceSeriesPrefix", e.target.value)}
                  />
                </Field>
                <Field label="Payment terms (days)">
                  <Input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={form.paymentTermsDays}
                    onChange={(e) =>
                      set("paymentTermsDays", Number(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label="Default HSN">
                  <Input
                    className={inputClass}
                    value={form.defaultHsnCode}
                    onChange={(e) => set("defaultHsnCode", e.target.value)}
                  />
                </Field>
                <Field label="Default GST %">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    className={inputClass}
                    value={form.defaultGstRatePercent}
                    onChange={(e) => set("defaultGstRatePercent", e.target.value)}
                  />
                </Field>
                <Field label="Invoice footer notes" className="sm:col-span-2">
                  <Input
                    className={inputClass}
                    value={form.invoiceFooterNotes ?? ""}
                    onChange={(e) =>
                      set("invoiceFooterNotes", e.target.value || null)
                    }
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Bank details
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bank name" className="sm:col-span-2">
                  <Input
                    className={inputClass}
                    value={form.bankName ?? ""}
                    onChange={(e) => set("bankName", e.target.value || null)}
                  />
                </Field>
                <Field label="Account number">
                  <Input
                    className={inputClass}
                    value={form.bankAccountNumber ?? ""}
                    onChange={(e) =>
                      set("bankAccountNumber", e.target.value || null)
                    }
                  />
                </Field>
                <Field label="IFSC">
                  <Input
                    className={inputClass}
                    value={form.bankIfsc ?? ""}
                    onChange={(e) => set("bankIfsc", e.target.value || null)}
                  />
                </Field>
              </div>
            </section>

            <div>
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminPage>
  );
}
