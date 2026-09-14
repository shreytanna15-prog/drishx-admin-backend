import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { getSession } from "../../../../../lib/session-auth";
import { toSafeUser } from "../../../../../lib/user-public";

function requireAdmin(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }
  if (session.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  return { session };
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const employee = await prisma.user.findFirst({
      where: { id, role: "EMPLOYEE" },
    });
    if (!employee) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    const body = await req.json();
    const staffRoleIdRaw = body?.staffRoleId;
    const staffRoleId =
      staffRoleIdRaw === null || staffRoleIdRaw === ""
        ? null
        : typeof staffRoleIdRaw === "string"
          ? staffRoleIdRaw.trim()
          : null;

    if (staffRoleId) {
      const role = await prisma.staffRole.findUnique({
        where: { id: staffRoleId },
      });
      if (!role) {
        return NextResponse.json({ error: "Role not found." }, { status: 404 });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { staffRoleId },
      include: { staffRole: true },
    });

    return NextResponse.json({ employee: toSafeUser(updated) });
  } catch (error) {
    console.error("PATCH /api/users/employees/[id]/staff-role error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
