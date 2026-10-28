import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  createLensAttribute,
  isLensAttributeType,
  LensAttributeServiceError,
  listLensAttributes,
} from "../../../../../lib/catalog/lens-attribute-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ type: string }> };

// GET /api/admin/catalog/attributes/:type?activeOnly=true
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { type } = await ctx.params;
    if (!isLensAttributeType(type)) {
      return NextResponse.json({ error: "Invalid attribute type." }, { status: 400 });
    }
    const activeOnly =
      new URL(req.url).searchParams.get("activeOnly") === "true";
    const items = await listLensAttributes(type, activeOnly);
    return NextResponse.json({ type, items });
  } catch (error) {
    console.error("GET /api/admin/catalog/attributes/:type", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog/attributes/:type
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { type } = await ctx.params;
    if (!isLensAttributeType(type)) {
      return NextResponse.json({ error: "Invalid attribute type." }, { status: 400 });
    }
    const body = await req.json();
    const item = await createLensAttribute(type, {
      code: String(body.code ?? ""),
      name: String(body.name ?? ""),
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      isActive: body.isActive,
      value: body.value != null ? Number(body.value) : null,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof LensAttributeServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/catalog/attributes/:type", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
