import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getSession, getSessionOrUnauthorized } from "../../lib/session-auth";
import { serializeDeliveryService } from "../../lib/delivery-service";

function parseServiceBody(body: Record<string, unknown>) {
  const courierCompany = typeof body?.courierCompany === "string" ? body.courierCompany.trim().slice(0, 120) : "";
  const serviceName = typeof body?.serviceName === "string" ? body.serviceName.trim().slice(0, 160) : "";
  const serviceType =
    typeof body?.serviceType === "string" && body.serviceType.trim()
      ? body.serviceType.trim().toUpperCase().slice(0, 20)
      : "LAND";
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const customerRate = num(body?.customerRate);
  const internalCostRate = num(body?.internalCostRate);
  if (!courierCompany) return { error: "courierCompany is required." };
  if (!serviceName) return { error: "serviceName is required." };
  if (customerRate === null || customerRate < 0) return { error: "customerRate must be >= 0." };
  if (internalCostRate === null || internalCostRate < 0)
    return { error: "internalCostRate must be >= 0." };
  const billingMethod =
    typeof body?.billingMethod === "string" && body.billingMethod.trim()
      ? body.billingMethod.trim().toUpperCase().slice(0, 20)
      : "PER_KG";
  const weightRounding =
    typeof body?.weightRounding === "string" && body.weightRounding.trim()
      ? body.weightRounding.trim().toUpperCase().slice(0, 20)
      : "NEXT_1KG";
  return {
    data: {
      courierCompany,
      serviceName,
      serviceType,
      billingMethod,
      weightRounding,
      customerRate,
      internalCostRate,
      flatCharge: num(body?.flatCharge) ?? 0,
      minCharge: num(body?.minCharge) ?? 0,
      minWeight: num(body?.minWeight) ?? 1,
      internalMinCost: num(body?.internalMinCost) ?? 0,
      etaText:
        typeof body?.etaText === "string" && body.etaText.trim()
          ? body.etaText.trim().slice(0, 120)
          : null,
      isActive: body?.isActive === undefined ? undefined : body.isActive !== false,
    },
  };
}

// GET /api/delivery-services — public active list for checkout; staff/admin see all with ?all=1
// Internal courier cost is only exposed to staff/admin (?all=1). Everyone else
// gets the customer-facing fields so our margin stays hidden.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const session = getSession(req);
    const isStaff = session?.role === "ADMIN" || session?.role === "EMPLOYEE";
    const showAll = searchParams.get("all") === "1" && isStaff;
    const services = await prisma.deliveryService.findMany({
      where: showAll ? {} : { isActive: true },
      orderBy: [{ serviceType: "asc" }, { customerRate: "asc" }],
    });
    return NextResponse.json(
      services.map((s) => {
        const full = serializeDeliveryService(s);
        if (showAll) return full;
        const { internalCostRate: _c, internalMinCost: _m, ...pub } = full;
        return pub;
      })
    );
  } catch (error) {
    console.error("GET /api/delivery-services error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/delivery-services — ADMIN only
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  try {
    const body = await req.json();
    const parsed = parseServiceBody(body ?? {});
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const created = await prisma.deliveryService.create({ data: parsed.data });
    return NextResponse.json(serializeDeliveryService(created), { status: 201 });
  } catch (error) {
    console.error("POST /api/delivery-services error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
