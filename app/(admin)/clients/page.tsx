"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, X } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { readListCache, writeListCache } from "@/app/lib/admin-cache";
import {
  type AdminCustomer,
  customerDisplayName,
  customerPersonName,
  formatCustomerDate,
  matchesCustomerSearch,
} from "@/app/lib/admin-customers";
import { useProgressiveList } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

type ClientsTab = "pending" | "approved";

function parseTab(value: string | null): ClientsTab {
  return value === "approved" ? "approved" : "pending";
}

function ClientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [customers, setCustomers] = useState<AdminCustomer[]>(
    () => readListCache<AdminCustomer[]>("customers") ?? []
  );
  const [pending, setPending] = useState<AdminCustomer[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(customers.length === 0);
  const [loadingPending, setLoadingPending] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  const setTab = useCallback(
    (next: ClientsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`/clients?${params.toString()}`);
    },
    [router, searchParams]
  );

  const loadApproved = useCallback(async () => {
    const cached = readListCache<AdminCustomer[]>("customers");
    if (cached) {
      setCustomers(cached);
      setLoadingApproved(false);
    } else {
      setLoadingApproved(true);
    }

    try {
      const data = await adminFetch<{ customers: AdminCustomer[] }>(
        "/api/users/customers"
      );
      const list = Array.isArray(data.customers) ? data.customers : [];
      writeListCache("customers", list);
      setCustomers(list);
    } catch (err) {
      if (!cached) {
        setError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load customers."
        );
      }
    } finally {
      setLoadingApproved(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const data = await adminFetch<{ users: AdminCustomer[] }>(
        "/api/users/pending"
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      await Promise.all([loadApproved(), loadPending()]);
      if (cancelled) return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadApproved, loadPending]);

  const filteredApproved = useMemo(
    () => customers.filter((customer) => matchesCustomerSearch(customer, query)),
    [customers, query]
  );

  const filteredPending = useMemo(
    () => pending.filter((customer) => matchesCustomerSearch(customer, query)),
    [pending, query]
  );

  const { visibleItems, hasMore, sentinelIndex, setSentinelNode } =
    useProgressiveList(filteredApproved);

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

  const loading = tab === "pending" ? loadingPending : loadingApproved;
  const listCount =
    tab === "pending" ? filteredPending.length : filteredApproved.length;

  return (
    <AdminPage
      title="Clients"
      subtitle={
        tab === "pending"
          ? "Pending registration approvals"
          : "Approved customers"
      }
    >
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
              Clients
            </h1>
            <p className="mt-1 text-sm text-(--brand-text-muted)">
              {loading
                ? "…"
                : `${listCount} ${
                    tab === "pending" ? "pending" : "approved"
                  } customer${listCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, GST, email…"
            className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("pending")}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-bold transition",
              tab === "pending"
                ? "border-(--brand-primary) bg-[rgba(240,161,50,0.14)] text-(--brand-primary)"
                : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:bg-[rgba(240,161,50,0.06)]"
            )}
          >
            Pending approvals
            {pending.length > 0 ? (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-(--brand-primary) px-1.5 text-xs font-extrabold text-black">
                {pending.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setTab("approved")}
            className={cn(
              "rounded-xl border px-4 py-2 text-sm font-bold transition",
              tab === "approved"
                ? "border-(--brand-primary) bg-[rgba(240,161,50,0.14)] text-(--brand-primary)"
                : "border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:bg-[rgba(240,161,50,0.06)]"
            )}
          >
            Approved
          </button>
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
        ) : filteredPending.length === 0 ? (
          <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
            {query.trim()
              ? "No pending requests match your search."
              : "No pending approval requests."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <ul className="divide-y divide-(--brand-card-border)">
              {filteredPending.map((customer) => (
                <li
                  key={customer.id}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <Link
                    href={`/clients/${customer.id}?from=pending`}
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
                          : null,
                        customer.shopName || customer.businessName,
                        customer.mobileNumber,
                        customer.city || customer.state,
                        `Submitted ${formatCustomerDate(customer.updatedAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </Link>

                  <div className="flex shrink-0 items-center gap-2">
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
                      href={`/clients/${customer.id}?from=pending`}
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
        )
      ) : loadingApproved ? (
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
            {visibleItems.map((customer, index) => (
              <li key={customer.id} className="relative">
                <Link
                  href={`/clients/${customer.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-[rgba(240,161,50,0.06)] sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-(--brand-text)">
                      {customerDisplayName(customer)}
                    </p>
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
                {index === sentinelIndex && hasMore ? (
                  <InfiniteScrollSentinel
                    active
                    setSentinelNode={setSentinelNode}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {hasMore && visibleItems.length <= sentinelIndex ? (
            <InfiniteScrollSentinel
              active
              setSentinelNode={setSentinelNode}
            />
          ) : null}
        </div>
      )}
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
