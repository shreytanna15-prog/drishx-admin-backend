"use client";

import { useState, type FormEvent } from "react";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminTask,
  toDatetimeLocalValue,
} from "@/app/lib/admin-tasks";
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

type AssignTaskSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  onCreated: (task: AdminTask) => void;
};

export function AssignTaskSheet({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onCreated,
}: AssignTaskSheetProps) {
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-(--brand-card-border) bg-(--brand-card) sm:max-w-md"
      >
        <SheetHeader className="border-b border-(--brand-card-border)">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-(--brand-primary)/14 text-(--brand-primary)">
              <ClipboardList className="size-4" />
            </span>
            <div>
              <SheetTitle className="text-lg font-extrabold text-(--brand-text)">
                Assign task
              </SheetTitle>
              <SheetDescription className="text-(--brand-text-muted)">
                Assign a task to {employeeName}. They will get a notification.
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
                  Assign task
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
