import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import {
  getAlternatePowerSettings,
  setAlternatePowerSettings,
} from "../../../lib/alternate-power-settings";

/** GET /api/settings/alternate-power */
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const settings = await getAlternatePowerSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("GET /api/settings/alternate-power error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PUT /api/settings/alternate-power — admin only */
export async function PUT(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const settings = await setAlternatePowerSettings({
      maxSphDelta:
        body?.maxSphDelta !== undefined ? Number(body.maxSphDelta) : undefined,
      maxCylDelta:
        body?.maxCylDelta !== undefined ? Number(body.maxCylDelta) : undefined,
      maxSuggestions:
        body?.maxSuggestions !== undefined
          ? Number(body.maxSuggestions)
          : undefined,
      preferWarehouse:
        typeof body?.preferWarehouse === "boolean"
          ? body.preferWarehouse
          : undefined,
      hardMaxDistanceScore:
        body?.hardMaxDistanceScore !== undefined
          ? Number(body.hardMaxDistanceScore)
          : undefined,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("PUT /api/settings/alternate-power error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
