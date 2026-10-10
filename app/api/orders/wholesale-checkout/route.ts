import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { CartLineType } from "../../../lib/cart-line-type";
import { validateOrderNotes } from "../../../lib/order-notes";
import {
  releaseExpiredReservations,
} from "../../../lib/cart-reservations";
import { prisma } from "../../../lib/prisma";
import { isCustomerApproved } from "../../../lib/user-public";
import { resolveCheckoutDeliveryServiceId } from "../../../lib/delivery-pack";
import { placeWholesaleCheckoutBatches } from "../../../lib/wholesale-checkout-batch";
import {
  expandWholesaleSpec,
  type WholesaleSpec,
} from "../../../lib/wholesale-cart";

function parseWholesaleSpec(value: unknown): WholesaleSpec | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as WholesaleSpec;
}

// POST /api/orders/wholesale-checkout
// Body: { cartLineKeys?: string[], notes?, checkoutBatchId? }
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  try {
    if (session.role === "CUSTOMER") {
      const customer = await prisma.user.findUnique({
        where: { id: session.userId },
      });
      if (!customer || !isCustomerApproved(customer)) {
        return NextResponse.json(
          {
            error:
              "Your account is pending admin approval. You cannot place orders yet.",
          },
          { status: 403 }
        );
      }
    }

    void releaseExpiredReservations().catch((error) => {
      console.error("releaseExpiredReservations (async) error:", error);
    });

    const body = await req.json();
    const notesResult = validateOrderNotes(body?.notes);
    if (!notesResult.ok) {
      return NextResponse.json({ error: notesResult.error }, { status: 400 });
    }
    const orderNotes = notesResult.notes;

    const targetCustomerId =
      session.role === "CUSTOMER"
        ? session.userId
        : typeof body?.userId === "string" && body.userId.trim()
          ? body.userId.trim()
          : null;

    if (!targetCustomerId) {
      return NextResponse.json(
        { error: "Customer userId is required." },
        { status: 400 }
      );
    }

    const requestedKeys = Array.isArray(body?.cartLineKeys)
      ? body.cartLineKeys
          .filter((key: unknown) => typeof key === "string" && key.trim())
          .map((key: string) => key.trim())
      : null;

    const wholesaleRows = await prisma.cartReservation.findMany({
      where: {
        userId: targetCustomerId,
        lineType: CartLineType.WHOLESALE,
        ...(requestedKeys?.length ? { cartLineKey: { in: requestedKeys } } : {}),
      },
    });

    if (wholesaleRows.length === 0) {
      return NextResponse.json(
        { error: "No wholesale cart batches found to checkout." },
        { status: 400 }
      );
    }

    const checkoutBatchId =
      typeof body?.checkoutBatchId === "string" && body.checkoutBatchId.trim()
        ? body.checkoutBatchId.trim().slice(0, 64)
        : `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const legacyBatches = [];
    const groupedRows = new Map<string, typeof wholesaleRows>();
    const prepFailures: string[] = [];

    for (const row of wholesaleRows) {
      const spec = parseWholesaleSpec(row.wholesaleSpec);
      if (spec) {
        const expanded = expandWholesaleSpec(spec);
        if (expanded.length === 0) {
          prepFailures.push(`${row.cartLineKey}: no order lines to place.`);
          continue;
        }

        legacyBatches.push({ cartRows: [row], expanded });
        continue;
      }

      if (row.sph === null) {
        prepFailures.push(`${row.cartLineKey}: invalid wholesale cart row.`);
        continue;
      }
      const key = [
        row.lensType,
        row.lensId,
        row.brand ?? "",
        row.item ?? "",
        row.coating ?? "",
        row.lensTypeLabel ?? "",
      ].join(":");
      const rows = groupedRows.get(key) ?? [];
      rows.push(row);
      groupedRows.set(key, rows);
    }

    const batches = [
      ...legacyBatches,
      ...[...groupedRows.values()].map((cartRows) => ({ cartRows, expanded: null })),
    ];

    const customer = await prisma.user.findUnique({
      where: { id: targetCustomerId },
      select: { name: true, email: true },
    });
    const customerLabel =
      customer?.name?.trim() || customer?.email || "A customer";

    const result = await placeWholesaleCheckoutBatches(batches, {
      actingUserId: session.userId,
      resolvedUserId: targetCustomerId,
      checkoutBatchId,
      orderNotes,
      customerLabel,
      redeemPoints: session.role === "CUSTOMER" ? body?.redeemPoints : null,
      deliveryServiceId: await resolveCheckoutDeliveryServiceId(body?.deliveryServiceId).catch(() => {
        throw new Error("Selected delivery service is not available.");
      }),
    });

    const failures = [...prepFailures, ...result.failures];

    if (result.consumedCartLineKeys.length > 0) {
      await prisma.cartReservation.deleteMany({
        where: {
          userId: targetCustomerId,
          cartLineKey: { in: result.consumedCartLineKeys },
        },
      });
    }

    if (failures.length === 0) {
      return NextResponse.json({
        successCount: result.successCount,
        procurementCount: result.procurementCount,
        lineItemCount: result.lineItemCount,
        checkoutBatchId,
        message: `Successfully placed ${result.successCount} order(s).`,
      });
    }

    return NextResponse.json(
      {
        successCount: result.successCount,
        procurementCount: result.procurementCount,
        lineItemCount: result.lineItemCount,
        checkoutBatchId,
        failures,
        error:
          result.successCount > 0
            ? `${result.successCount} order(s) placed. Some lines failed.`
            : failures.join("\n"),
      },
      { status: result.successCount > 0 ? 207 : 400 }
    );
  } catch (error) {
    console.error("POST /api/orders/wholesale-checkout error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message.includes("loyalty") || message.includes("X Points") || message.includes("redeem")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
