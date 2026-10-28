import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import { getBaseMaterialCompatibility } from "../../../../../lib/catalog/lens-attribute-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

// GET /api/admin/catalog/attributes/compatibility?baseId=
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const baseId = new URL(req.url).searchParams.get("baseId");
    const data = await getBaseMaterialCompatibility(baseId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/catalog/attributes/compatibility", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
