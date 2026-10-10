import { NextRequest, NextResponse } from "next/server";
import { prisma, withDbRetry } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { ensureSystemStaffRoles } from "../../../lib/ensure-staff-roles";
import { serializeStaffRole } from "../../../lib/staff-access";
import {
  parsePermissionList,
  slugifyRoleName,
} from "../../../lib/staff-permissions";

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

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const roles = await withDbRetry(async () => {
      await ensureSystemStaffRoles();
      return prisma.staffRole.findMany({
        include: { _count: { select: { users: true } } },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      });
    });

    return NextResponse.json({
      roles: roles.map((role) =>
        serializeStaffRole(role, role._count.users)
      ),
    });
  } catch (error) {
    console.error("GET /api/admin/staff-roles error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const description = body.description
      ? String(body.description).trim()
      : null;
    const permissions = parsePermissionList(body.permissions);

    if (!name) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }

    let slug = slugifyRoleName(name);
    const existing = await prisma.staffRole.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const role = await prisma.staffRole.create({
      data: {
        name,
        slug,
        description: description || null,
        isSystem: false,
        permissions,
        updatedAt: new Date(),
      },
      include: { _count: { select: { users: true } } },
    });

    return NextResponse.json(
      { role: serializeStaffRole(role, role._count.users) },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/admin/staff-roles error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
