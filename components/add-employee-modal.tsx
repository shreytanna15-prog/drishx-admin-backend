"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import type { AdminEmployee } from "@/app/lib/admin-employees";
import { AdminModal } from "@/components/admin-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";

type AddEmployeeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (employee: AdminEmployee) => void;
};

const MIN_PASSWORD_LENGTH = 6;

export function AddEmployeeModal({
  open,
  onOpenChange,
  onCreated,
}: AddEmployeeModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [staffRoleId, setStaffRoleId] = useState("");
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    void adminFetch<{ roles: { id: string; name: string }[] }>(
      "/api/admin/staff-roles"
    )
      .then((data) => setRoles(Array.isArray(data.roles) ? data.roles : []))
      .catch(() => setRoles([]));
  }, [open]);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setStaffRoleId("");
    setError("");
    setSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetForm();
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Email and password are required.");
      return;
    }
    if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (trimmedPassword !== confirmPassword.trim()) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await adminFetch<{ user: AdminEmployee }>(
        "/api/auth/employees",
        {
          method: "POST",
          body: JSON.stringify({
            email: trimmedEmail,
            password: trimmedPassword,
            name: trimmedName || null,
            staffRoleId: staffRoleId || null,
          }),
        }
      );
      onCreated(data.user);
      handleOpenChange(false);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to create employee."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Add employee"
      description="Create a staff account. They can sign in with this email and password."
      size="md"
    >
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-col gap-4"
        >
          {error ? (
            <div className="auth-alert-error" role="alert">
              {error}
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Full name
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Employee name"
              autoComplete="name"
              className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Email
            </span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@example.com"
              autoComplete="email"
              className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Password
            </span>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Confirm password
            </span>
            <Input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Role
            </span>
            <AdminSelect
              value={staffRoleId}
              onValueChange={setStaffRoleId}
              options={[
                { value: "", label: "Full operations (default)" },
                ...roles.map((role) => ({ value: role.id, label: role.name })),
              ]}
              placeholder="Full operations (default)"
              triggerClassName="h-11 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg)"
            />
          </label>

          <div className="mt-2 flex gap-2 border-t border-(--brand-card-border) pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
              className="h-11 flex-1 rounded-xl border-(--brand-input-border)"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="h-11 flex-1 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text) hover:opacity-95"
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  Create employee
                </>
              )}
            </Button>
          </div>
        </form>
    </AdminModal>
  );
}
