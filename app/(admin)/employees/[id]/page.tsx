"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton, ListSkeleton } from "@/components/admin-skeletons";
import { AssignTaskModal } from "@/components/assign-task-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminSelect } from "@/components/admin-select";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  type AdminEmployee,
  employeeDisplayName,
  formatEmployeeDate,
  formatEmployeeStatus,
  getAdminEmployee,
  patchEmployeeStaffRole,
} from "@/app/lib/admin-employees";
import { listStaffRoleOptions } from "@/app/lib/admin-staff-roles";
import {
  type AdminTask,
  formatTaskDueDate,
  formatTaskStatus,
  listAdminTasks,
  taskStatusBadgeClass,
} from "@/app/lib/admin-tasks";
import { cn } from "@/lib/utils";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-(--brand-card-border) py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-(--brand-label)">{label}</dt>
      <dd className="text-sm text-(--brand-text)">{value || "—"}</dd>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [employee, setEmployee] = useState<AdminEmployee | null>(null);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasksError, setTasksError] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [staffRoleId, setStaffRoleId] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadEmployee() {
      setLoading(true);
      setError("");
      try {
        const employeeRow = await getAdminEmployee(id);
        if (!cancelled) {
          setEmployee(employeeRow);
          setStaffRoleId(employeeRow?.staffRole?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setEmployee(null);
          setError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load employee details."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function loadEmployeeTasks() {
      setTasksLoading(true);
      setTasksError("");
      try {
        const taskList = await listAdminTasks(id);
        if (!cancelled) setTasks(taskList);
      } catch (err) {
        if (!cancelled) {
          setTasks([]);
          setTasksError(
            err instanceof AdminApiError
              ? err.message
              : "Failed to load tasks."
          );
        }
      } finally {
        if (!cancelled) setTasksLoading(false);
      }
    }

    void loadEmployee();
    void loadEmployeeTasks();
    void listStaffRoleOptions()
      .then((data) => {
        if (!cancelled) setRoles(data);
      })
      .catch(() => {
        if (!cancelled) setRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleTaskCreated(task: AdminTask) {
    setTasks((prev) => {
      const without = prev.filter((t) => t.id !== task.id);
      return [task, ...without];
    });
    setSuccessMessage(`Task “${task.title}” assigned.`);
  }

  const title = employee ? employeeDisplayName(employee) : "Employee details";
  const pendingCount = tasks.filter((t) => t.status === "PENDING").length;

  return (
    <AdminPage title={title} subtitle="Employee details">
      <div className="mb-5">
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-link) hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to employees
        </Link>
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
        <DetailSkeleton />
      ) : !employee ? (
        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
          Employee not found.
        </div>
      ) : (
        <div className="mx-auto grid max-w-3xl gap-4">
          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
                  {employeeDisplayName(employee)}
                </h1>
                <p className="mt-1 text-sm text-(--brand-text-muted)">
                  {employee.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-lg font-bold",
                    employee.isActive
                      ? "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)"
                      : "border-(--brand-danger-border) bg-(--brand-danger-bg) text-(--brand-danger)"
                  )}
                >
                  {employee.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-lg border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] font-bold text-(--brand-primary)"
                >
                  Employee
                </Badge>
                <Button
                  type="button"
                  disabled={!employee.isActive}
                  title={
                    employee.isActive
                      ? "Assign a task"
                      : "Only active employees can be assigned tasks"
                  }
                  onClick={() => {
                    setSuccessMessage("");
                    setAssignOpen(true);
                  }}
                  className="h-9 rounded-xl bg-(--brand-primary) px-3 font-extrabold text-(--brand-primary-text) hover:opacity-95 disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  Assign task
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Profile
            </h2>
            <dl>
              <DetailRow
                label="Full name"
                value={employee.name?.trim() || "—"}
              />
              <DetailRow label="Email" value={employee.email} />
              <DetailRow label="Account type" value="Employee" />
              <div className="grid gap-1 border-b border-(--brand-card-border) py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-(--brand-label)">
                  Job role
                </dt>
                <dd className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <AdminSelect
                    value={staffRoleId}
                    onValueChange={setStaffRoleId}
                    options={[
                      { value: "", label: "Full operations (default)" },
                      ...roles.map((role) => ({
                        value: role.id,
                        label: role.name,
                      })),
                    ]}
                    placeholder="Full operations (default)"
                    triggerClassName="h-10 flex-1 rounded-xl min-w-0"
                  />
                  <Button
                    type="button"
                    disabled={roleSaving}
                    onClick={async () => {
                      if (!id) return;
                      setRoleSaving(true);
                      setError("");
                      try {
                        const updated = await patchEmployeeStaffRole(
                          id,
                          staffRoleId || null
                        );
                        setEmployee(updated);
                        setStaffRoleId(updated.staffRole?.id ?? "");
                        setSuccessMessage("Job role updated.");
                      } catch (err) {
                        setError(
                          err instanceof AdminApiError
                            ? err.message
                            : "Failed to update role."
                        );
                      } finally {
                        setRoleSaving(false);
                      }
                    }}
                    className="h-10 rounded-xl bg-(--brand-primary) font-extrabold text-(--brand-primary-text)"
                  >
                    Save role
                  </Button>
                </dd>
              </div>
              <DetailRow
                label="Approval status"
                value={formatEmployeeStatus(employee.approvalStatus)}
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
              Account
            </h2>
            <dl>
              <DetailRow
                label="Account status"
                value={employee.isActive ? "Active" : "Inactive"}
              />
              <DetailRow
                label="Joined on"
                value={formatEmployeeDate(employee.createdAt)}
              />
              <DetailRow
                label="Last updated"
                value={formatEmployeeDate(employee.updatedAt)}
              />
            </dl>
          </section>

          <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-(--brand-card-shadow) sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
                Assigned tasks
              </h2>
              {!tasksLoading ? (
                <p className="text-xs text-(--brand-text-muted)">
                  {tasks.length} total
                  {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
                </p>
              ) : null}
            </div>

            {tasksError ? (
              <div className="auth-alert-error mb-3" role="alert">
                {tasksError}
              </div>
            ) : null}

            {tasksLoading ? (
              <ListSkeleton compact rows={3} />
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <ClipboardList className="size-8 text-(--brand-text-muted) opacity-50" />
                <p className="text-sm text-(--brand-text-muted)">
                  No tasks assigned yet.
                </p>
                {employee.isActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSuccessMessage("");
                      setAssignOpen(true);
                    }}
                    className="mt-1 h-9 rounded-xl border-(--brand-input-border)"
                  >
                    <Plus className="size-4" />
                    Assign first task
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-(--brand-card-border)">
                {tasks.map((task) => (
                  <li key={task.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-(--brand-text)">
                          {task.title}
                        </p>
                        {task.details ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-(--brand-text-muted)">
                            {task.details}
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-xs text-(--brand-text-muted)">
                          Due {formatTaskDueDate(task.dueDate)}
                          {task.assignedBy
                            ? ` · By ${
                                task.assignedBy.name?.trim() ||
                                task.assignedBy.email
                              }`
                            : ""}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 rounded-lg font-bold",
                          taskStatusBadgeClass(task.status)
                        )}
                      >
                        {formatTaskStatus(task.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AssignTaskModal
            open={assignOpen}
            onOpenChange={setAssignOpen}
            employeeId={employee.id}
            employeeName={employeeDisplayName(employee)}
            onCreated={handleTaskCreated}
          />
        </div>
      )}
    </AdminPage>
  );
}
