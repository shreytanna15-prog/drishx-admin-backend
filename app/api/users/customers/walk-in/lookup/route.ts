import { NextRequest, NextResponse } from "next/server";

import { lookupWalkInMobile } from "@/app/lib/walk-in-lookup";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";

/**
 * RC-06 — Staff walk-in mobile lookup (skip OTP / Path A reject / none).
 * GET /api/users/customers/walk-in/lookup?mobile=
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  if (auth.session.role !== "ADMIN" && auth.session.role !== "EMPLOYEE") {
    return NextResponse.json(
      { error: "Staff authorization required." },
      { status: 403 }
    );
  }

  try {
    const mobile = req.nextUrl.searchParams.get("mobile") ?? "";
    const result = await lookupWalkInMobile(mobile);
    if (!result.mobileNumber && result.message) {
      return NextResponse.json(
        { error: result.message, code: "INVALID_MOBILE", ...result },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/users/customers/walk-in/lookup error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
