import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { hashPassword } from "../../../lib/auth";
import { toSafeUser } from "../../../lib/user-public";
import { optionalTrim } from "../../../lib/customer-registration";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();
  const name = optionalTrim(body.name);
  // RW-07: business name is optional
  const businessName = optionalTrim(body.businessName);
  const mobileNumber = optionalTrim(body.mobileNumber);
  const alternateMobileNumber = optionalTrim(body.alternateMobileNumber);
  const whatsappNumber = optionalTrim(body.whatsappNumber);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!mobileNumber) {
    return NextResponse.json({ error: "Mobile number is required." }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
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
      businessName,
      mobileNumber,
      alternateMobileNumber,
      whatsappNumber,
      role: "CUSTOMER",
      isActive: false,
      isApproved: false,
      approvalStatus: "PENDING_REVIEW",
    },
  });

  return NextResponse.json(
    {
      user: toSafeUser(user),
      message:
        "Account created. You can continue with optional business details or skip them for now.",
    },
    { status: 201 }
  );
}
