import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { LensType } from "@prisma/client";
import { CartLineType } from "../../../lib/cart-line-type";
import {
  BULK_CART_MAX_LINES,
  bulkUpsertCartReservations,
  type UpsertCartReservationInput,
} from "../../../lib/cart-reservations";

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

function parseBulkLine(
  raw: unknown,
  actingUserId: string
): UpsertCartReservationInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const line = raw as Record<string, unknown>;
  const lensType = parseLensType(line.lensType);
  const lensId = typeof line.lensId === "string" ? line.lensId : null;
  const cartLineKey = typeof line.cartLineKey === "string" ? line.cartLineKey.trim() : null;
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unitPrice);
  const lineType = parseCartLineType(line.lineType) ?? CartLineType.RETAIL;

  if (!lensType || !lensId || !cartLineKey || !Number.isFinite(quantity) || quantity < 1) {
    return null;
  }

  if (!CART_SUPPORTED_LENS_TYPES.includes(lensType)) {
    return null;
  }

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }

  return {
    userId: actingUserId,
    lensType,
    lensId,
    cartLineKey,
    quantity: Math.max(1, Math.round(quantity)),
    unitPrice,
    lineType,
    sph: line.sph !== undefined && line.sph !== null ? Number(line.sph) : null,
    cyl: line.cyl !== undefined && line.cyl !== null ? Number(line.cyl) : null,
    add: line.add !== undefined && line.add !== null ? Number(line.add) : null,
    axis: line.axis !== undefined && line.axis !== null ? Number(line.axis) : null,
    eye: typeof line.eye === "string" ? line.eye : null,
    brand: typeof line.brand === "string" ? line.brand : null,
    coating: typeof line.coating === "string" ? line.coating : null,
    item: typeof line.item === "string" ? line.item : null,
    lensTypeLabel: typeof line.lensTypeLabel === "string" ? line.lensTypeLabel : null,
  };
}

// POST /api/cart/bulk — add or replace many cart lines in one SQL upsert
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

    const rawLines = Array.isArray(body?.lines) ? body.lines : null;
    if (!rawLines || rawLines.length === 0) {
      return NextResponse.json({ error: "lines array is required." }, { status: 400 });
    }

    if (rawLines.length > BULK_CART_MAX_LINES) {
      return NextResponse.json(
        { error: `Cannot add more than ${BULK_CART_MAX_LINES} cart lines at once.` },
        { status: 400 }
      );
    }

    const lines: UpsertCartReservationInput[] = [];
    for (const raw of rawLines) {
      const parsed = parseBulkLine(raw, actingUserId);
      if (!parsed) {
        return NextResponse.json(
          { error: "Each line requires lensType, lensId, cartLineKey, quantity, and unitPrice." },
          { status: 400 }
        );
      }
      lines.push(parsed);
    }

    await bulkUpsertCartReservations(lines, {
      releaseExpired: false,
      skipReturnRows: lines.length > 1,
    });

    return NextResponse.json({
      count: lines.length,
      message: `Added ${lines.length} item(s) to cart.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update cart.";
    console.error("POST /api/cart/bulk error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
