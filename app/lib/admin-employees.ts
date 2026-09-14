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
