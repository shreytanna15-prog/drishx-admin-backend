import { adminFetch } from "@/app/lib/admin-api";

export type AdminStaffRole = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
};

export type AdminEmployee = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  isApproved: boolean;
  approvalStatus: string;
  gstNumber: string | null;
  businessName: string | null;
  businessAddress: string | null;
  state: string | null;
  pincode: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  staffRole?: AdminStaffRole | null;
  permissions?: string[];
};

export function employeeDisplayName(employee: AdminEmployee) {
  return employee.name?.trim() || employee.email;
}

export function formatEmployeeDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatEmployeeStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function matchesEmployeeSearch(employee: AdminEmployee, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return [employee.name, employee.email]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

export async function listAdminEmployees(): Promise<AdminEmployee[]> {
  const data = await adminFetch<{ employees: AdminEmployee[] }>(
    "/api/users/employees"
  );
  return Array.isArray(data.employees) ? data.employees : [];
}

export async function getAdminEmployee(
  id: string
): Promise<AdminEmployee | null> {
  const data = await adminFetch<{ employee: AdminEmployee }>(
    `/api/users/employees/${id}`
  );
  return data.employee ?? null;
}

export type CreateAdminEmployeePayload = {
  email: string;
  password: string;
  name: string | null;
  staffRoleId: string | null;
};

export async function createAdminEmployee(
  payload: CreateAdminEmployeePayload
): Promise<AdminEmployee> {
  const data = await adminFetch<{ user: AdminEmployee }>("/api/auth/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.user;
}

export async function patchEmployeeStaffRole(
  employeeId: string,
  staffRoleId: string | null
): Promise<AdminEmployee> {
  const data = await adminFetch<{ employee: AdminEmployee }>(
    `/api/users/employees/${employeeId}/staff-role`,
    {
      method: "PATCH",
      body: JSON.stringify({ staffRoleId }),
    }
  );
  return data.employee;
}
