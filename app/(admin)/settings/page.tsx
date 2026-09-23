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

type DispatchCutoffSettings = {
  enabled: boolean;
  time: string;
  timezone: string;
  skipWeekends: boolean;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<AlternatePowerSettings | null>(null);
  const [dispatchCutoff, setDispatchCutoff] = useState<DispatchCutoffSettings | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    async function loadCutoff() {
      try {
        const data = await adminFetch<{ settings: DispatchCutoffSettings }>(
          "/api/settings/dispatch-cutoff"
        );
        if (!cancelled) setDispatchCutoff(data.settings);
      } catch {
        setDispatchCutoff(null);
      }
    }
    void loadCutoff();
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

  async function handleSaveDispatchCutoff() {
    if (!dispatchCutoff) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await adminFetch<{ settings: DispatchCutoffSettings }>(
        "/api/settings/dispatch-cutoff",
        {
          method: "PUT",
          body: JSON.stringify(dispatchCutoff),
        }
      );
      setDispatchCutoff(data.settings);
      setMessage("Dispatch cutoff settings saved.");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to save cutoff settings."
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
            Business rules: alternative-power matching and the courier dispatch cutoff.
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

        <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
          <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Dispatch cutoff
          </h2>
          {dispatchCutoff === null ? (
            <DetailSkeleton cards={1} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-(--brand-text)">
                  <input
                    type="checkbox"
                    checked={dispatchCutoff.enabled}
                    onChange={(e) =>
                      setDispatchCutoff({
                        ...dispatchCutoff,
                        enabled: e.target.checked,
                      })
                    }
                  />
                  Enable daily dispatch cutoff
                </label>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-(--brand-text)">
                  <input
                    type="checkbox"
                    checked={dispatchCutoff.skipWeekends}
                    onChange={(e) =>
                      setDispatchCutoff({
                        ...dispatchCutoff,
                        skipWeekends: e.target.checked,
                      })
                    }
                  />
                  Skip Sat/Sun when deferring to the next day
                </label>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                  Cutoff time
                </label>
                <Input
                  type="time"
                  step="60"
                  value={dispatchCutoff.time}
                  onChange={(e) =>
                    setDispatchCutoff({
                      ...dispatchCutoff,
                      time: e.target.value,
                    })
                  }
                  className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                  Timezone
                </label>
                <select
                  value={dispatchCutoff.timezone}
                  onChange={(e) =>
                    setDispatchCutoff({
                      ...dispatchCutoff,
                      timezone: e.target.value,
                    })
                  }
                  className="h-10 w-full rounded-lg border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text)"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <p className="mb-3 text-[11px] text-(--brand-muted)">
                  Orders placed before this time can be handed to the courier the
                  same day. Orders placed after it are held until the next working
                  day, unless an admin moves them forward on the Dispatch page.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSaveDispatchCutoff()}
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save cutoff"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
