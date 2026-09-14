import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { hashPassword, verifyToken } from "../../../lib/auth";
import { toSafeUser } from "../../../lib/user-public";
import { getFullOperationsRole } from "../../../lib/ensure-staff-roles";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = token ? verifyToken(token) : null;

  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();
  const name = body.name ? String(body.name).trim() : null;
  const staffRoleId =
    typeof body.staffRoleId === "string" && body.staffRoleId.trim()
      ? body.staffRoleId.trim()
      : null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);
  const fullOps = await getFullOperationsRole();
  let resolvedRoleId = staffRoleId ?? fullOps?.id ?? null;
  if (staffRoleId) {
    const role = await prisma.staffRole.findUnique({ where: { id: staffRoleId } });
    if (!role) {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }
    resolvedRoleId = role.id;
  }
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: "EMPLOYEE",
      isActive: true,
      isApproved: true,
      approvalStatus: "APPROVED",
      staffRoleId: resolvedRoleId,
    },
    include: { staffRole: true },
  });

  return NextResponse.json({ user: toSafeUser(user) }, { status: 201 });
}
