import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { requireStaffPermission } from "@/app/lib/staff-access";
import { buildAuditRequestContext } from "@/app/lib/audit";
import { requestOrderModification } from "@/app/lib/order-modifications";
import { CatalogOrderStockError } from "@/app/lib/catalog/catalog-order-stock";

async function authorize(req: NextRequest, id: string, write: boolean) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  const session = auth.session;
  const order = await prisma.order.findUnique({
    where: { id }, select: { userId: true, assignedToId: true },
  });
  if (!order) return { error: NextResponse.json({ error: "Order not found." }, { status: 404 }) };
  if (session.role === "CUSTOMER" && order.userId !== session.userId) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, write ? "orders.fulfill" : "orders.view");
    if ("error" in gate) return { error: gate.error };
    if (order.assignedToId !== session.userId) {
      return { error: NextResponse.json({ error: "Order is not assigned to you." }, { status: 403 }) };
    }
  }
  return { session };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req, id, false);
  if ("error" in auth) return auth.error;
  const items = await prisma.orderModificationRequest.findMany({
    where: { orderId: id }, orderBy: { createdAt: "desc" }, take: 30,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(req, id, true);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json() as Record<string, unknown>;
    const result = await requestOrderModification({
      orderId: id,
      quantity: Number(body.quantity),
      powerId: typeof body.lensProductPowerId === "string" ? body.lensProductPowerId : null,
      reason: typeof body.reason === "string" ? body.reason : "",
      session: auth.session!, request: buildAuditRequestContext(req),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogOrderStockError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This order already has a pending change request." }, { status: 409 });
    }
    console.error("POST /api/orders/[id]/modification", error);
    return NextResponse.json({ error: "Could not request order change." }, { status: 500 });
  }
}
