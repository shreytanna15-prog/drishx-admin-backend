import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  assessSelfServeOrderEligibility,
  assessStaffOnBehalfOrderEligibility,
} from "@/app/lib/customer-order-eligibility";
import { validateOrderNotes } from "@/app/lib/order-notes";
import { buildAuditRequestContext } from "@/app/lib/audit";
import { placeCatalogOrder } from "@/app/lib/catalog/place-catalog-order";
import { CatalogOrderStockError } from "@/app/lib/catalog/catalog-order-stock";

export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "orders.create_on_behalf");
    if ("error" in gate) return gate.error;
  } else if (session.role !== "CUSTOMER" && session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const body = await req.json() as Record<string, unknown>;
    const powerId = typeof body.lensProductPowerId === "string" ? body.lensProductPowerId.trim() : "";
    const quantity = Number(body.quantity);
    if (!powerId || !Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Catalog power and positive whole quantity are required." }, { status: 400 });
    }
    if (body.stockMode !== "LIVE" && body.stockMode !== "NON_LIVE") {
      return NextResponse.json({ error: "Choose LIVE or NON_LIVE stock mode." }, { status: 400 });
    }
    const notes = validateOrderNotes(body.notes);
    if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });
    const customerId = session.role === "CUSTOMER" ? session.userId
      : typeof body.userId === "string" ? body.userId.trim() : "";
    const customer = customerId ? await prisma.user.findUnique({ where: { id: customerId } }) : null;
    if (!customer || customer.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }
    const eligibility = session.role === "CUSTOMER"
      ? assessSelfServeOrderEligibility(customer)
      : assessStaffOnBehalfOrderEligibility(customer);
    if (!eligibility.ok) return NextResponse.json({ error: eligibility.message }, { status: 403 });

    const created = await placeCatalogOrder({
      powerId, quantity, live: body.stockMode === "LIVE", customerId,
      actorId: session.userId, actorRole: session.role,
      checkoutBatchId: typeof body.checkoutBatchId === "string" ? body.checkoutBatchId : null,
      redeemPoints: session.role === "CUSTOMER" ? Number(body.redeemPoints) || null : null,
      deliveryServiceId: typeof body.deliveryServiceId === "string" ? body.deliveryServiceId : null,
      notes: notes.notes,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({
      order: created.order, transaction: created.transaction,
      invoice: { id: created.invoiceId }, needsProcurement: created.needsProcurement,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogOrderStockError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/orders/catalog", error);
    return NextResponse.json({ error: "Could not place catalog order." }, { status: 500 });
  }
}
