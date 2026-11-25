import { NextRequest, NextResponse } from "next/server";
import { LensType } from "@prisma/client";
import { CartLineType } from "../../lib/cart-line-type";
import { getSession, getSessionOrUnauthorized } from "../../lib/session-auth";
import {
  CART_LINE_TTL_MS,
  batchGetLensOnHand,
  deleteCartReservation,
  lensOnHandKey,
  mapReservationToCartItem,
  releaseCartReservation,
  releaseExpiredReservations,
  releaseUserReservations,
  upsertCartReservation,
} from "../../lib/cart-reservations";
import { prisma } from "../../lib/prisma";

const CART_SUPPORTED_LENS_TYPES: LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
];

function parseLensType(value: unknown): LensType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "SINGLE VISION" || normalized === "SINGLE_VISION") {
    return LensType.SINGLE_VISION;
  }
  if (normalized === "KRYPTOK") return LensType.KRYPTOK;
  if (normalized === "PROGRESSIVE") return LensType.PROGRESSIVE;
  return Object.values(LensType).includes(normalized as LensType) ? (normalized as LensType) : null;
}

function parseCartLineType(value: unknown): CartLineType | null {
  return value === CartLineType.WHOLESALE || value === CartLineType.RETAIL
    ? value
    : null;
}

function resolveActingCustomerId(req: NextRequest, session: ReturnType<typeof getSession>): string | null {
  if (!session) return null;
  if (session.role === "CUSTOMER") return session.userId;
  if (session.role === "ADMIN" || session.role === "EMPLOYEE") {
    const fromQuery = req.nextUrl.searchParams.get("userId");
    return fromQuery && fromQuery.trim() ? fromQuery.trim() : null;
  }
  return null;
}

// GET /api/cart — list active cart reservations for the signed-in customer
export async function GET(req: NextRequest) {
  const { session, error } = getSessionOrUnauthorized(req);
  if (!session) {
    return error;
  }
  const actingUserId = resolveActingCustomerId(req, session);
  if (!actingUserId) {
    return NextResponse.json({ error: "Customer userId is required." }, { status: 400 });
  }

  try {
    await releaseExpiredReservations();
    const rows = await prisma.cartReservation.findMany({
      where: { userId: actingUserId },
      orderBy: { updatedAt: "desc" },
    });

    for (const row of rows) {
      if (row.reservedQuantity > 0) {
        try {
          await releaseCartReservation(row);
          await prisma.cartReservation.update({
            where: { id: row.id },
            data: { reservedQuantity: 0 },
          });
        } catch (error) {
          console.warn("GET /api/cart: failed to release legacy hold", row.id, error);
        }
      }
    }

    const onHandByLens = await batchGetLensOnHand(
      rows.map((row) => ({ lensType: row.lensType, lensId: row.lensId }))
    );

    const items = rows.map((row) =>
      mapReservationToCartItem(
        row,
        onHandByLens.get(lensOnHandKey(row.lensType, row.lensId)) ?? 0
      )
    );
    return NextResponse.json({
      items,
      reservationTtlMs: CART_LINE_TTL_MS,
    });
  } catch (error) {
    console.error("GET /api/cart error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/cart — add or update a cart line (reserves stock up to available qty)
export async function POST(req: NextRequest) {
  const { session, error } = getSessionOrUnauthorized(req);
  if (!session) {
    return error;
  }

  try {
    const body = await req.json();
    const actingUserId =
      session.role === "CUSTOMER"
        ? session.userId
        : session.role === "ADMIN" || session.role === "EMPLOYEE"
          ? typeof body?.userId === "string" && body.userId.trim()
            ? body.userId.trim()
            : null
          : null;
    if (!actingUserId) {
      return NextResponse.json({ error: "Customer userId is required." }, { status: 400 });
    }

    const powerId =
      typeof body?.lensProductPowerId === "string" ? body.lensProductPowerId.trim() : "";
    let lensType = parseLensType(body?.lensType);
    let lensId = typeof body?.lensId === "string" ? body.lensId : null;
    const cartLineKey = typeof body?.cartLineKey === "string" ? body.cartLineKey.trim() : null;
    const quantity = Number(body?.quantity);
    let unitPrice = Number(body?.unitPrice);
    const lineType = parseCartLineType(body?.lineType) ?? CartLineType.RETAIL;
    let sph = body?.sph !== undefined && body?.sph !== null ? Number(body.sph) : null;
    let cyl = body?.cyl !== undefined && body?.cyl !== null ? Number(body.cyl) : null;
    let brand = typeof body?.brand === "string" ? body.brand : null;
    let item = typeof body?.item === "string" ? body.item : null;
    let lensTypeLabel = typeof body?.lensTypeLabel === "string" ? body.lensTypeLabel : null;
    let availableOnHand = 0;

    if (powerId) {
      const leaf = await prisma.lensProductPower.findUnique({
        where: { id: powerId },
        include: {
          lensProductVariant: {
            select: {
              skuCode: true,
              name: true,
              sellingPrice: true,
              product: { select: { family: { select: { code: true, name: true } } } },
            },
          },
        },
      });
      if (!leaf) {
        return NextResponse.json({ error: "Catalog stock leaf not found." }, { status: 404 });
      }
      const familyCode = leaf.lensProductVariant.product.family.code;
      const mappedType =
        familyCode === "SV"
          ? LensType.SINGLE_VISION
          : familyCode === "KT"
            ? LensType.KRYPTOK
            : familyCode === "V2"
              ? LensType.PROGRESSIVE
              : null;
      if (!mappedType) {
        return NextResponse.json({ error: "Unsupported catalog family for cart." }, { status: 400 });
      }
      lensType = mappedType;
      lensId = leaf.legacyLensId ?? powerId;
      sph = Number(leaf.sph);
      cyl = Number(leaf.cyl);
      brand = leaf.lensProductVariant.skuCode;
      item = leaf.lensProductVariant.name;
      lensTypeLabel = leaf.lensProductVariant.product.family.name;
      unitPrice = Number(leaf.lensProductVariant.sellingPrice);
      availableOnHand = Math.max(0, Number(leaf.quantity) - Number(leaf.blockedQty));
    }

    if (!lensType || !lensId || !cartLineKey || !Number.isFinite(quantity) || quantity < 1) {
      return NextResponse.json(
        { error: "lensType, lensId, cartLineKey, and quantity are required (or lensProductPowerId + cartLineKey + quantity)." },
        { status: 400 }
      );
    }

    if (!CART_SUPPORTED_LENS_TYPES.includes(lensType)) {
      return NextResponse.json({ error: "Unsupported lens type for cart." }, { status: 400 });
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ error: "unitPrice is required." }, { status: 400 });
    }

    const row = await upsertCartReservation({
      userId: actingUserId,
      lensType,
      lensId,
      cartLineKey,
      quantity: Math.max(1, Math.round(quantity)),
      unitPrice,
      lineType,
      lensProductPowerId: powerId || null,
      sph,
      cyl,
      add: body?.add !== undefined && body?.add !== null ? Number(body.add) : null,
      axis: body?.axis !== undefined && body?.axis !== null ? Number(body.axis) : null,
      eye: typeof body?.eye === "string" ? body.eye : null,
      brand,
      coating: typeof body?.coating === "string" ? body.coating : null,
      item,
      lensTypeLabel,
    });

    if (!powerId) {
      const onHandByLens = await batchGetLensOnHand([{ lensType, lensId: row.lensId }]);
      availableOnHand = onHandByLens.get(lensOnHandKey(lensType, row.lensId)) ?? 0;
    }
    const itemPayload = mapReservationToCartItem(row, availableOnHand);
    return NextResponse.json({
      item: itemPayload,
      message: "Added to cart.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update cart.";
    console.error("POST /api/cart error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/cart — clear entire cart or one line (?cartLineKey=...)
export async function DELETE(req: NextRequest) {
  const { session, error } = getSessionOrUnauthorized(req);
  if (!session) {
    return error;
  }
  const actingUserId = resolveActingCustomerId(req, session);
  if (!actingUserId) {
    return NextResponse.json({ error: "Customer userId is required." }, { status: 400 });
  }

  try {
    const cartLineKey = req.nextUrl.searchParams.get("cartLineKey");
    if (cartLineKey) {
      await deleteCartReservation(actingUserId, cartLineKey);
      return NextResponse.json({ ok: true });
    }

    await releaseUserReservations(actingUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("DELETE /api/cart error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
