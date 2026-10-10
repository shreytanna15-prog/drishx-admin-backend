import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { createAdminLens } from "../../../lib/admin-create-lens";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return { error: auth.error };
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session };
}

// GET /api/lenses/kryptok - List all Kryptok lenses
export async function GET() {
  try {
    const lenses = await prisma.kryptokLens.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(lenses);
  } catch (error) {
    console.error("Error fetching Kryptok lenses:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/lenses/kryptok - Create a new Kryptok lens
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const lens = await createAdminLens("kryptok", body);
    return NextResponse.json(lens, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const isValidation = message.includes("required") || message.includes("must");
    return NextResponse.json(
      { error: isValidation ? message : "Internal Server Error" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
