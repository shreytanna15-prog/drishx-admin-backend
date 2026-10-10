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
import { Eye } from "@prisma/client";
import { dedupeProgressiveLenses } from "../../../../lib/resolve-lens-stock";
import { computeSelectableRange } from "../../../../lib/lens-power-range";
import { resolveLensTypeImageUrl } from "../../../../lib/lens-catalog-images";

// GET /api/lenses/progressive/[id] - Get details of a progressive lens
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lens = await prisma.progressiveLens.findUnique({
      where: { id },
    });

    if (!lens) {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }

    const siblings = dedupeProgressiveLenses(
      await prisma.progressiveLens.findMany({
        where: {
          category: lens.category,
          brand: lens.brand,
          item: lens.item,
          coating: lens.coating,
          index: lens.index,
          type: lens.type,
        },
      })
    );
    const selectableRange = computeSelectableRange(lens, siblings);
    const imageUrl = await resolveLensTypeImageUrl("PROGRESSIVE");

    return NextResponse.json({ ...lens, selectableRange, imageUrl });
  } catch (error) {
    console.error("Error fetching progressive lens:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT /api/lenses/progressive/[id] - Update a progressive lens
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      category,
      item,
      brand,
      index,
      type,
      coating,
      sph,
      cyl,
      axis,
      add,
      eye,
      price,
      quantity,
    } = body;

    if (eye !== undefined && !Object.values(Eye).includes(eye)) {
      return NextResponse.json({ error: "Invalid eye value. Must be LEFT or RIGHT." }, { status: 400 });
    }

    const lens = await prisma.progressiveLens.update({
      where: { id },
      data: {
        category: category !== undefined ? category : undefined,
        item: item !== undefined ? String(item) : undefined,
        brand: brand !== undefined ? String(brand) : undefined,
        index: index !== undefined ? Number(index) : undefined,
        type: type !== undefined ? String(type) : undefined,
        coating: coating !== undefined ? String(coating) : undefined,
        sph: sph !== undefined ? Number(sph) : undefined,
        cyl: cyl !== undefined ? Number(cyl) : undefined,
        axis: axis !== undefined ? Number(axis) : undefined,
        add: add !== undefined ? Number(add) : undefined,
        eye: eye !== undefined ? (eye as Eye) : undefined,
        price: price !== undefined ? Number(price) : undefined,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
      },
    });

    return NextResponse.json(lens);
  } catch (error) {
    console.error("Error updating progressive lens:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/lenses/progressive/[id] - Delete a progressive lens
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
    const lens = await prisma.progressiveLens.update({
      where: { id },
      data: { isDisabled: true },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.SKU_DISABLED,
      module: AuditModule.LENS,
      entityType: "ProgressiveLens",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      activityMessage: `Progressive SKU disabled: ${lens.brand}`,
    });

    return NextResponse.json({ message: "Lens disabled successfully" });
  } catch (error) {
    console.error("Error deleting progressive lens:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
