import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  LensPowerRangeServiceError,
  updateLensPowerRange,
} from "../../../../../lib/catalog/lens-power-range-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/catalog/power-ranges/:id
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const item = await updateLensPowerRange(id, {
      sphMin: body.sphMin !== undefined ? (body.sphMin as number) : undefined,
      sphMax: body.sphMax !== undefined ? (body.sphMax as number) : undefined,
      cylMin: body.cylMin !== undefined ? (body.cylMin as number) : undefined,
      cylMax: body.cylMax !== undefined ? (body.cylMax as number) : undefined,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      isActive: body.isActive,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof LensPowerRangeServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("PATCH /api/admin/catalog/power-ranges/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
