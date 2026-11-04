"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminApiError } from "@/app/lib/admin-api";
import { listAdminEmployees, patchEmployeeStaffRole } from "@/app/lib/admin-employees";
import {
  deleteStaffRole,
  getStaffRole,
  updateStaffRole,
  type StaffRoleDetail,
} from "@/app/lib/admin-staff-roles";
import { STAFF_PERMISSION_GROUPS } from "@/app/lib/staff-permissions";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminSelect } from "@/components/admin-select";
import { Input } from "@/components/ui/input";

type Member = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
};

type EmployeeOption = {
  id: string;
  name: string | null;
  email: string;
  staffRole?: { id: string } | null;
};

export default function StaffRoleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [role, setRole] = useState<StaffRoleDetail | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [assignId, setAssignId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [next, empList] = await Promise.all([
        getStaffRole(id),
        listAdminEmployees(),
      ]);
      setRole(next);
      setName(next.name);
      setDescription(next.description ?? "");
      setPermissions(next.permissions);
      setEmployees(
        empList.map((e) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          staffRole: e.staffRole ? { id: e.staffRole.id } : null,
        }))
      );
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load role."
      );
      setRole(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const unassigned = useMemo(
    () => employees.filter((employee) => employee.staffRole?.id !== id),
    [employees, id]
  );

  function toggleKey(key: string) {
    if (role?.isSystem) return;
    setPermissions((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }

  async function saveRole() {
    if (!id || !role || role.isSystem) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateStaffRole(id, {
        name: name.trim(),
        description: description.trim() || null,
        permissions,
      });
      setMessage("Role saved.");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!id || !role || role.isSystem) return;
    if (!window.confirm("Delete this role?")) return;
    setSaving(true);
    setError("");
    try {
      await deleteStaffRole(id);
      router.replace("/employees/roles");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to delete role."
      );
      setSaving(false);
    }
  }

  async function assignMember() {
    if (!assignId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await patchEmployeeStaffRole(assignId, id);
      setAssignId("");
      setMessage("Employee assigned.");
      await load();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to assign."
      );
    } finally {
      setSaving(false);
    }
  }

  async function unassignMember(employeeId: string) {
    setSaving(true);
    setError("");
    try {
      await patchEmployeeStaffRole(employeeId, null);
      setMessage("Employee unassigned (defaults to Full operations).");
      await load();
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to unassign."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage title={role?.name ?? "Role"} subtitle="Staff access">
      <div className="mb-5">
        <Link
          href="/employees/roles"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to roles
        </Link>
      </div>

      {error ? (
        <div className="auth-alert-error mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div
          className="mb-4 rounded-xl border border-(--brand-success-border) bg-(--brand-success-bg) px-4 py-3 text-sm font-medium text-(--brand-success)"
          role="status"
        >
          {message}
        </div>
      ) : null}

      {loading ? (
        <DetailSkeleton cards={2} />
      ) : !role ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          Role not found.
        </div>
      ) : (
        <div className="mx-auto grid max-w-3xl gap-4">
          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-(--brand-text)">
                {role.name}
              </h1>
              {role.isSystem ? (
                <Badge variant="outline" className="rounded-lg font-bold">
                  System
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                  Name
                </span>
                <Input
                  value={name}
                  disabled={role.isSystem}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                  Description
                </span>
                <Input
                  value={description}
                  disabled={role.isSystem}
                  onChange={(event) => setDescription(event.target.value)}
                  className="h-11 border-(--brand-input-border) bg-(--brand-input-bg)"
                />
              </label>
            </div>
            {role.isSystem ? (
              <p className="mt-3 text-sm text-(--brand-text-muted)">
                System role name and permissions stay locked so existing staff
                keep a known baseline.
              </p>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveRole()}
                  className="rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text)"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void deleteRole()}
                  className="rounded-xl"
                >
                  Delete
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
            <h2 className="text-lg font-extrabold text-(--brand-text)">
              Permissions
            </h2>
            {STAFF_PERMISSION_GROUPS.map((group) => (
              <div key={group.id} className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-(--brand-primary)">
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
                      disabled={role.isSystem}
                      checked={permissions.includes(item.key)}
                      onChange={() => toggleKey(item.key)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow)">
            <h2 className="text-lg font-extrabold text-(--brand-text)">
              Members
            </h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <AdminSelect
                value={assignId}
                onValueChange={setAssignId}
                options={[
                  { value: "", label: "Assign an employee…" },
                  ...unassigned.map((employee) => ({
                    value: employee.id,
                    label: employee.name || employee.email,
                  })),
                ]}
                placeholder="Assign an employee…"
                triggerClassName="h-11 flex-1 rounded-xl min-w-0"
              />
              <Button
                type="button"
                disabled={!assignId || saving}
                onClick={() => void assignMember()}
                className="h-11 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text)"
              >
                Assign
              </Button>
            </div>
            {role.members.length === 0 ? (
              <p className="mt-4 text-sm text-(--brand-text-muted)">
                No employees assigned yet.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-(--brand-card-border)">
                {role.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <Link
                      href={`/employees/${member.id}`}
                      className="min-w-0 font-semibold text-(--brand-text) hover:text-(--brand-primary)"
                    >
                      {member.name || member.email}
                      <span className="block truncate text-xs font-normal text-(--brand-text-muted)">
                        {member.email}
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => void unassignMember(member.id)}
                    >
                      Unassign
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AdminPage>
  );
}
