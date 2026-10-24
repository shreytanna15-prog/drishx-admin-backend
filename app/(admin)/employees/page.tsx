"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { AddEmployeeModal } from "@/components/add-employee-modal";
import { AdminPage } from "@/components/admin-shell";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
import { ListSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import { readListCache, writeListCache } from "@/app/lib/admin-cache";
import {
  type AdminEmployee,
  employeeDisplayName,
  matchesEmployeeSearch,
} from "@/app/lib/admin-employees";
import { useProgressiveList } from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

function normalizeEmployee(user: AdminEmployee): AdminEmployee {
  return {
    ...user,
    createdAt:
      typeof user.createdAt === "string"
        ? user.createdAt
        : new Date(user.createdAt).toISOString(),
    updatedAt:
      typeof user.updatedAt === "string"
        ? user.updatedAt
        : new Date(user.updatedAt).toISOString(),
    approvedAt:
      user.approvedAt == null
        ? null
        : typeof user.approvedAt === "string"
          ? user.approvedAt
          : new Date(user.approvedAt).toISOString(),
  };
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<AdminEmployee[]>(
    () => readListCache<AdminEmployee[]>("employees") ?? []
  );
  const [loading, setLoading] = useState(employees.length === 0);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const loadEmployees = useCallback(async (opts?: { silent?: boolean }) => {
    const cached = readListCache<AdminEmployee[]>("employees");
    if (cached && !opts?.silent) {
      setEmployees(cached);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    setError("");
    try {
      const data = await adminFetch<{ employees: AdminEmployee[] }>(
        "/api/users/employees"
      );
      const list = Array.isArray(data.employees) ? data.employees : [];
      writeListCache("employees", list);
      setEmployees(list);
    } catch (err) {
      if (!cached) {
        setError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load employees."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const filtered = useMemo(
    () => employees.filter((employee) => matchesEmployeeSearch(employee, query)),
    [employees, query]
  );

  const { visibleItems, hasMore, sentinelIndex, setSentinelNode } =
    useProgressiveList(filtered);

  function handleCreated(user: AdminEmployee) {
    const employee = normalizeEmployee(user);
    setEmployees((current) => {
      const next = [employee, ...current.filter((item) => item.id !== employee.id)];
      writeListCache("employees", next);
      return next;
    });
    setSuccessMessage(
      `${employeeDisplayName(employee)} was created and can sign in now.`
    );
    void loadEmployees({ silent: true });
  }

  return (
    <AdminPage title="Employees" subtitle="Staff accounts">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Employees
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            {loading
              ? "…"
              : `${filtered.length} employee${filtered.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="h-10 max-w-md border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
          />
          <Button
            type="button"
            onClick={() => {
              setSuccessMessage("");
              setAddOpen(true);
            }}
            className="h-10 shrink-0 rounded-xl bg-(--brand-primary) px-4 font-extrabold text-(--brand-primary-text) hover:opacity-95"
          >
            <Plus className="size-4" />
            Add employee
          </Button>
        </div>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div
          className="mb-4 rounded-xl border border-(--brand-success-border) bg-(--brand-success-bg) px-4 py-3 text-sm font-medium text-(--brand-success)"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      {loading ? (
        <ListSkeleton compact rows={8} />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          {query.trim() ? (
            "No employees match your search."
          ) : (
            <div className="space-y-3">
              <p>No employees found yet.</p>
              <Button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text) hover:opacity-95"
              >
                <Plus className="size-4" />
                Add employee
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
          <ul className="divide-y divide-(--brand-card-border)">
            {visibleItems.map((employee, index) => (
              <li key={employee.id} className="relative">
                <Link
                  href={`/employees/${employee.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-[rgba(240,161,50,0.06)] sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-extrabold text-(--brand-text)">
                        {employeeDisplayName(employee)}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-lg text-[10px] font-bold",
                          employee.isActive
                            ? "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)"
                            : "border-(--brand-danger-border) bg-(--brand-danger-bg) text-(--brand-danger)"
                        )}
                      >
                        {employee.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-(--brand-text-muted)">
                      {employee.email}
                      {employee.staffRole?.name
                        ? ` · ${employee.staffRole.name}`
                        : " · Full operations"}
                    </p>
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

      <AddEmployeeModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={handleCreated}
      />
    </AdminPage>
  );
}
