"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";

type AlternatePowerSettings = {
  maxSphDelta: number;
  maxCylDelta: number;
  maxSuggestions: number;
  preferWarehouse: boolean;
  hardMaxDistanceScore: number;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AlternatePowerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await adminFetch<{ settings: AlternatePowerSettings }>(
          "/api/settings/alternate-power"
        );
        if (!cancelled) {
          setSettings({
            ...data.settings,
            hardMaxDistanceScore: data.settings.hardMaxDistanceScore ?? 4,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load settings."
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
    if (!settings) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await adminFetch<{ settings: AlternatePowerSettings }>(
        "/api/settings/alternate-power",
        {
          method: "PUT",
          body: JSON.stringify(settings),
        }
      );
      setSettings(data.settings);
      setMessage("Alternate power settings saved.");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to save settings."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage title="Settings" subtitle="Business rules and configuration">
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-(--brand-text)">
            Settings
          </h1>
          <p className="mt-1 text-sm text-(--brand-muted)">
            Configure Smart Alternate Power nearest-power rules for retail orders.
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

        <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
          <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Alternate power
          </h2>
          {loading || !settings ? (
            <DetailSkeleton cards={1} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                  Max SPH delta
                </label>
                <Input
                  type="number"
                  step="0.25"
                  min={0}
                  value={settings.maxSphDelta}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxSphDelta: Number(e.target.value),
                    })
                  }
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                  Max CYL delta
                </label>
                <Input
                  type="number"
                  step="0.25"
                  min={0}
                  value={settings.maxCylDelta}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxCylDelta: Number(e.target.value),
                    })
                  }
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                  Max suggestions
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxSuggestions}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxSuggestions: Number(e.target.value),
                    })
                  }
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                  Hard max distance (|ΔSPH|+|ΔCYL|)
                </label>
                <Input
                  type="number"
                  step="0.25"
                  min={0}
                  value={settings.hardMaxDistanceScore}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      hardMaxDistanceScore: Number(e.target.value),
                    })
                  }
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
                <p className="mt-1 text-[11px] text-(--brand-muted)">
                  Preferred band uses SPH/CYL deltas above. Nearest same-product
                  fill stays under this combined distance. Out-of-stock powers
                  still appear.
                </p>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-(--brand-text)">
                  <input
                    type="checkbox"
                    checked={settings.preferWarehouse}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        preferWarehouse: e.target.checked,
                      })
                    }
                  />
                  Prefer warehouse over out-of-stock / supplier
                </label>
              </div>
              <div className="sm:col-span-2">
                <Button type="button" onClick={() => void handleSave()} disabled={busy}>
                  {busy ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
