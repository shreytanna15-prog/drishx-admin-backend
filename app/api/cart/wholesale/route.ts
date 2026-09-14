import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { LensType } from "@prisma/client";
import { CartLineType } from "../../../lib/cart-line-type";
import {
  mapReservationToCartItem,
  upsertWholesaleCartReservation,
} from "../../../lib/cart-reservations";
import { prisma } from "../../../lib/prisma";
import {
  buildWholesaleCartLineKey,
  buildWholesaleSpecFromInput,
  summarizeWholesaleSpec,
  type WholesaleCartBatchInput,
  type WholesaleGridMode,
  type WholesaleSpec,
} from "../../../lib/wholesale-cart";

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
  return Object.values(LensType).includes(normalized as LensType)
    ? (normalized as LensType)
    : null;
}

function parseGridMode(value: unknown): WholesaleGridMode | null {
  if (value === "sph-only" || value === "cyl-only" || value === "compound") {
    return value;
  }
  return null;
}

function parseRange(
  raw: unknown
): { from: number; to: number; step: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const range = raw as Record<string, unknown>;
  const from = Number(range.from);
  const to = Number(range.to);
  const step = Number(range.step);
  if (![from, to, step].every(Number.isFinite) || step <= 0) {
    return null;
  }
  return { from, to, step };
}

function parseWholesaleBody(body: Record<string, unknown>): {
  input: WholesaleCartBatchInput;
  unitPrice: number;
  brand: string | null;
  coating: string | null;
  item: string | null;
  lensTypeLabel: string | null;
} | null {
  const lensId = typeof body.lensId === "string" ? body.lensId : null;
  const lensType = parseLensType(body.lensType);
  const gridMode = parseGridMode(body.gridMode);
  const unitPrice = Number(body.unitPrice);
  const defaultPairsPerCell = Number(body.defaultPairsPerCell ?? 1);

  if (!lensId || !lensType || !gridMode) {
    return null;
  }

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }

  const rangesRaw =
    body.ranges && typeof body.ranges === "object"
      ? (body.ranges as Record<string, unknown>)
      : null;
  if (!rangesRaw) {
    return null;
  }

  const ranges: WholesaleSpec["ranges"] = {};
  const sph = parseRange(rangesRaw.sph);
  const cyl = parseRange(rangesRaw.cyl);
  const add = parseRange(rangesRaw.add);
  if (sph) ranges.sph = sph;
  if (cyl) ranges.cyl = cyl;
  if (add) ranges.add = add;

  const qtyOverrides: Record<string, number> = {};
  if (body.qtyOverrides && typeof body.qtyOverrides === "object") {
    for (const [key, value] of Object.entries(
      body.qtyOverrides as Record<string, unknown>
    )) {
      const pairs = Number(value);
      if (Number.isFinite(pairs) && pairs >= 0.5 && Math.abs(pairs * 2 - Math.round(pairs * 2)) < 1e-9) {
        qtyOverrides[key] = Math.round(pairs * 2) / 2;
      }
    }
  }

  return {
    input: {
      lensId,
      ranges,
      gridMode,
      defaultPairsPerCell,
      qtyOverrides,
      productAxis:
        body.productAxis !== undefined && body.productAxis !== null
          ? Number(body.productAxis)
          : null,
      isBifocalLens: Boolean(body.isBifocalLens),
      isSingleVision: Boolean(body.isSingleVision),
      crossPower:
        body.crossPower !== undefined && body.crossPower !== null
          ? Number(body.crossPower)
          : null,
    },
    unitPrice,
    brand: typeof body.brand === "string" ? body.brand : null,
    coating: typeof body.coating === "string" ? body.coating : null,
    item: typeof body.item === "string" ? body.item : null,
    lensTypeLabel:
      typeof body.lensTypeLabel === "string" ? body.lensTypeLabel : null,
  };
}

async function lensExistsForCart(lensType: LensType, lensId: string): Promise<boolean> {
  if (lensType === LensType.SINGLE_VISION) {
    const row = await prisma.singleVisionLens.findUnique({
      where: { id: lensId },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (lensType === LensType.KRYPTOK) {
    const row = await prisma.kryptokLens.findUnique({
      where: { id: lensId },
      select: { id: true },
    });
    return Boolean(row);
  }
  if (lensType === LensType.PROGRESSIVE) {
    const row = await prisma.progressiveLens.findUnique({
      where: { id: lensId },
      select: { id: true },
    });
    return Boolean(row);
  }
  return false;
}

async function getLensOnHandQuantity(lensType: LensType, lensId: string): Promise<number> {
  if (lensType === LensType.SINGLE_VISION) {
    const row = await prisma.singleVisionLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return Math.max(0, row?.quantity ?? 0);
  }
  if (lensType === LensType.KRYPTOK) {
    const row = await prisma.kryptokLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return Math.max(0, row?.quantity ?? 0);
  }
  if (lensType === LensType.PROGRESSIVE) {
    const row = await prisma.progressiveLens.findUnique({
      where: { id: lensId },
      select: { quantity: true },
    });
    return Math.max(0, row?.quantity ?? 0);
  }
  return 0;
}

// POST /api/cart/wholesale — persist one wholesale batch cart line
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
      return NextResponse.json(
        { error: "Customer userId is required." },
        { status: 400 }
      );
    }

    const parsed = parseWholesaleBody(body as Record<string, unknown>);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "lensId, lensType, gridMode, ranges, unitPrice, and defaultPairsPerCell are required.",
        },
        { status: 400 }
      );
    }

    const lensType = parseLensType(body.lensType);
    if (!lensType || !CART_SUPPORTED_LENS_TYPES.includes(lensType)) {
      return NextResponse.json(
        { error: "Unsupported lens type for cart." },
        { status: 400 }
      );
    }

    const spec = buildWholesaleSpecFromInput(parsed.input);
    const { expanded, totalPieces, totalPairs } = summarizeWholesaleSpec(spec);
    if (totalPieces < 1 || expanded.length === 0) {
      return NextResponse.json(
        { error: "No valid power combinations with quantity were generated." },
        { status: 400 }
      );
    }

    const lensExists = await lensExistsForCart(lensType, parsed.input.lensId);
    if (!lensExists) {
      return NextResponse.json({ error: "Lens not found." }, { status: 404 });
    }

    const cartLineKey = buildWholesaleCartLineKey(parsed.input.lensId, spec);
    const row = await upsertWholesaleCartReservation({
      userId: actingUserId,
      lensType,
      lensId: parsed.input.lensId,
      cartLineKey,
      lineType: CartLineType.WHOLESALE,
      wholesaleSpec: spec,
      quantity: totalPieces,
      unitPrice: parsed.unitPrice,
      sph: null,
      cyl: null,
      add: null,
      axis: spec.productAxis,
      brand: parsed.brand,
      coating: parsed.coating,
      item: parsed.item,
      lensTypeLabel: parsed.lensTypeLabel,
    });

    const onHand = await getLensOnHandQuantity(lensType, row.lensId);
    const item = mapReservationToCartItem(row, onHand);

    return NextResponse.json({
      item,
      expandedLineCount: expanded.length,
      totalPairs,
      message: "Wholesale batch added to cart.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update cart.";
    console.error("POST /api/cart/wholesale error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
