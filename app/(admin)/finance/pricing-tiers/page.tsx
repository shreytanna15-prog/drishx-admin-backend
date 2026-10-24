"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  listPricingTiers,
  savePricingTiers,
  type AdminPricingTier,
} from "@/app/lib/admin-pricing-tiers";

export default function PricingTiersPage() {
  const [tiers, setTiers] = useState<AdminPricingTier[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const rows = await listPricingTiers();
        if (cancelled) return;
        setTiers(rows);
        const next: Record<string, string> = {};
        for (const t of rows) next[t.code] = String(t.discountPercent);
        setDrafts(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load pricing tiers."
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

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = tiers.map((t) => ({
        code: t.code,
        discountPercent: Number(drafts[t.code] ?? t.discountPercent),
      }));
      for (const row of payload) {
        if (
          !Number.isFinite(row.discountPercent) ||
          row.discountPercent < 0 ||
          row.discountPercent > 100
        ) {
          setError(`Tier ${row.code}: discount must be 0–100.`);
          setSaving(false);
          return;
        }
      }
      const saved = await savePricingTiers(payload);
      setTiers(saved);
      const next: Record<string, string> = {};
      for (const t of saved) next[t.code] = String(t.discountPercent);
      setDrafts(next);
      setMessage("Pricing tiers saved.");
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to save pricing tiers."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title="Pricing tiers"
      subtitle="Discount % by tier A–F — applied before GST at checkout"
    >
      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-4 rounded-xl border border-(--brand-success-border) bg-(--brand-success-bg) px-4 py-3 text-sm text-(--brand-success)">
          {message}
        </div>
      ) : null}

      {loading ? (
        <DetailSkeleton />
      ) : (
        <div className="mx-auto max-w-xl space-y-4">
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <ul className="divide-y divide-(--brand-card-border)">
              {tiers.map((tier) => (
                <li
                  key={tier.code}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-(--brand-text)">
                      {tier.code}
                    </span>
                    {tier.isBase ? (
                      <Badge
                        variant="outline"
                        className="rounded-md border-(--brand-primary) bg-[rgba(240,161,50,0.14)] text-[10px] font-bold text-(--brand-primary)"
                      >
                        Base
                      </Badge>
                    ) : null}
                    <span className="text-sm text-(--brand-text-muted)">
                      {tier.name}
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-(--brand-text)">
                    <Input
                      value={drafts[tier.code] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [tier.code]: e.target.value,
                        }))
                      }
                      className="h-10 w-24 border-(--brand-input-border) bg-(--brand-input-bg) text-right"
                      inputMode="decimal"
                    />
                    %
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
          >
            {saving ? "Saving…" : "Save all"}
          </Button>
        </div>
      )}
    </AdminPage>
  );
}
