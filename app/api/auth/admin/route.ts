import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { hashPassword } from "../../../lib/auth";
import { issueAuthTokens } from "../../../lib/auth-session";
import { toSafeUser } from "../../../lib/user-public";

const ADMIN_CREATION_SECRET = process.env.ADMIN_CREATION_SECRET;

export async function POST(req: NextRequest) {
  if (!ADMIN_CREATION_SECRET) {
    return NextResponse.json({ error: "Admin creation is not configured." }, { status: 503 });
  }

  const authHeader = req.headers.get("x-admin-secret") ?? "";
  if (authHeader !== ADMIN_CREATION_SECRET) {
    return NextResponse.json({ error: "Invalid admin creation secret." }, { status: 401 });
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();
  const name = body.name ? String(body.name).trim() : null;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: "ADMIN",
      isActive: true,
      isApproved: true,
      approvalStatus: "APPROVED",
    },
  });

  const tokenResponse = await issueAuthTokens(req, user);
  return new NextResponse(tokenResponse.body, {
    status: 201,
    headers: tokenResponse.headers,
  });
}
