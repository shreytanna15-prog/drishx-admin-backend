import { adminFetch } from "@/app/lib/admin-api";

export type AdminTaskStatus = "PENDING" | "COMPLETED";

export type AdminTaskPerson = {
  id: string;
  name: string | null;
  email: string;
  role?: string;
};

export type AdminTask = {
  id: string;
  title: string;
  details?: string | null;
  dueDate: string;
  status: AdminTaskStatus;
  completedAt?: string | null;
  assignedToId: string;
  assignedById: string;
  createdAt: string;
  updatedAt?: string;
  assignedTo?: AdminTaskPerson;
  assignedBy?: AdminTaskPerson;
};

export function formatTaskDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTaskDueDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTaskStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function taskStatusBadgeClass(status: string) {
  switch (status) {
    case "COMPLETED":
      return "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)";
    case "PENDING":
    default:
      return "border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] text-(--brand-primary)";
  }
}

/** Value for `<input type="datetime-local" />` from an ISO date. */
export function toDatetimeLocalValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function listAdminTasks(employeeId?: string): Promise<AdminTask[]> {
  const qs = employeeId
    ? `?employeeId=${encodeURIComponent(employeeId)}`
    : "";
  const data = await adminFetch<AdminTask[]>(`/api/tasks${qs}`);
  return Array.isArray(data) ? data : [];
}

export type CreateAdminTaskPayload = {
  assignedToId: string;
  title: string;
  details: string | null;
  dueDate: string;
};

export async function createAdminTask(
  payload: CreateAdminTaskPayload
): Promise<AdminTask> {
  return adminFetch<AdminTask>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
