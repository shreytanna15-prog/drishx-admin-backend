import { adminFetch } from "@/app/lib/admin-api";

export type StaffRoleSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
};

export type StaffRoleMember = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
};

export type StaffRoleDetail = StaffRoleSummary & {
  members: StaffRoleMember[];
};

export async function listStaffRoles(): Promise<StaffRoleSummary[]> {
  const data = await adminFetch<{ roles: StaffRoleSummary[] }>(
    "/api/admin/staff-roles"
  );
  return Array.isArray(data.roles) ? data.roles : [];
}

export async function listStaffRoleOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  const roles = await listStaffRoles();
  return roles.map((r) => ({ id: r.id, name: r.name }));
}

export async function getStaffRole(id: string): Promise<StaffRoleDetail> {
  const data = await adminFetch<{ role: StaffRoleDetail }>(
    `/api/admin/staff-roles/${id}`
  );
  return data.role;
}

export type CreateStaffRolePayload = {
  name: string;
  description: string | null;
  permissions: string[];
};

export async function createStaffRole(
  payload: CreateStaffRolePayload
): Promise<{ id?: string }> {
  const data = await adminFetch<{ role?: { id?: string } }>(
    "/api/admin/staff-roles",
    { method: "POST", body: JSON.stringify(payload) }
  );
  return { id: data.role?.id };
}

export async function updateStaffRole(
  id: string,
  payload: { name: string; description: string | null; permissions: string[] }
): Promise<void> {
  await adminFetch(`/api/admin/staff-roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteStaffRole(id: string): Promise<void> {
  await adminFetch(`/api/admin/staff-roles/${id}`, { method: "DELETE" });
}
