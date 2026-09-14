"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Settings = {
  enabled: boolean;
  pointValue: number | string;
  baseRatePct: number | string;
  advanceBonusPct: number | string;
  fullPaymentRatePct: number | string;
  minMarginPct: number | string;
  maxRedemptionPct: number | string;
  expiryDays: number;
  minInvoiceValue: number | string;
  maxPointsPerInvoice: number | string;
  freightEligible: boolean;
};

const inputClass =
  "h-10 border-(--brand-input-border) bg-(--brand-input-bg)";

function Field({
  label,
  children,
  hint,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-xs text-(--brand-muted)">{hint}</p>
      ) : null}
    </div>
  );
}

export default function LoyaltySettingsPage() {
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
        const data = await adminFetch<Settings>("/api/loyalty/settings");
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
      const updated = await adminFetch<Settings>("/api/loyalty/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          pointValue: Number(form.pointValue),
          baseRatePct: Number(form.baseRatePct),
          advanceBonusPct: Number(form.advanceBonusPct),
          fullPaymentRatePct: Number(form.fullPaymentRatePct),
          minMarginPct: Number(form.minMarginPct),
          maxRedemptionPct: Number(form.maxRedemptionPct),
          expiryDays: Number(form.expiryDays),
          minInvoiceValue: Number(form.minInvoiceValue),
          maxPointsPerInvoice: Number(form.maxPointsPerInvoice),
        }),
      });
      setForm(updated);
      setMessage("Loyalty settings saved.");
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
      title="Loyalty Settings"
      subtitle="X Points earning rates, margin protection, and redemption rules"
    >
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-(--brand-text)">
            X Points Settings
          </h1>
          <p className="mt-1 text-sm text-(--brand-muted)">
            Configure how customers earn and redeem loyalty points (1 X Point = ₹1).
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
                Program
              </h2>
              <label className="flex items-center gap-3 text-sm font-medium text-(--brand-text)">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => set("enabled", e.target.checked)}
                  className="size-4 rounded border-(--brand-input-border)"
                />
                Enable X Points loyalty program
              </label>
            </section>

            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Earning rates
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Base rate (%)" hint="Full/on-time payment rate">
                  <Input
                    className={inputClass}
                    type="number"
                    step="0.1"
                    value={form.baseRatePct}
                    onChange={(e) => set("baseRatePct", e.target.value)}
                  />
                </Field>
                <Field label="Advance bonus (%)" hint="Added when paid before order completes">
                  <Input
                    className={inputClass}
                    type="number"
                    step="0.1"
                    value={form.advanceBonusPct}
                    onChange={(e) => set("advanceBonusPct", e.target.value)}
                  />
                </Field>
                <Field label="Min margin floor (%)" hint="Zero points if order margin is below this">
                  <Input
                    className={inputClass}
                    type="number"
                    step="0.1"
                    value={form.minMarginPct}
                    onChange={(e) => set("minMarginPct", e.target.value)}
                  />
                </Field>
                <Field label="Min invoice value (₹)">
                  <Input
                    className={inputClass}
                    type="number"
                    value={form.minInvoiceValue}
                    onChange={(e) => set("minInvoiceValue", e.target.value)}
                  />
                </Field>
                <Field label="Max points per invoice (₹)" hint="0 = no cap">
                  <Input
                    className={inputClass}
                    type="number"
                    value={form.maxPointsPerInvoice}
                    onChange={(e) => set("maxPointsPerInvoice", e.target.value)}
                  />
                </Field>
                <Field label="Point expiry (days)">
                  <Input
                    className={inputClass}
                    type="number"
                    value={form.expiryDays}
                    onChange={(e) => set("expiryDays", Number(e.target.value))}
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Redemption
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Max redemption per order (%)" hint="Of invoice taxable value">
                  <Input
                    className={inputClass}
                    type="number"
                    step="0.1"
                    value={form.maxRedemptionPct}
                    onChange={(e) => set("maxRedemptionPct", e.target.value)}
                  />
                </Field>
                <Field label="Point value (₹)" hint="Usually 1">
                  <Input
                    className={inputClass}
                    type="number"
                    value={form.pointValue}
                    onChange={(e) => set("pointValue", e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <Button onClick={() => void save()} disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </>
        )}
      </div>
    </AdminPage>
  );
}
