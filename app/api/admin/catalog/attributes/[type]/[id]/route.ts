import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../../lib/session-auth";
import {
  isLensAttributeType,
  LensAttributeServiceError,
  updateLensAttribute,
} from "../../../../../../lib/catalog/lens-attribute-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ type: string; id: string }> };

// PATCH /api/admin/catalog/attributes/:type/:id
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { type, id } = await ctx.params;
    if (!isLensAttributeType(type)) {
      return NextResponse.json({ error: "Invalid attribute type." }, { status: 400 });
    }
    const body = await req.json();
    const item = await updateLensAttribute(type, id, {
      code: body.code != null ? String(body.code) : undefined,
      name: body.name != null ? String(body.name) : undefined,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      isActive: body.isActive,
      value: body.value !== undefined ? (body.value == null ? null : Number(body.value)) : undefined,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof LensAttributeServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("PATCH /api/admin/catalog/attributes/:type/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
