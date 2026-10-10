import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { serializeStaffRole } from "../../../../lib/staff-access";
import { parsePermissionList } from "../../../../lib/staff-permissions";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return { error: auth.error };
  }
  const session = auth.session;
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

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const role = await prisma.staffRole.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
        users: {
          where: { role: "EMPLOYEE" },
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
          },
          orderBy: [{ name: "asc" }, { email: "asc" }],
        },
      },
    });

    if (!role) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    return NextResponse.json({
      role: {
        ...serializeStaffRole(role, role._count.users),
        members: role.users,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/staff-roles/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.staffRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }

    const body = await req.json();
    const name =
      typeof body.name === "string" ? body.name.trim() : existing.name;
    const description =
      body.description === undefined
        ? existing.description
        : body.description
          ? String(body.description).trim()
          : null;
    const permissions = parsePermissionList(
      body.permissions ?? existing.permissions
    );

    if (!name) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        {
          error:
            "System roles cannot be renamed or have their permissions changed.",
        },
        { status: 400 }
      );
    }

    const role = await prisma.staffRole.update({
      where: { id },
      data: { name, description, permissions },
      include: { _count: { select: { users: true } } },
    });

    return NextResponse.json({
      role: serializeStaffRole(role, role._count.users),
    });
  } catch (error) {
    console.error("PUT /api/admin/staff-roles/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const existing = await prisma.staffRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "System roles cannot be deleted." },
        { status: 400 }
      );
    }
    if (existing._count.users > 0) {
      return NextResponse.json(
        { error: "Reassign employees before deleting this role." },
        { status: 409 }
      );
    }

    await prisma.staffRole.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/staff-roles/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
