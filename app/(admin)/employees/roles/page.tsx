"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, Loader2, Plus, Shield } from "lucide-react";
import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import { STAFF_PERMISSION_GROUPS } from "@/app/lib/staff-permissions";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type StaffRoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
};

export default function StaffRolesPage() {
  const [roles, setRoles] = useState<StaffRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function loadRoles() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<{ roles: StaffRoleRow[] }>(
        "/api/admin/staff-roles"
      );
      setRoles(Array.isArray(data.roles) ? data.roles : []);
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

  function toggleKey(key: string) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await adminFetch("/api/admin/staff-roles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          permissions: selected,
        }),
      });
      setAddOpen(false);
      setName("");
      setDescription("");
      setSelected([]);
      await loadRoles();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to create role."
      );
    } finally {
      setSubmitting(false);
    }
  }

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
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="h-10 shrink-0 rounded-xl bg-(--brand-primary) px-4 font-extrabold text-(--brand-primary-text) hover:opacity-95"
        >
          <Plus className="size-4" />
          New role
        </Button>
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

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent
          side="right"
          className="w-full border-(--brand-card-border) bg-(--brand-card) sm:max-w-lg"
        >
          <SheetHeader className="border-b border-(--brand-card-border)">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-(--brand-primary)/14 text-(--brand-primary)">
                <Shield className="size-4" />
              </span>
              <div>
                <SheetTitle className="text-lg font-extrabold text-(--brand-text)">
                  New role
                </SheetTitle>
                <SheetDescription className="text-(--brand-text-muted)">
                  Pick modules this job role can use in the operations portal.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
          >
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Name
              </span>
              <Input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Description
              </span>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
              />
            </label>
            {STAFF_PERMISSION_GROUPS.map((group) => (
              <section key={group.id}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-(--brand-primary)">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <label key={item.key} className="admin-perm-row">
                    <span>
                      <span className="block text-sm font-semibold text-(--brand-text)">
                        {item.label}
                      </span>
                      <span className="block text-xs text-(--brand-text-muted)">
                        {item.description}
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      className="admin-perm-toggle"
                      checked={selected.includes(item.key)}
                      onChange={() => toggleKey(item.key)}
                    />
                  </label>
                ))}
              </section>
            ))}
            <SheetFooter className="mt-auto gap-2 border-t border-(--brand-card-border) px-0 pt-4 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                className="h-11 flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 flex-1 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text)"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : "Create role"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </AdminPage>
  );
}
