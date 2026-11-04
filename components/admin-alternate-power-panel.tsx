"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import { invalidateListCache } from "@/app/lib/admin-cache";
import type {
  AdminOrder,
  AdminPowerVersion,
} from "@/app/lib/admin-orders";
import {
  getAdminOrder,
  markAdminOrderProcurementNotAvailable,
} from "@/app/lib/admin-orders";

function formatPower(sph: number | null | undefined, cyl: number | null | undefined) {
  const s = sph == null ? "—" : Number(sph).toFixed(2);
  const c = cyl == null ? "—" : Number(cyl).toFixed(2);
  return `${s} / ${c}`;
}

type Props = {
  order: AdminOrder;
  onUpdated: (order: AdminOrder) => void;
};

export function AdminAlternatePowerPanel({ order, onUpdated }: Props) {
  const isRetail = order.lineType === "RETAIL";
  const versions = order.powerVersions ?? [];
  const suggestions = (order.alternateSuggestions ?? []).filter(
    (s) => s.status === "PENDING"
  );
  const [etaDays, setEtaDays] = useState("2");
  const [supplierLensId, setSupplierLensId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!isRetail) {
    return null;
  }

  async function refreshOrder() {
    const updated = await getAdminOrder(order.id);
    onUpdated(updated);
  }

  async function handleMarkNotAvailable() {
    setBusy("na");
    setError("");
    setMessage("");
    try {
      const supplierOptions =
        supplierLensId.trim().length > 0
          ? [
              {
                lensId: supplierLensId.trim(),
                etaDays: Number(etaDays) || 2,
              },
            ]
          : [];
      await markAdminOrderProcurementNotAvailable(order.id, {
        notes: "Marked not available from supplier",
        supplierOptions,
      });
      invalidateListCache("orders");
      await refreshOrder();
      setMessage(
        "Power marked not available. Same-product alternates (including out of stock) were sent to the customer for Accept/Reject when found."
      );
      setSupplierLensId("");
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to mark power not available."
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
      <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
        Smart Alternate Power
      </h2>

      {error ? (
        <div className="auth-alert-error mb-3" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-3 rounded-lg border border-(--brand-success-border) bg-(--brand-success-bg) px-3 py-2 text-sm text-(--brand-success)">
          {message}
        </div>
      ) : null}

      <div className="mb-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
          Power versions
        </h3>
        {versions.length === 0 ? (
          <p className="text-sm text-(--brand-muted)">
            No power versions yet (created on new retail orders).
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v: AdminPowerVersion) => (
              <li
                key={v.id}
                className="rounded-lg border border-(--brand-card-border) px-3 py-2 text-sm"
              >
                <div className="font-semibold text-(--brand-text)">
                  Version {v.versionNumber} · {formatPower(v.sph, v.cyl)}
                </div>
                <div className="text-xs text-(--brand-muted)">
                  {v.source} · {v.status}
                  {v.isFinalFulfilled ? " · Final fulfilled" : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {order.status === "AWAITING_PROCUREMENT" ? (
        <div className="mb-5 grid gap-3 border-t border-(--brand-card-border) pt-5">
          <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
            Mark ordered power not available
          </h3>
          <p className="text-sm text-(--brand-muted)">
            Prefers same-product powers within SPH/CYL deltas, then nearest
            same-product powers under the hard max distance. Out-of-stock powers
            still appear. The customer Accepts or Rejects in their app. Optionally
            add a supplier-procurable lens id with ETA.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                Supplier lens id (optional)
              </label>
              <Input
                value={supplierLensId}
                onChange={(e) => setSupplierLensId(e.target.value)}
                placeholder="Catalog lens id"
                className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                ETA days
              </label>
              <Input
                type="number"
                min={0}
                value={etaDays}
                onChange={(e) => setEtaDays(e.target.value)}
                className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleMarkNotAvailable()}
            disabled={busy === "na"}
          >
            {busy === "na" ? "Working…" : "Mark power not available"}
          </Button>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="border-t border-(--brand-card-border) pt-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-(--brand-label)">
            Pending customer approval
          </h3>
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-(--brand-card-border) px-3 py-2"
              >
                <div className="text-sm font-semibold">
                  {formatPower(s.sph, s.cyl)}
                </div>
                <div className="text-xs text-(--brand-muted)">
                  {s.availability === "WAREHOUSE"
                    ? "Warehouse · Available"
                    : s.availability === "OUT_OF_STOCK"
                      ? "Not in stock"
                      : s.availability === "SUPPLIER"
                        ? `Supplier${s.etaDays != null ? ` · ${s.etaDays} day(s)` : ""}`
                        : s.availability}
                  {typeof s.distanceScore === "number"
                    ? ` · distance ${Number(s.distanceScore).toFixed(2)}`
                    : ""}
                  {" · Waiting for customer"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
