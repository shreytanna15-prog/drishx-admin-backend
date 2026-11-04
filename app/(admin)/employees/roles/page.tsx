"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { AdminApiError } from "@/app/lib/admin-api";
import { listStaffRoles, type StaffRoleSummary } from "@/app/lib/admin-staff-roles";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function StaffRolesPage() {
  const [roles, setRoles] = useState<StaffRoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function loadRoles() {
    setLoading(true);
    setError("");
    try {
      setRoles(await listStaffRoles());
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load roles."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
  }, []);

  const adminCountLabel = "All admins";

  return (
    <AdminPage title="Roles & Permissions" subtitle="Staff access">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Roles & Permissions
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            Who can do what in operations. Admin is a locked account type.
          </p>
        </div>
        <Link
          href="/employees/roles/new"
          className={cn(
            buttonVariants(),
            "h-10 shrink-0 rounded-xl bg-(--brand-primary) px-4 font-extrabold text-(--brand-primary-text) hover:opacity-95"
          )}
        >
          <Plus className="size-4" />
          New role
        </Link>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <ListSkeleton compact rows={6} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
          <ul className="divide-y divide-(--brand-card-border)">
            <li className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold text-(--brand-text)">Admin</p>
                  <Badge
                    variant="outline"
                    className="rounded-lg border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] text-[10px] font-bold text-(--brand-primary)"
                  >
                    Locked
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-(--brand-text-muted)">
                  Full ERP access, including this panel. Not a staff job role.
                </p>
              </div>
              <p className="shrink-0 text-xs font-semibold text-(--brand-text-muted)">
                {adminCountLabel}
              </p>
            </li>
            {roles.map((role) => (
              <li key={role.id}>
                <Link
                  href={`/employees/roles/${role.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition hover:bg-[rgba(240,161,50,0.06)] sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-extrabold text-(--brand-text)">
                        {role.name}
                      </p>
                      {role.isSystem ? (
                        <Badge
                          variant="outline"
                          className="rounded-lg text-[10px] font-bold"
                        >
                          System
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-(--brand-text-muted)">
                      {role.description || "Custom staff role"}
                      {` · ${role.permissions.length} permission${role.permissions.length === 1 ? "" : "s"} · ${role.memberCount ?? 0} member${(role.memberCount ?? 0) === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-(--brand-text-muted)" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminPage>
  );
}
