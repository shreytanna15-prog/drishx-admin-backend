import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSession } from "../../../lib/session-auth";
import { serializeDeliveryService } from "../../../lib/delivery-service";

// PUT /api/delivery-services/:id — ADMIN only
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  try {
    const existing = await prisma.deliveryService.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Delivery service not found." }, { status: 404 });
    const body = await req.json();
    const data: Record<string, unknown> = {};
    const str = (v: unknown, n: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined;
    const num = (v: unknown) => (v === undefined ? undefined : Number.isFinite(Number(v)) ? Number(v) : null);
    const s = str(body?.courierCompany, 120);
    if (s !== undefined) data.courierCompany = s;
    const n = str(body?.serviceName, 160);
    if (n !== undefined) data.serviceName = n;
    const t = str(body?.serviceType, 20);
    if (t !== undefined) data.serviceType = t.toUpperCase();
    const b = str(body?.billingMethod, 20);
    if (b !== undefined) data.billingMethod = b.toUpperCase();
    const w = str(body?.weightRounding, 20);
    if (w !== undefined) data.weightRounding = w.toUpperCase();
    for (const k of ["customerRate", "internalCostRate", "flatCharge", "minCharge", "minWeight", "internalMinCost"] as const) {
      const v = num(body?.[k]);
      if (v !== undefined) {
        if (v === null || v < 0) return NextResponse.json({ error: `${k} must be >= 0.` }, { status: 400 });
        data[k] = v;
      }
    }
    const eta = str(body?.etaText, 120);
    if (body?.etaText !== undefined) data.etaText = eta ?? null;
    if (body?.isActive !== undefined) data.isActive = body.isActive !== false;
    const updated = await prisma.deliveryService.update({ where: { id }, data });
    return NextResponse.json(serializeDeliveryService(updated));
  } catch (error) {
    console.error("PUT /api/delivery-services/:id error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/delivery-services/:id — ADMIN only (soft: deactivate if used)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  try {
    const used = await prisma.orderDelivery.count({ where: { deliveryServiceId: id } });
    if (used > 0) {
      const updated = await prisma.deliveryService.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ ...serializeDeliveryService(updated), deactivated: true });
    }
    await prisma.deliveryService.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/delivery-services/:id error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
