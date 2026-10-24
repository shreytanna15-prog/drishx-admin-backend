"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminApiError, adminFetch } from "@/app/lib/admin-api";
import { STAFF_PERMISSION_GROUPS } from "@/app/lib/staff-permissions";
import { AdminPage } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewStaffRolePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      const data = await adminFetch<{ role?: { id?: string } }>(
        "/api/admin/staff-roles",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            permissions: selected,
          }),
        }
      );
      const id = data?.role?.id;
      router.push(id ? `/employees/roles/${id}` : "/employees/roles");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to create role."
      );
      setSubmitting(false);
    }
  }

  return (
    <AdminPage title="New role" subtitle="Staff access">
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

      <form
        onSubmit={(event) => void handleCreate(event)}
        className="mx-auto grid max-w-2xl gap-5 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6"
      >
        <p className="text-sm text-(--brand-text-muted)">
          Pick modules this job role can use in the operations portal.
        </p>

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

        <div className="flex gap-2 border-t border-(--brand-card-border) pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => router.push("/employees/roles")}
            className="h-11 flex-1 rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="h-11 flex-1 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text)"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Create role"
            )}
          </Button>
        </div>
      </form>
    </AdminPage>
  );
}
