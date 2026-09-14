import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../lib/session-auth";
import { prisma, withDbRetry } from "../../lib/prisma";

// GET /api/invoices
// Access: ADMIN | EMPLOYEE => all invoices, CUSTOMER => own invoices
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const invoices = await withDbRetry(() =>
      prisma.invoice.findMany({
        where: session.role === "CUSTOMER" ? { userId: session.userId } : undefined,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              gstNumber: true,
              businessName: true,
              businessAddress: true,
              state: true,
              pincode: true,
            },
          },
          order: {
            include: {
              singleVisionLens: true,
              kryptokLens: true,
              progressiveLens: true,
              wholesaleLineItems: {
                orderBy: { createdAt: "asc" },
              },
            },
          },
          lines: { orderBy: { lineNumber: "asc" } },
        },
        orderBy: { issuedAt: "desc" },
      })
    );

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
