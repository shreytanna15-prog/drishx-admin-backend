import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import {
  createLensPowerRange,
  LensPowerRangeServiceError,
  listLensPowerRanges,
} from "../../../../lib/catalog/lens-power-range-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

// GET /api/admin/catalog/power-ranges?activeOnly=true
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const activeOnly =
      new URL(req.url).searchParams.get("activeOnly") === "true";
    const items = await listLensPowerRanges(activeOnly);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/admin/catalog/power-ranges", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog/power-ranges
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const item = await createLensPowerRange({
      sphMin: body.sphMin as number,
      sphMax: body.sphMax as number,
      cylMin: body.cylMin as number,
      cylMax: body.cylMax as number,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      isActive: body.isActive,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof LensPowerRangeServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/catalog/power-ranges", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
