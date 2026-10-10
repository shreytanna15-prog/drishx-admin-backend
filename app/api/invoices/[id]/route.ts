import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";

// GET /api/invoices/:id
// Access: ADMIN | EMPLOYEE | CUSTOMER (customer can only view own invoice)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const { id } = await params;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
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
            billingState: true,
            creditLimit: true,
            customerType: true,
          },
        },
        order: {
          include: {
            singleVisionLens: true,
            kryptokLens: true,
            progressiveLens: true,
          },
        },
        lines: { orderBy: { lineNumber: "asc" } },
        paymentAllocations: {
          include: { payment: true },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    if (session.role === "CUSTOMER" && invoice.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("GET /api/invoices/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
