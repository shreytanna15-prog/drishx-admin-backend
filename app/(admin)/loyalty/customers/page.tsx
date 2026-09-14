"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton } from "@/components/admin-skeletons";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";

type LoyaltyCustomerRow = {
  id: string;
  name: string | null;
  email: string;
  businessName: string | null;
  wallet: {
    availablePoints: number;
    pendingPoints: number;
    totalEarned: number;
    totalRedeemed: number;
  };
};

function displayName(row: LoyaltyCustomerRow): string {
  return row.businessName?.trim() || row.name?.trim() || row.email;
}

export default function LoyaltyCustomersPage() {
  const [customers, setCustomers] = useState<LoyaltyCustomerRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<{ customers: LoyaltyCustomerRow[] }>(
        `/api/loyalty/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`
      );
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(query.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [load, query]);

  const sorted = useMemo(
    () =>
      [...customers].sort((a, b) =>
        displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" })
      ),
    [customers]
  );

  return (
    <AdminPage title="Loyalty Customers" subtitle="Customer wallets and point balances">
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-(--brand-text)">Loyalty Customers</h1>
            <p className="mt-1 text-sm text-(--brand-muted)">
              Search customers and open their X Points ledger.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/loyalty/settings"
              className="text-sm font-semibold text-(--brand-primary) hover:underline"
            >
              Program settings
            </Link>
            <Input
            className="h-10 max-w-sm border-(--brand-input-border) bg-(--brand-input-bg)"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          </div>
        </div>

        {error ? (
          <div className="auth-alert-error" role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <ListSkeleton rows={8} />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-(--brand-muted)">No customers found.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
            {sorted.map((row, index) => (
              <Link
                key={row.id}
                href={`/loyalty/customers/${row.id}`}
                className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-(--brand-card-hover)"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-(--brand-text)">
                    {displayName(row)}
                  </p>
                  <p className="truncate text-sm text-(--brand-muted)">{row.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-6 text-right text-sm">
                  <div>
                    <p className="text-xs text-(--brand-muted)">Available</p>
                    <p className="font-bold text-(--brand-primary)">
                      {Math.floor(row.wallet.availablePoints)} pts
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-(--brand-muted)">Pending</p>
                    <p className="font-semibold text-(--brand-text)">
                      {Math.floor(row.wallet.pendingPoints)} pts
                    </p>
                  </div>
                  <ChevronRight className="size-5 text-(--brand-muted)" />
                </div>
                {index < sorted.length - 1 ? (
                  <span className="sr-only">Next</span>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminPage>
  );
}
