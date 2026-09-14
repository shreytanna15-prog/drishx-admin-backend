import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSession } from "../../../../lib/session-auth";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { dedupeKryptokLenses } from "../../../../lib/resolve-lens-stock";
import { computeKryptokSelectableRange } from "../../../../lib/lens-power-range";
import { resolveLensTypeImageUrl } from "../../../../lib/lens-catalog-images";

// GET /api/lenses/kryptok/[id] - Get details of a Kryptok lens
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const lens = await prisma.kryptokLens.findUnique({
      where: { id },
    });

    if (!lens) {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }

    const siblings = dedupeKryptokLenses(
      await prisma.kryptokLens.findMany({
        where: {
          category: lens.category,
          brand: lens.brand,
          coating: lens.coating,
        },
      })
    );
    const selectableRange = computeKryptokSelectableRange(lens, siblings);
    const imageUrl = await resolveLensTypeImageUrl("KRYPTOK");

    return NextResponse.json({ ...lens, selectableRange, imageUrl });
  } catch (error) {
    console.error("Error fetching Kryptok lens:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PUT /api/lenses/kryptok/[id] - Update a Kryptok lens
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { sph, cyl, axis, add, price, quantity } = body;

    const lens = await prisma.kryptokLens.update({
      where: { id },
      data: {
        sph: sph !== undefined ? Number(sph) : undefined,
        cyl: cyl !== undefined ? Number(cyl) : undefined,
        axis: axis !== undefined ? Number(axis) : undefined,
        add: add !== undefined ? Number(add) : undefined,
        price: price !== undefined ? Number(price) : undefined,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
      },
    });

    return NextResponse.json(lens);
  } catch (error) {
    console.error("Error updating Kryptok lens:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/lenses/kryptok/[id] - Delete a Kryptok lens
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const lens = await prisma.kryptokLens.update({
      where: { id },
      data: { isDisabled: true },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.SKU_DISABLED,
      module: AuditModule.LENS,
      entityType: "KryptokLens",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      activityMessage: `Kryptok SKU disabled`,
      context: { brand: lens.brand, category: lens.category },
    });

    return NextResponse.json({ message: "Lens disabled successfully" });
  } catch (error) {
    console.error("Error deleting Kryptok lens:", error);
    if ((error as any).code === "P2025") {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
