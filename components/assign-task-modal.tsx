"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminTask,
  toDatetimeLocalValue,
} from "@/app/lib/admin-tasks";
import { AdminModal } from "@/components/admin-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AssignTaskModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onCreated: (task: AdminTask) => void;
};

export function AssignTaskModal({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onCreated,
}: AssignTaskModalProps) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState(() => toDatetimeLocalValue());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function resetForm() {
    setTitle("");
    setDetails("");
    setDueDate(toDatetimeLocalValue());
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

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (trimmedTitle.length > 180) {
      setError("Title must be 180 characters or less.");
      return;
    }
    if (!dueDate.trim()) {
      setError("Due date is required.");
      return;
    }
    const parsedDue = new Date(dueDate);
    if (Number.isNaN(parsedDue.getTime())) {
      setError("Enter a valid due date.");
      return;
    }
    if (details.trim().length > 2000) {
      setError("Details must be 2000 characters or less.");
      return;
    }

    setSubmitting(true);
    try {
      const task = await adminFetch<AdminTask>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          assignedToId: employeeId,
          title: trimmedTitle,
          details: details.trim() || null,
          dueDate: parsedDue.toISOString(),
        }),
      });
      onCreated(task);
      handleOpenChange(false);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to assign task."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Assign task"
      description={`Assign a task to ${employeeName}. They will get a notification.`}
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
              Title
            </span>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              maxLength={180}
              className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Due date
            </span>
            <Input
              type="datetime-local"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-11 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text)"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Details{" "}
              <span className="font-medium normal-case tracking-normal">
                (optional)
              </span>
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Add context or instructions…"
              rows={5}
              maxLength={2000}
              className="w-full resize-y rounded-md border border-(--brand-input-border) bg-(--brand-input-bg) px-3 py-2.5 text-sm text-(--brand-text) outline-none placeholder:text-(--brand-placeholder) focus-visible:border-(--brand-primary) focus-visible:ring-2 focus-visible:ring-(--brand-primary)/30"
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
                  Assign task
                </>
              )}
            </Button>
          </div>
        </form>
    </AdminModal>
  );
}
