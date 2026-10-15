import { NextRequest, NextResponse } from "next/server";
import { accountAccessErrorResponse } from "../../../lib/account-access";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

export async function GET(req: NextRequest) {
  const { session, error } = getSessionOrUnauthorized(req);
  if (error || !session) return error!;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { staffRole: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // RW-04: suspended customers / inactive staff lose access even with a live JWT.
  const accessDenied = accountAccessErrorResponse(user);
  if (accessDenied) return accessDenied;

  return NextResponse.json({ user: toSafeUser(user) });
}
