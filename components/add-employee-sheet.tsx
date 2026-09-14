"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import type { AdminEmployee } from "@/app/lib/admin-employees";
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

type AddEmployeeSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (employee: AdminEmployee) => void;
};

const MIN_PASSWORD_LENGTH = 6;

export function AddEmployeeSheet({
  open,
  onOpenChange,
  onCreated,
}: AddEmployeeSheetProps) {
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-(--brand-card-border) bg-(--brand-card) sm:max-w-md"
      >
        <SheetHeader className="border-b border-(--brand-card-border)">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-(--brand-primary)/14 text-(--brand-primary)">
              <UserPlus className="size-4" />
            </span>
            <div>
              <SheetTitle className="text-lg font-extrabold text-(--brand-text)">
                Add employee
              </SheetTitle>
              <SheetDescription className="text-(--brand-text-muted)">
                Create a staff account. They can sign in with this email and
                password.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
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
            <select
              value={staffRoleId}
              onChange={(e) => setStaffRoleId(e.target.value)}
              className="h-11 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text)"
            >
              <option value="">Full operations (default)</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <SheetFooter className="mt-auto gap-2 border-t border-(--brand-card-border) px-0 pt-4 sm:flex-row">
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
