"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  formatMoney,
  getAdminOrderRefund,
  postAdminOrderRefundPayout,
  type AdminOrderRefundSummary,
} from "@/app/lib/admin-orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";

const fieldLabelClass =
  "block text-xs font-semibold text-(--brand-label)";

type RefundPayout = {
  id: string;
  amount: number;
  mode: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
};

const MODES = ["UPI", "BANK", "CASH", "CARD", "CHEQUE", "OTHER"] as const;

export function AdminOrderRefundPanel({ orderId }: { orderId: string }) {
  const [refund, setRefund] = useState<AdminOrderRefundSummary | null | undefined>(
    undefined
  );
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("UPI");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const summary = await getAdminOrderRefund(orderId);
      setRefund(summary);
      if (summary && summary.remaining > 0) {
        setAmount(String(summary.remaining));
      }
    } catch (e) {
      setRefund(null);
      setError(e instanceof AdminApiError ? e.message : "Failed to load refund.");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePayout() {
    setPending(true);
    setError("");
    try {
      const updated = await postAdminOrderRefundPayout(orderId, {
        amount: Number(amount),
        mode,
        paidAt: new Date(paidAt).toISOString(),
        reference: reference.trim() || null,
      });
      setRefund(updated);
      setReference("");
      if (updated.remaining > 0) {
        setAmount(String(updated.remaining));
      } else {
        setAmount("");
      }
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Payout failed.");
    } finally {
      setPending(false);
    }
  }

  if (refund === undefined) {
    return (
      <section className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-(--brand-primary)">
          Refund
        </h2>
        <p className="mt-2 text-sm text-(--brand-text-muted)">Loading…</p>
      </section>
    );
  }

  if (!refund) {
    return null;
  }

  return (
    <section className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4 space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-(--brand-primary)">
        Refund
      </h2>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-(--brand-label)">Status</dt>
          <dd className="font-semibold text-(--brand-text)">{refund.status}</dd>
        </div>
        <div>
          <dt className="text-(--brand-label)">Due</dt>
          <dd className="font-semibold text-(--brand-text)">
            {formatMoney(refund.amountDue)}
          </dd>
        </div>
        <div>
          <dt className="text-(--brand-label)">Paid out</dt>
          <dd className="font-semibold text-(--brand-text)">
            {formatMoney(refund.amountPaid)}
          </dd>
        </div>
        <div>
          <dt className="text-(--brand-label)">Remaining</dt>
          <dd className="font-semibold text-(--brand-text)">
            {formatMoney(refund.remaining)}
          </dd>
        </div>
      </dl>

      {refund.payouts.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {refund.payouts.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-(--brand-card-border) px-3 py-2"
            >
              {formatMoney(p.amount)} · {p.mode} ·{" "}
              {new Date(p.paidAt).toLocaleDateString()}
              {p.reference ? ` · ${p.reference}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {refund.remaining > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="refund-amount" className={fieldLabelClass}>
              Amount
            </label>
            <Input
              id="refund-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="refund-mode" className={fieldLabelClass}>
              Mode
            </label>
            <AdminSelect
              id="refund-mode"
              value={mode}
              onValueChange={(v) => setMode(v as (typeof MODES)[number])}
              options={MODES.map((m) => ({ value: m, label: m }))}
              placeholder="Mode"
              size="sm"
              triggerClassName="h-9 min-w-0"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="refund-paidAt" className={fieldLabelClass}>
              Paid on
            </label>
            <Input
              id="refund-paidAt"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="refund-ref" className={fieldLabelClass}>
              Reference / UTR
            </label>
            <Input
              id="refund-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={pending || !amount}
              onClick={() => void handlePayout()}
            >
              {pending ? "Saving…" : "Record payout"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
