"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";

type WalletSummary = {
  availablePoints: number;
  pendingPoints: number;
  expiringSoon: number;
  totalEarned: number;
  totalRedeemed: number;
};

type LedgerRow = {
  id: string;
  type: string;
  points: number;
  status: string;
  reason: string | null;
  createdAt: string;
};

type CustomerInfo = {
  id: string;
  name: string | null;
  email: string;
  businessName: string | null;
};

function formatType(type: string): string {
  return type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export default function LoyaltyCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [walletData, ledgerData, customersData] = await Promise.all([
        adminFetch<WalletSummary & { rupeeValue?: number }>(
          `/api/loyalty/wallet?customerId=${encodeURIComponent(customerId)}`
        ),
        adminFetch<{ transactions: LedgerRow[] }>(
          `/api/loyalty/transactions?customerId=${encodeURIComponent(customerId)}`
        ),
        adminFetch<{ customers: CustomerInfo[] }>("/api/loyalty/customers"),
      ]);
      setWallet(walletData);
      setTransactions(ledgerData.transactions ?? []);
      const match = customersData.customers?.find((c) => c.id === customerId);
      if (match) {
        setCustomer(match);
      } else {
        setCustomer({ id: customerId, name: null, email: customerId, businessName: null });
      }
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load customer.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAdjust() {
    const points = Number(adjustPoints);
    if (!Number.isFinite(points) || points === 0) {
      setError("Enter a non-zero point adjustment.");
      return;
    }
    if (!adjustReason.trim()) {
      setError("A reason is required for manual adjustments.");
      return;
    }
    setAdjusting(true);
    setError("");
    setMessage("");
    try {
      await adminFetch("/api/loyalty/adjust", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          points,
          reason: adjustReason.trim(),
        }),
      });
      setAdjustPoints("");
      setAdjustReason("");
      setMessage("Points adjusted successfully.");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Adjustment failed.");
    } finally {
      setAdjusting(false);
    }
  }

  const displayName =
    customer?.businessName?.trim() ||
    customer?.name?.trim() ||
    customer?.email ||
    "Customer";

  return (
    <AdminPage title={displayName} subtitle="X Points wallet and ledger">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="size-9 rounded-xl" asChild>
            <Link href="/loyalty/customers" aria-label="Back to loyalty customers">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-extrabold text-(--brand-text)">{displayName}</h1>
            {customer?.email ? (
              <p className="text-sm text-(--brand-muted)">{customer.email}</p>
            ) : null}
          </div>
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

        {loading || !wallet ? (
          <DetailSkeleton cards={3} />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-4">
              {[
                { label: "Available", value: Math.floor(wallet.availablePoints) },
                { label: "Pending", value: Math.floor(wallet.pendingPoints) },
                { label: "Expiring soon", value: Math.floor(wallet.expiringSoon) },
                { label: "Lifetime earned", value: Math.floor(wallet.totalEarned) },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-(--brand-muted)">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-(--brand-primary)">
                    {stat.value}
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Manual adjustment
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                    Points (+ credit, − debit)
                  </label>
                  <Input
                    type="number"
                    value={adjustPoints}
                    onChange={(e) => setAdjustPoints(e.target.value)}
                    className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-(--brand-label)">
                    Reason (required)
                  </label>
                  <Input
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="h-10 border-(--brand-input-border) bg-(--brand-input-bg)"
                  />
                </div>
              </div>
              <Button
                className="mt-4"
                onClick={() => void submitAdjust()}
                disabled={adjusting}
              >
                {adjusting ? "Applying…" : "Apply adjustment"}
              </Button>
            </section>

            <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
              <h2 className="mb-4 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Transaction ledger
              </h2>
              {transactions.length === 0 ? (
                <p className="text-sm text-(--brand-muted)">No transactions yet.</p>
              ) : (
                <div className="divide-y divide-(--brand-card-border)">
                  {transactions.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-(--brand-text)">
                          {formatType(row.type)}
                        </p>
                        <p className="text-(--brand-muted)">
                          {row.reason || row.status}
                        </p>
                        <p className="text-xs text-(--brand-muted)">
                          {new Date(row.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <p
                        className={`font-bold ${
                          row.points >= 0
                            ? "text-(--brand-success)"
                            : "text-(--brand-danger)"
                        }`}
                      >
                        {row.points >= 0 ? "+" : ""}
                        {Math.round(row.points)} pts
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminPage>
  );
}
