"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, X } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminCustomer,
  customerDisplayName,
  customerPersonName,
  formatCustomerDate,
  isSuspendedCustomer,
  listAdminCustomers,
  matchesCustomerSearch,
} from "@/app/lib/admin-customers";
import { useInfiniteScrollSentinel } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

type ClientsTab = "pending" | "incomplete" | "approved" | "rejected";

function parseTab(value: string | null): ClientsTab {
  if (value === "approved") return "approved";
  if (value === "incomplete") return "incomplete";
  if (value === "rejected") return "rejected";
  return "pending";
}

function ClientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [pending, setPending] = useState<AdminCustomer[]>([]);
  const [incomplete, setIncomplete] = useState<AdminCustomer[]>([]);
  const [rejected, setRejected] = useState<AdminCustomer[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingIncomplete, setLoadingIncomplete] = useState(true);
  const [loadingRejected, setLoadingRejected] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [approvedPage, setApprovedPage] = useState(1);
  const [approvedHasMore, setApprovedHasMore] = useState(false);
  const [approvedTotal, setApprovedTotal] = useState<number | undefined>();
  const [rejectedPage, setRejectedPage] = useState(1);
  const [rejectedHasMore, setRejectedHasMore] = useState(false);
  const [rejectedTotal, setRejectedTotal] = useState<number | undefined>();
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const setTab = useCallback(
    (next: ClientsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`/clients?${params.toString()}`);
    },
    [router, searchParams]
  );

  const loadApproved = useCallback(
    async (page = 1, q = debouncedQ) => {
      if (page === 1) setLoadingApproved(true);
      try {
        const data = await listAdminCustomers({
          status: "approved",
          page,
          limit: 30,
          q: q || undefined,
        });
        setApprovedHasMore(data.hasMore);
        setApprovedTotal(data.total);
        setApprovedPage(data.page);
        setCustomers((prev) => {
          if (data.page <= 1) return data.items;
          const seen = new Set(prev.map((c) => c.id));
          const merged = [...prev];
          for (const row of data.items) {
            if (!seen.has(row.id)) merged.push(row);
          }
          return merged;
        });
      } catch (err) {
        setError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load customers."
        );
      } finally {
        setLoadingApproved(false);
      }
    },
    [debouncedQ]
  );

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const data = await adminFetch<{ users: AdminCustomer[] }>(
        "/api/users/pending?bucket=ready"
      );
      setPending(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load pending approvals."
      );
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const loadIncomplete = useCallback(async () => {
    setLoadingIncomplete(true);
    try {
      const data = await adminFetch<{ users: AdminCustomer[] }>(
        "/api/users/pending?bucket=incomplete"
      );
      setIncomplete(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load incomplete signups."
      );
    } finally {
      setLoadingIncomplete(false);
    }
  }, []);

  const loadRejected = useCallback(
    async (page = 1, q = debouncedQ) => {
      if (page === 1) setLoadingRejected(true);
      try {
        const data = await listAdminCustomers({
          status: "rejected",
          page,
          limit: 30,
          q: q || undefined,
        });
        setRejectedHasMore(data.hasMore);
        setRejectedTotal(data.total);
        setRejectedPage(data.page);
        setRejected((prev) => {
          if (data.page <= 1) return data.items;
          const seen = new Set(prev.map((c) => c.id));
          const merged = [...prev];
          for (const row of data.items) {
            if (!seen.has(row.id)) merged.push(row);
          }
          return merged;
        });
      } catch (err) {
        setError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load rejected customers."
        );
      } finally {
        setLoadingRejected(false);
      }
    },
    [debouncedQ]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadPending();
      void loadIncomplete();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadPending, loadIncomplete]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadApproved(1, debouncedQ);
      void loadRejected(1, debouncedQ);
    }, 0);
    return () => window.clearTimeout(t);
  }, [debouncedQ, loadApproved, loadRejected]);

  const filteredApproved = customers;
  const filteredRejected = rejected;

  const { setSentinelNode: setApprovedSentinel } = useInfiniteScrollSentinel({
    enabled: tab === "approved" && approvedHasMore && !loadingApproved,
    onLoadMore: () => {
      void loadApproved(approvedPage + 1, debouncedQ);
    },
    deps: [customers.length, approvedPage, approvedHasMore, tab],
  });

  const { setSentinelNode: setRejectedSentinel } = useInfiniteScrollSentinel({
    enabled: tab === "rejected" && rejectedHasMore && !loadingRejected,
    onLoadMore: () => {
      void loadRejected(rejectedPage + 1, debouncedQ);
    },
    deps: [rejected.length, rejectedPage, rejectedHasMore, tab],
  });

  const filteredPending = useMemo(
    () => pending.filter((customer) => matchesCustomerSearch(customer, query)),
    [pending, query]
  );

  const filteredIncomplete = useMemo(
    () => incomplete.filter((customer) => matchesCustomerSearch(customer, query)),
    [incomplete, query]
  );

  async function handleApprove(customer: AdminCustomer) {
    if (
      !window.confirm(
        `Approve ${customerDisplayName(customer)} (${customer.email})?`
      )
    ) {
      return;
    }

    setActingId(customer.id);
    setActionError("");
    try {
      await adminFetch(`/api/users/${customer.id}/approve`, {
        method: "PUT",
        body: JSON.stringify({ action: "approve" }),
      });
      setPending((prev) => prev.filter((item) => item.id !== customer.id));
      await loadApproved();
    } catch (err) {
      setActionError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to approve customer."
      );
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(customer: AdminCustomer) {
    const reason = window.prompt(
      `Reject ${customerDisplayName(customer)}?\nEnter a rejection reason (required):`
    );
    if (reason == null) return;
    const rejectionReason = reason.trim();
    if (!rejectionReason) {
      setActionError("Rejection reason is required.");
      return;
    }

    setActingId(customer.id);
    setActionError("");
    try {
      await adminFetch(`/api/users/${customer.id}/approve`, {
        method: "PUT",
        body: JSON.stringify({ action: "reject", rejectionReason }),
      });
      setPending((prev) => prev.filter((item) => item.id !== customer.id));
      setIncomplete((prev) => prev.filter((item) => item.id !== customer.id));
      await loadRejected();
    } catch (err) {
      setActionError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to reject customer."
      );
    } finally {
      setActingId(null);
    }
  }

  const loading =
    tab === "pending"
      ? loadingPending
      : tab === "incomplete"
        ? loadingIncomplete
        : tab === "rejected"
          ? loadingRejected
          : loadingApproved;

  const listCount =
    tab === "pending"
      ? filteredPending.length
      : tab === "incomplete"
        ? filteredIncomplete.length
        : tab === "rejected"
          ? (rejectedTotal ?? filteredRejected.length)
          : (approvedTotal ?? filteredApproved.length);

  const subtitle =
    tab === "pending"
      ? "GST submitted — ready to approve or reject"
      : tab === "incomplete"
        ? "Abandoned or mid-wizard signups (no GST yet)"
        : tab === "rejected"
          ? "Rejected applications"
          : "Approved customers";

  const tabs: { id: ClientsTab; label: string; count?: number }[] = [
    { id: "pending", label: "Pending approvals", count: pending.length },
    { id: "incomplete", label: "Incomplete", count: incomplete.length },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
  ];

  function renderActionList(
    rows: AdminCustomer[],
    emptyMsg: string,
    options: { showApprove: boolean; from: ClientsTab }
  ) {
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          {query.trim() ? "No customers match your search." : emptyMsg}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
        <ul className="divide-y divide-(--brand-card-border)">
          {rows.map((customer) => (
            <li
              key={customer.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <Link
                href={`/clients/${customer.id}?from=${options.from}`}
                className="min-w-0 flex-1 transition hover:opacity-90"
              >
                <p className="truncate font-extrabold text-(--brand-text)">
                  {customerDisplayName(customer)}
                </p>
                <p className="mt-0.5 truncate text-sm text-(--brand-text-muted)">
                  {customerPersonName(customer)} · {customer.email}
                </p>
                <p className="mt-1 truncate text-xs text-(--brand-text-muted)">
                  {[
                    customer.gstNumber
                      ? `GST ${customer.gstNumber}`
                      : "No GST submitted",
                    customer.shopName || customer.businessName,
                    customer.mobileNumber,
                    customer.city || customer.state,
                    `Updated ${formatCustomerDate(customer.updatedAt)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>

              <div className="flex shrink-0 items-center gap-2">
                {options.showApprove ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={actingId === customer.id}
                    onClick={() => void handleApprove(customer)}
                    className="h-9 gap-1.5 rounded-xl bg-(--brand-primary) px-3 font-bold text-black hover:bg-(--brand-primary)/90"
                  >
                    <Check className="size-3.5" />
                    {actingId === customer.id ? "…" : "Approve"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={actingId === customer.id}
                  onClick={() => void handleReject(customer)}
                  className="h-9 gap-1.5 rounded-xl px-3 font-bold"
                >
                  <X className="size-3.5" />
                  Reject
                </Button>
                <Link
                  href={`/clients/${customer.id}?from=${options.from}`}
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-(--brand-card-border) text-(--brand-text-muted) hover:bg-[rgba(240,161,50,0.06)]"
                  aria-label="View details"
                >
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <AdminPage title="Clients" subtitle={subtitle}>
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
              Clients
            </h1>
            <p className="mt-1 text-sm text-(--brand-text-muted)">
              {loading
                ? "…"
                : `${listCount} customer${listCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, GST, email…"
            className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-bold transition",
                tab === item.id
                  ? "border-(--brand-primary) bg-[rgba(240,161,50,0.14)] text-(--brand-primary)"
                  : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:bg-[rgba(240,161,50,0.06)]"
              )}
            >
              {item.label}
              {item.count != null && item.count > 0 ? (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-(--brand-primary) px-1.5 text-xs font-extrabold text-black">
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {actionError ? (
        <div className="auth-alert-error mb-4" role="alert">
          {actionError}
        </div>
      ) : null}

      {tab === "pending" ? (
        loadingPending ? (
          <ListSkeleton compact rows={6} />
        ) : (
          renderActionList(filteredPending, "No pending approval requests.", {
            showApprove: true,
            from: "pending",
          })
        )
      ) : null}

      {tab === "incomplete" ? (
        loadingIncomplete ? (
          <ListSkeleton compact rows={6} />
        ) : (
          renderActionList(
            filteredIncomplete,
            "No incomplete signups.",
            { showApprove: false, from: "incomplete" }
          )
        )
      ) : null}

      {tab === "rejected" ? (
        loadingRejected && rejected.length === 0 ? (
          <ListSkeleton compact rows={6} />
        ) : filteredRejected.length === 0 ? (
          <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
            {query.trim()
              ? "No rejected customers match your search."
              : "No rejected customers."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <ul className="divide-y divide-(--brand-card-border)">
              {filteredRejected.map((customer) => (
                <li key={customer.id}>
                  <Link
                    href={`/clients/${customer.id}?from=rejected`}
                    className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-[rgba(240,161,50,0.06)] sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-extrabold text-(--brand-text)">
                        {customerDisplayName(customer)}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-(--brand-text-muted)">
                        {customer.email}
                        {customer.rejectionReason
                          ? ` · ${customer.rejectionReason}`
                          : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-(--brand-text-muted)" />
                  </Link>
                </li>
              ))}
            </ul>
            {rejectedHasMore ? (
              <InfiniteScrollSentinel
                active
                loadingMore={loadingRejected && rejectedPage > 1}
                setSentinelNode={setRejectedSentinel}
              />
            ) : null}
          </div>
        )
      ) : null}

      {tab === "approved" ? (
        loadingApproved ? (
          <ListSkeleton compact rows={8} />
        ) : filteredApproved.length === 0 ? (
          <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
            {query.trim()
              ? "No customers match your search."
              : "No approved customers found yet."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <ul className="divide-y divide-(--brand-card-border)">
              {filteredApproved.map((customer) => (
                <li key={customer.id} className="relative">
                  <Link
                    href={`/clients/${customer.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-[rgba(240,161,50,0.06)] sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-extrabold text-(--brand-text)">
                          {customerDisplayName(customer)}
                        </p>
                        {isSuspendedCustomer(customer) ? (
                          <Badge
                            variant="outline"
                            className="rounded-md border-amber-400/50 bg-amber-500/15 text-[10px] font-bold text-amber-100"
                          >
                            Suspended
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-(--brand-text-muted)">
                        {customerPersonName(customer)}
                        {customer.businessName?.trim() && customer.name?.trim()
                          ? ` · ${customer.email}`
                          : ` · ${customer.email}`}
                      </p>
                      {(customer.gstNumber || customer.state) && (
                        <p className="mt-1 truncate text-xs text-(--brand-text-muted)">
                          {[
                            customer.gstNumber
                              ? `GST ${customer.gstNumber}`
                              : null,
                            customer.state,
                            customer.pincode,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-(--brand-text-muted)" />
                  </Link>
                </li>
              ))}
            </ul>
            {approvedHasMore ? (
              <InfiniteScrollSentinel
                active
                loadingMore={loadingApproved && approvedPage > 1}
                setSentinelNode={setApprovedSentinel}
              />
            ) : null}
          </div>
        )
      ) : null}
    </AdminPage>
  );
}

export default function ClientsPage() {
  return (
    <Suspense
      fallback={
        <AdminPage title="Clients" subtitle="…">
          <ListSkeleton />
        </AdminPage>
      }
    >
      <ClientsPageContent />
    </Suspense>
  );
}
