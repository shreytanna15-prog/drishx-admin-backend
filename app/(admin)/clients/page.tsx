"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, X } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton, TableSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminCustomer,
  type AccountActionValue,
  customerDisplayName,
  customerPersonName,
  formatAccountAction,
  formatCustomerDate,
  isSuspendedCustomer,
  listAdminCustomers,
  matchesCustomerSearch,
} from "@/app/lib/admin-customers";
import { useInfiniteScrollSentinel } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

type ClientsTab = "pending" | "incomplete" | "approved" | "rejected";

const TIER_CODES = ["A", "B", "C", "D", "E", "F"] as const;
const ACCOUNT_ACTIONS: AccountActionValue[] = [
  "NONE",
  "BLOCKED",
  "CREDIT_SUSPENDED",
  "CLOSED",
];

function parseTab(value: string | null): ClientsTab {
  if (value === "approved") return "approved";
  if (value === "incomplete") return "incomplete";
  if (value === "rejected") return "rejected";
  return "pending";
}

function formatCreditLimit(value: string | null | undefined) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
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
  const [accountActionFilter, setAccountActionFilter] = useState("");
  const [tierCodeFilter, setTierCodeFilter] = useState("");
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
          accountAction: accountActionFilter || undefined,
          tierCode: tierCodeFilter || undefined,
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
    [debouncedQ, accountActionFilter, tierCodeFilter]
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
  }, [debouncedQ, accountActionFilter, tierCodeFilter, loadApproved, loadRejected]);

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
          ? (rejectedTotal ?? rejected.length)
          : (approvedTotal ?? customers.length);

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

  function renderPendingTable(
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
      <AdminTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop / business</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link
                    href={`/clients/${customer.id}?from=${options.from}`}
                    className="font-semibold text-(--brand-text) hover:underline"
                  >
                    {customerDisplayName(customer)}
                  </Link>
                  <p className="text-xs text-(--brand-text-muted)">
                    {customerPersonName(customer)}
                    {customer.gstNumber ? ` · GST ${customer.gstNumber}` : " · No GST"}
                  </p>
                </TableCell>
                <TableCell className="text-sm">
                  {customer.mobileNumber?.trim() || "—"}
                </TableCell>
                <TableCell className="max-w-[12rem] truncate text-sm">
                  {customer.email}
                </TableCell>
                <TableCell className="text-sm text-(--brand-text-muted)">
                  {formatCustomerDate(customer.updatedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {options.showApprove ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={actingId === customer.id}
                        onClick={() => void handleApprove(customer)}
                        className="h-8 gap-1 rounded-lg bg-(--brand-primary) px-2 font-bold text-black"
                      >
                        <Check className="size-3.5" />
                        Approve
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={actingId === customer.id}
                      onClick={() => void handleReject(customer)}
                      className="h-8 gap-1 rounded-lg px-2 font-bold"
                    >
                      <X className="size-3.5" />
                      Reject
                    </Button>
                    <Link
                      href={`/clients/${customer.id}?from=${options.from}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-(--brand-card-border)"
                      aria-label="View details"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTable>
    );
  }

  function renderDirectoryTable(
    rows: AdminCustomer[],
    emptyMsg: string,
    options: { from: ClientsTab; showCommercial: boolean }
  ) {
    if (rows.length === 0) {
      return (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          {query.trim() || accountActionFilter || tierCodeFilter
            ? "No customers match your filters."
            : emptyMsg}
        </div>
      );
    }

    return (
      <AdminTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop / business</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Approval</TableHead>
              {options.showCommercial ? (
                <>
                  <TableHead>Account action</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Credit limit</TableHead>
                </>
              ) : null}
              <TableHead>Updated</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell>
                  <Link
                    href={`/clients/${customer.id}?from=${options.from}`}
                    className="font-semibold text-(--brand-text) hover:underline"
                  >
                    {customerDisplayName(customer)}
                  </Link>
                  {customer.rejectionReason ? (
                    <p className="mt-0.5 max-w-[14rem] truncate text-xs text-(--brand-danger)">
                      {customer.rejectionReason}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">
                  {customer.mobileNumber?.trim() || "—"}
                </TableCell>
                <TableCell className="max-w-[12rem] truncate text-sm">
                  {customer.email}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-md text-[10px] font-bold">
                    {options.from === "rejected" ? "Rejected" : "Approved"}
                  </Badge>
                  {isSuspendedCustomer(customer) ? (
                    <Badge
                      variant="outline"
                      className="ml-1 rounded-md border-amber-400/50 bg-amber-500/15 text-[10px] font-bold text-amber-100"
                    >
                      Suspended
                    </Badge>
                  ) : null}
                </TableCell>
                {options.showCommercial ? (
                  <>
                    <TableCell className="text-sm">
                      {customer.accountAction && customer.accountAction !== "NONE"
                        ? formatAccountAction(customer.accountAction)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold">
                      {customer.pricingTierCode?.trim() || "D"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCreditLimit(customer.creditLimit)}
                    </TableCell>
                  </>
                ) : null}
                <TableCell className="text-sm text-(--brand-text-muted)">
                  {formatCustomerDate(customer.updatedAt)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/clients/${customer.id}?from=${options.from}`}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-(--brand-card-border)"
                    aria-label="Open client"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTable>
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, mobile, GSTIN, email…"
              className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
            />
            <Button
              type="button"
              asChild
              className="h-10 shrink-0 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
            >
              <Link href="/clients/new">Add client</Link>
            </Button>
          </div>
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

        {tab === "approved" ? (
          <div className="flex flex-wrap gap-2">
            <AdminSelect
              value={accountActionFilter}
              onValueChange={setAccountActionFilter}
              size="sm"
              aria-label="Filter by account action"
              placeholder="All account actions"
              triggerClassName="w-[12rem]"
              options={[
                { value: "", label: "All account actions" },
                ...ACCOUNT_ACTIONS.map((a) => ({
                  value: a,
                  label: formatAccountAction(a),
                })),
              ]}
            />
            <AdminSelect
              value={tierCodeFilter}
              onValueChange={setTierCodeFilter}
              size="sm"
              aria-label="Filter by pricing tier"
              placeholder="All tiers"
              triggerClassName="w-[10rem]"
              options={[
                { value: "", label: "All tiers" },
                ...TIER_CODES.map((code) => ({
                  value: code,
                  label: `Tier ${code}`,
                })),
              ]}
            />
          </div>
        ) : null}
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
          <TableSkeleton rows={6} />
        ) : (
          renderPendingTable(filteredPending, "No pending approval requests.", {
            showApprove: true,
            from: "pending",
          })
        )
      ) : null}

      {tab === "incomplete" ? (
        loadingIncomplete ? (
          <TableSkeleton rows={6} />
        ) : (
          renderPendingTable(filteredIncomplete, "No incomplete signups.", {
            showApprove: false,
            from: "incomplete",
          })
        )
      ) : null}

      {tab === "rejected" ? (
        loadingRejected && rejected.length === 0 ? (
          <TableSkeleton rows={6} />
        ) : (
          <>
            {renderDirectoryTable(rejected, "No rejected customers.", {
              from: "rejected",
              showCommercial: false,
            })}
            {rejectedHasMore ? (
              <InfiniteScrollSentinel
                active
                loadingMore={loadingRejected && rejectedPage > 1}
                setSentinelNode={setRejectedSentinel}
              />
            ) : null}
          </>
        )
      ) : null}

      {tab === "approved" ? (
        loadingApproved && customers.length === 0 ? (
          <TableSkeleton rows={8} />
        ) : (
          <>
            {renderDirectoryTable(customers, "No approved customers found yet.", {
              from: "approved",
              showCommercial: true,
            })}
            {approvedHasMore ? (
              <InfiniteScrollSentinel
                active
                loadingMore={loadingApproved && approvedPage > 1}
                setSentinelNode={setApprovedSentinel}
              />
            ) : null}
          </>
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
