import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

/**
 * Pending customers awaiting admin action.
 * - bucket=ready (default): PENDING_REVIEW with GST submitted (approve/reject ready)
 * - bucket=incomplete: PENDING_REVIEW without GST (abandoned / mid-wizard signups)
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const bucket = new URL(req.url).searchParams.get("bucket")?.trim().toLowerCase();
    const incomplete = bucket === "incomplete";

    const users = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        approvalStatus: "PENDING_REVIEW",
        ...(incomplete
          ? { gstNumber: null }
          : { gstNumber: { not: null } }),
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      users: users.map(toSafeUser),
      bucket: incomplete ? "incomplete" : "ready",
    });
  } catch (error) {
    console.error("GET /api/users/pending error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
