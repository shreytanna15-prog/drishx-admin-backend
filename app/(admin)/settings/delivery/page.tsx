"use client";

import { useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  createDeliveryService,
  deleteDeliveryService,
  listDeliveryServices,
  updateDeliveryService,
  type AdminDeliveryService,
} from "@/app/lib/admin-delivery";

type DeliveryForm = {
  courierCompany: string;
  serviceName: string;
  serviceType: string;
  customerRate: number;
  billingMethod: string;
  flatCharge: number;
  minCharge: number;
  minWeight: number;
  weightRounding: string;
  internalCostRate: number;
  internalMinCost: number;
  etaText: string;
};

const EMPTY: DeliveryForm = {
  courierCompany: "",
  serviceName: "",
  serviceType: "LAND",
  customerRate: 50,
  billingMethod: "PER_KG",
  flatCharge: 0,
  minCharge: 0,
  minWeight: 1,
  weightRounding: "NEXT_1KG",
  internalCostRate: 35,
  internalMinCost: 0,
  etaText: "",
};

const inputClass =
  "h-10 w-full rounded-lg border border-(--brand-card-border) bg-transparent px-3 text-sm text-(--brand-text)";
const labelClass = "mb-1 block text-xs font-semibold text-(--brand-label)";

export default function DeliverySettingsPage() {
  const [services, setServices] = useState<AdminDeliveryService[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setServices(await listDeliveryServices({ all: true }));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load delivery services.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(s: AdminDeliveryService) {
    setEditingId(s.id);
    setForm({
      courierCompany: s.courierCompany,
      serviceName: s.serviceName,
      serviceType: s.serviceType,
      customerRate: s.customerRate,
      billingMethod: s.billingMethod,
      flatCharge: s.flatCharge,
      minCharge: s.minCharge,
      minWeight: s.minWeight,
      weightRounding: s.weightRounding,
      internalCostRate: s.internalCostRate,
      internalMinCost: s.internalMinCost,
      etaText: s.etaText ?? "",
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function handleSave() {
    if (!form.courierCompany.trim() || !form.serviceName.trim()) {
      setError("Courier company and service name are required.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = { ...form, etaText: form.etaText || null };
      if (editingId) {
        await updateDeliveryService(editingId, payload);
        setMessage("Delivery service updated.");
      } else {
        await createDeliveryService(payload);
        setMessage("Delivery service created.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(s: AdminDeliveryService) {
    setBusy(true);
    setError("");
    try {
      await updateDeliveryService(s.id, { isActive: !s.isActive });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(s: AdminDeliveryService) {
    if (!window.confirm(`Delete "${s.serviceName}"? Used services are deactivated instead.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteDeliveryService(s.id);
      setMessage("Delivery service removed (or deactivated if already used).");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage title="Delivery Services" subtitle="Courier services, packing rates and internal costs">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-extrabold text-(--brand-text)">Delivery Services</h1>
          <p className="mt-1 text-sm text-(--brand-muted)">
            One courier can have many services (e.g. Sri Raj Land + Air). Customer sees the rate;
            internal cost stays hidden and becomes delivery margin in Finance.
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

        <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <h2 className="mb-3 text-sm font-bold text-(--brand-text)">
            {editingId ? "Edit service" : "New service"}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Courier company</label>
              <Input className={inputClass} value={form.courierCompany} onChange={(e) => set("courierCompany", e.target.value)} placeholder="Sri Raj Courier" />
            </div>
            <div>
              <label className={labelClass}>Service name</label>
              <Input className={inputClass} value={form.serviceName} onChange={(e) => set("serviceName", e.target.value)} placeholder="Sri Raj Courier — Land" />
            </div>
            <div>
              <label className={labelClass}>Service type</label>
              <AdminSelect
                value={form.serviceType}
                onValueChange={(v) => set("serviceType", v)}
                options={[
                  { value: "LAND", label: "LAND" },
                  { value: "AIR", label: "AIR" },
                  { value: "SURFACE", label: "SURFACE" },
                  { value: "PICKUP", label: "PICKUP" },
                ]}
                placeholder="Service type"
                triggerClassName={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ETA text</label>
              <Input className={inputClass} value={form.etaText ?? ""} onChange={(e) => set("etaText", e.target.value)} placeholder="1–2 days" />
            </div>
            <div>
              <label className={labelClass}>Customer rate (₹/kg)</label>
              <Input className={inputClass} type="number" min={0} value={form.customerRate} onChange={(e) => set("customerRate", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Internal cost (₹/kg)</label>
              <Input className={inputClass} type="number" min={0} value={form.internalCostRate} onChange={(e) => set("internalCostRate", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Weight rounding</label>
              <AdminSelect
                value={form.weightRounding}
                onValueChange={(v) => set("weightRounding", v)}
                options={[
                  { value: "NEXT_1KG", label: "Round up to next kg" },
                  { value: "NEXT_0_5KG", label: "Round to 0.5 kg" },
                  { value: "ACTUAL", label: "Actual weight" },
                ]}
                placeholder="Weight rounding"
                triggerClassName={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Minimum chargeable weight (kg)</label>
              <Input className={inputClass} type="number" min={0} step={0.5} value={form.minWeight} onChange={(e) => set("minWeight", Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Billing method</label>
              <AdminSelect
                value={form.billingMethod}
                onValueChange={(v) => set("billingMethod", v)}
                options={[
                  { value: "PER_KG", label: "Per kg" },
                  { value: "FLAT", label: "Flat (e.g. free pickup)" },
                ]}
                placeholder="Billing method"
                triggerClassName={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Flat charge (₹, if FLAT)</label>
              <Input className={inputClass} type="number" min={0} value={form.flatCharge} onChange={(e) => set("flatCharge", Number(e.target.value))} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : editingId ? "Update service" : "Create service"}
            </Button>
            {editingId ? (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <h2 className="mb-3 text-sm font-bold text-(--brand-text)">Services</h2>
          {loading ? (
            <p className="text-sm text-(--brand-muted)">Loading…</p>
          ) : services.length === 0 ? (
            <p className="text-sm text-(--brand-muted)">No delivery services yet. Seed with `npx tsx prisma/seed-delivery-services.ts`.</p>
          ) : (
            <div className="space-y-2">
              {services.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-(--brand-card-border) px-3 py-2"
                >
                  <div className="text-sm">
                    <span className="font-bold text-(--brand-text)">{s.serviceName}</span>{" "}
                    <span className="text-(--brand-muted)">
                      ₹{s.customerRate}/kg · cost ₹{s.internalCostRate}/kg · {s.weightRounding} · min {s.minWeight}kg
                      {s.etaText ? ` · ${s.etaText}` : ""}
                    </span>{" "}
                    {!s.isActive ? (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggleActive(s)} disabled={busy}>
                      {s.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(s)} disabled={busy}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
