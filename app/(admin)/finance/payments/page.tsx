"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { Button } from "@/components/ui/button";

type Claim = {
  id: string;
  amount: number | string;
  mode: string;
  reference: string | null;
  status: string;
  createdAt: string;
  customer: { name: string | null; email: string; businessName: string | null };
  items: Array<{ invoice: { invoiceNumber: string } }>;
};

export default function PaymentsClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ items?: Claim[] } | Claim[]>(
        "/api/finance/payments?kind=claims&status=PENDING&page=1&limit=100"
      );
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
          ? data.items
          : [];
      setClaims(items);
      setError("");
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await adminFetch("/api/finance/payments", {
        method: "POST",
        body: JSON.stringify({ action: "confirm-claim", claimId: id }),
      });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Confirm failed.");
    } finally {
      setBusyId("");
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await adminFetch("/api/finance/payments", {
        method: "POST",
        body: JSON.stringify({
          action: "reject-claim",
          claimId: id,
          reason: "Rejected by admin",
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Reject failed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AdminPage
      title="Payments & Claims"
      subtitle="Customer payment claims awaiting confirmation (latest 100 pending)"
    >
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      {loading ? (
        <TableSkeleton compact columns={5} rows={6} />
      ) : claims.length === 0 ? (
        <p className="text-sm text-(--brand-text-muted)">No pending claims.</p>
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-(--brand-text)">
                  {c.customer.businessName || c.customer.name || c.customer.email}
                </p>
                <p className="text-sm text-(--brand-text-muted)">
                  ₹{Number(c.amount).toLocaleString("en-IN")} · {c.mode}
                  {c.reference ? ` · UTR ${c.reference}` : ""}
                </p>
                <p className="text-xs text-(--brand-label)">
                  {c.items.map((i) => i.invoice.invoiceNumber).join(", ") ||
                    "Unallocated / advance"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyId === c.id}
                  onClick={() => void confirm(c.id)}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === c.id}
                  onClick={() => void reject(c.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
