import { NextResponse } from "next/server";
import type { SessionPayload } from "./auth";
import { forbiddenResponse, unauthorizedResponse } from "./auth-errors";
import { prisma } from "./prisma";
import {
  ALL_STAFF_PERMISSIONS,
  hasPermission,
  parsePermissionList,
  type StaffPermission,
} from "./staff-permissions";

export type SerializedStaffRole = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: StaffPermission[];
  memberCount?: number;
};

export function serializeStaffRole(
  role: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: unknown;
  },
  memberCount?: number
): SerializedStaffRole {
  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: parsePermissionList(role.permissions),
    ...(memberCount != null ? { memberCount } : {}),
  };
}

export async function getStaffPermissionsForUser(userId: string): Promise<{
  role: "ADMIN" | "EMPLOYEE" | "CUSTOMER" | string;
  permissions: StaffPermission[];
  staffRole: SerializedStaffRole | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { staffRole: true },
  });

  if (!user) {
    return { role: "CUSTOMER", permissions: [], staffRole: null };
  }

  if (user.role === "ADMIN") {
    return {
      role: user.role,
      permissions: ALL_STAFF_PERMISSIONS,
      staffRole: null,
    };
  }

  if (user.role !== "EMPLOYEE") {
    return { role: user.role, permissions: [], staffRole: null };
  }

  const staffRole = user.staffRole
    ? serializeStaffRole(user.staffRole)
    : null;
  const permissions = staffRole
    ? staffRole.permissions
    : ALL_STAFF_PERMISSIONS;

  return { role: user.role, permissions, staffRole };
}

export async function requireStaffPermission(
  session: SessionPayload | null,
  permission: StaffPermission | StaffPermission[]
): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  if (!session) {
    return {
      error: unauthorizedResponse("TOKEN_MISSING"),
    };
  }
  if (session.role === "ADMIN") {
    return { session };
  }
  if (session.role !== "EMPLOYEE") {
    return {
      error: forbiddenResponse("FORBIDDEN"),
    };
  }

  const { permissions } = await getStaffPermissionsForUser(session.userId);
  const needed = Array.isArray(permission) ? permission : [permission];
  const allowed = needed.some((key) => hasPermission(permissions, key));
  if (!allowed) {
    return {
      error: forbiddenResponse("MISSING_PERMISSION", "Missing permission."),
    };
  }
  return { session };
}
