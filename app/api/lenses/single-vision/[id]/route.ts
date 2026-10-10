import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { computeSelectableRange } from "../../../../lib/lens-power-range";
import { resolveLensTypeImageUrl } from "../../../../lib/lens-catalog-images";

// GET /api/lenses/single-vision/[id] - Get details of a single vision lens
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lens = await prisma.singleVisionLens.findUnique({
      where: { id },
    });

    if (!lens) {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }

    const siblings = await prisma.singleVisionLens.findMany({
      where: {
        category: lens.category,
        brand: lens.brand,
        item: lens.item,
        index: lens.index,
        coating: lens.coating,
      },
    });

    const selectableRange = computeSelectableRange(lens, siblings);
    const imageUrl = await resolveLensTypeImageUrl("SINGLE_VISION");

    return NextResponse.json({ ...lens, selectableRange, imageUrl });
  } catch (error) {
    console.error("Error fetching single vision lens:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT /api/lenses/single-vision/[id] - Update a single vision lens
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { category, brand, item, index, coating, sph, cyl, crossPower, price, quantity, reasonCode, reasonText } = body;

    const existing = await prisma.singleVisionLens.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }

    const lens = await prisma.singleVisionLens.update({
      where: { id },
      data: {
        category: category !== undefined ? category : undefined,
        brand: brand !== undefined ? String(brand) : undefined,
        item: item !== undefined ? item : undefined,
        index: index !== undefined ? Number(index) : undefined,
        coating: coating !== undefined ? String(coating) : undefined,
        sph: sph !== undefined ? (sph === null || sph === "" ? null : Number(sph)) : undefined,
        cyl: cyl !== undefined ? (cyl === null || cyl === "" ? null : Number(cyl)) : undefined,
        crossPower:
          crossPower !== undefined
            ? crossPower === null || crossPower === ""
              ? null
              : Number(crossPower)
            : undefined,
        price: price !== undefined ? Number(price) : undefined,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
      },
    });

    const priceChanged = price !== undefined && Number(price) !== Number(existing.price);
    const qtyChanged = quantity !== undefined && Number(quantity) !== existing.quantity;

    await recordAuditEvent(prisma, {
      action: priceChanged ? AuditAction.PRICE_CHANGED : AuditAction.LENS_UPDATED,
      module: AuditModule.LENS,
      entityType: "SingleVisionLens",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      reasonCode: reasonCode ? String(reasonCode) : qtyChanged || priceChanged ? "MANUAL_ADJUSTMENT" : undefined,
      reasonText: reasonText ? String(reasonText) : null,
      changes: [
        ...(priceChanged
          ? [{ field: "price", before: existing.price, after: lens.price }]
          : []),
        ...(qtyChanged
          ? [{ field: "quantity", before: existing.quantity, after: lens.quantity }]
          : []),
      ],
      context: { brand: lens.brand, category: lens.category },
      activityMessage: priceChanged
        ? `Price changed: ${existing.price} → ${lens.price}`
        : qtyChanged
          ? `Stock adjusted: ${existing.quantity} → ${lens.quantity}`
          : "Lens SKU updated",
    });

    return NextResponse.json(lens);
  } catch (error) {
    console.error("Error updating single vision lens:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/lenses/single-vision/[id] - Delete a single vision lens
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const lens = await prisma.singleVisionLens.update({
      where: { id },
      data: { isDisabled: true },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.SKU_DISABLED,
      module: AuditModule.LENS,
      entityType: "SingleVisionLens",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      activityMessage: `SKU disabled: ${lens.brand}`,
    });

    return NextResponse.json({ message: "Lens disabled successfully" });
  } catch (error) {
    console.error("Error deleting single vision lens:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
