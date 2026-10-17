"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { readListCache, writeListCache } from "@/app/lib/admin-cache";
import {
  type ProcurementExpense,
  formatExpenseDate,
  formatExpenseMoney,
  matchesExpenseSearch,
  parseStockDescription,
  staffLabel,
} from "@/app/lib/admin-expenses";
import { useProgressiveList } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

type ExpenseRequestRow = {
  id: string;
  category: string;
  amount: number | string;
  status: string;
  billAvailable: boolean;
  noBillReason: string | null;
  employee: { name: string | null; email: string };
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ProcurementExpense[]>(
    () => readListCache<ProcurementExpense[]>("expenses") ?? []
  );
  const [pendingRequests, setPendingRequests] = useState<ExpenseRequestRow[]>(
    []
  );
  const [pendingHasMore, setPendingHasMore] = useState(false);
  const [loading, setLoading] = useState(expenses.length === 0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadExpenses() {
      const cached = readListCache<ProcurementExpense[]>("expenses");
      if (cached) {
        setExpenses(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const [data, pending] = await Promise.all([
          adminFetch<ProcurementExpense[]>("/api/expenses/procurement"),
          adminFetch<
            | { items?: ExpenseRequestRow[]; hasMore?: boolean }
            | ExpenseRequestRow[]
          >(
            "/api/finance/expenses?status=PENDING&page=1&limit=100"
          ).catch(() => [] as ExpenseRequestRow[]),
        ]);
        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          writeListCache("expenses", list);
          setExpenses(list);
          const pendingItems = Array.isArray(pending)
            ? pending
            : Array.isArray((pending as { items?: ExpenseRequestRow[] }).items)
              ? (pending as { items: ExpenseRequestRow[] }).items
              : [];
          setPendingRequests(pendingItems);
          setPendingHasMore(
            !Array.isArray(pending) && Boolean(pending.hasMore)
          );
        }
      } catch (err) {
        if (!cancelled && !cached) {
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load expenses."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadExpenses();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reviewRequest(id: string, action: "approve" | "reject") {
    try {
      await adminFetch("/api/finance/expenses", {
        method: "POST",
        body: JSON.stringify({ action, id }),
      });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Action failed.");
    }
  }
  const filtered = useMemo(
    () => expenses.filter((expense) => matchesExpenseSearch(expense, query)),
    [expenses, query]
  );

  const { visibleItems, hasMore, sentinelIndex, setSentinelNode } =
    useProgressiveList(filtered);

  const totalAmount = useMemo(
    () =>
      filtered.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [filtered]
  );

  return (
    <AdminPage
      title="Expenses"
      subtitle="Employee procurement & stock intake (pending approvals: up to 100 newest)"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Expenses
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {loading
              ? "…"
              : `${filtered.length} stock purchase${filtered.length === 1 ? "" : "s"} · Total ${formatExpenseMoney(totalAmount)}`}
          </p>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product, employee, reference…"
          className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
        />
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {pendingRequests.length > 0 ? (
        <div className="mb-5 space-y-2 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
          <p className="text-sm font-semibold text-(--brand-text)">
            Pending expense approvals
          </p>
          <p className="text-xs text-(--brand-text-muted)">
            Showing up to 100 pending requests (newest first)
            {pendingHasMore ? "; more exist beyond this page." : "."}
          </p>
          {pendingRequests.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 border-t border-(--brand-card-border) py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {r.employee.name || r.employee.email} · {r.category} · ₹
                  {Number(r.amount).toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-(--brand-text-muted)">
                  {r.billAvailable
                    ? "With bill"
                    : `No bill — ${r.noBillReason || "—"}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void reviewRequest(r.id, "approve")}>
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void reviewRequest(r.id, "reject")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton compact columns={8} rows={8} />
      ) : (
      <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
        <Table>
          <TableHeader>
            <TableRow className="border-(--brand-card-border) hover:bg-transparent">
              <TableHead className="text-(--brand-label)">Reference</TableHead>
              <TableHead className="text-(--brand-label)">Employee</TableHead>
              <TableHead className="text-(--brand-label)">Product</TableHead>
              <TableHead className="text-(--brand-label)">Qty added</TableHead>
              <TableHead className="text-(--brand-label)">Cost / unit</TableHead>
              <TableHead className="text-(--brand-label)">Sell price</TableHead>
              <TableHead className="text-(--brand-label)">Amount paid</TableHead>
              <TableHead className="text-(--brand-label)">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-28 text-center text-(--brand-text-muted)"
                >
                  {query.trim()
                    ? "No expenses match your search."
                    : "No procurement / stock intake expenses yet."}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {visibleItems.map((expense, index) => {
                  const parsed = parseStockDescription(expense.description);
                  return (
                    <TableRow
                      key={expense.id}
                      className="border-(--brand-card-border)"
                    >
                      <TableCell className="align-top">
                        <div className="font-semibold text-(--brand-text)">
                          {expense.reference}
                        </div>
                        <Badge
                          variant="outline"
                          className="mt-1 rounded-lg border-(--brand-card-border) text-[10px] font-bold text-(--brand-text-muted)"
                        >
                          Procurement
                        </Badge>
                        {index === sentinelIndex && hasMore ? (
                          <InfiniteScrollSentinel
                            active
                            setSentinelNode={setSentinelNode}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-(--brand-text)">
                          {staffLabel(expense.user)}
                        </div>
                        <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                          {expense.user?.email}
                        </div>
                        {expense.user?.role ? (
                          <div className="mt-0.5 text-xs capitalize text-(--brand-text-muted)">
                            {expense.user.role.toLowerCase()}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top max-w-[18rem]">
                        <div className="font-semibold text-(--brand-text)">
                          {parsed.product}
                        </div>
                        {parsed.notes ? (
                          <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                            {parsed.notes}
                          </div>
                        ) : null}
                        {parsed.newQty != null ? (
                          <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                            Stock after intake: {parsed.newQty}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top text-(--brand-text)">
                        {parsed.quantity != null ? parsed.quantity : "—"}
                      </TableCell>
                      <TableCell className="align-top text-(--brand-text)">
                        {formatExpenseMoney(parsed.costPrice)}
                      </TableCell>
                      <TableCell className="align-top text-(--brand-text)">
                        {formatExpenseMoney(parsed.sellingPrice)}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-(--brand-text)">
                          {formatExpenseMoney(expense.amount)}
                        </div>
                        <div
                          className={cn(
                            "mt-0.5 text-xs",
                            expense.status === "COMPLETED"
                              ? "text-(--brand-success)"
                              : "text-(--brand-text-muted)"
                          )}
                        >
                          {expense.status}
                        </div>
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap text-sm text-(--brand-text-muted)">
                        {formatExpenseDate(expense.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {hasMore && visibleItems.length <= sentinelIndex ? (
                  <InfiniteScrollSentinel
                    active
                    asTableRow
                    colSpan={8}
                    setSentinelNode={setSentinelNode}
                  />
                ) : null}
              </>
            )}
          </TableBody>
        </Table>
      </div>
      )}
    </AdminPage>
  );
}
