import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../lib/session-auth";
import { orderTotalFromPairPrice } from "../../lib/lens-pricing";
import { prisma } from "../../lib/prisma";
import { requireStaffPermission } from "../../lib/staff-access";
import { validateOrderNotes } from "../../lib/order-notes";
import { consumeCartReservation, releaseExpiredReservations } from "../../lib/cart-reservations";
import { computeOrderReservedQuantity } from "../../lib/order-inventory";
import { resolveOrderPrescription } from "../../lib/order-prescription";
import { resolveLensForOrder } from "../../lib/resolve-lens-stock";
import { generateUniqueOrderNumber } from "../../lib/order-numbers";
import { dispatchSlotForNow } from "../../lib/dispatch-cutoff";
import { notifyStaffOfNewOrder } from "../../lib/staff-notifications";
import {
  assignmentCreateFields,
  resolveOrderAssigneeId,
} from "../../lib/assign-order-to-employee";
import { isCustomerApproved } from "../../lib/user-public";
import {
  serializeOrderPrescription,
  serializeWholesaleLineItem,
} from "../../lib/serialize-order";
import { createOriginalPowerVersion } from "../../lib/alternate-power-workflow";
import { createInvoiceFromOrder } from "../../lib/finance/create-invoice-from-order";
import {
  applyOrderRedemption,
  resolveCheckoutRedemption,
} from "../../lib/loyalty/redeem";
import {
  CartLineType,
  LensType,
  TransactionType,
  TransactionStatus,
  LedgerEntryType,
  OrderStatus,
} from "@prisma/client";
import {
  buildOnBehalfActivityMessage,
  resolveOrderAttribution,
  stripClientOrderAttribution,
} from "../../lib/order-attribution";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "../../lib/audit";
import { logOrderActivity } from "../../lib/order-activity";
import {
  buildOrdersListWhere,
  ordersListInclude,
  parseOrdersListParams,
  serializeOrderListItem,
} from "../../lib/orders-list";

// ─────────────────────────────────────────────────────────────
// GET /api/orders — paginated summary (RW-11 Phase B)
// CUSTOMER: own orders
// EMPLOYEE: only orders assigned to them (hold rules applied)
// ADMIN: all orders (optional filters)
// Query: page, limit, status, q, employeeId, userId, batchId,
//        lineType, orderKind, scope, assigneeId, dateFrom, dateTo
// Response: { items, page, limit, hasMore, total }
// Fat detail remains on GET /api/orders/:id
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;

  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, [
      "orders.view",
      "orders.fulfill",
      "orders.rx",
      "orders.dispatch",
      "orders.create_on_behalf",
    ]);
    if ("error" in gate) return gate.error;
  }

  try {
    const { searchParams } = new URL(req.url);
    const params = parseOrdersListParams(searchParams);
    const where = buildOrdersListWhere(session, params);
    const skip = (params.page - 1) * params.limit;

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: ordersListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: params.limit,
      }),
    ]);

    const items = orders.map((order) =>
      serializeOrderListItem(order, session.role)
    );
    const hasMore = skip + items.length < total;

    return NextResponse.json({
      items,
      page: params.page,
      limit: params.limit,
      hasMore,
      total,
    });
  } catch (error) {
    console.error("GET /api/orders error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/orders
// Access: ADMIN | EMPLOYEE
// Create an order, decrement lens stock, add income transaction
// Body: { userId?, user?: { name, email, password? }, lensType, quantity, lensId?, sph?, cyl?, axis?, add?, eye?, notes? }
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;

  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "orders.create_on_behalf");
    if ("error" in gate) return gate.error;
  }

  try {
    if (session.role === "CUSTOMER") {
      const customer = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!customer || !isCustomerApproved(customer)) {
        return NextResponse.json(
          { error: "Your account is pending admin approval. You cannot place orders yet." },
          { status: 403 }
        );
      }
    }

    await releaseExpiredReservations();

    const rawBody = (await req.json()) as Record<string, unknown>;
    const body = stripClientOrderAttribution(rawBody);
    const { userId, user, lensType, quantity, lensId, cartLineKey, notes: rawNotes, checkoutBatchId, redeemPoints, deliveryServiceId: rawDeliveryServiceId } =
      body as {
        userId?: string;
        user?: { name?: string; email?: string; password?: string };
        lensType?: string;
        quantity?: number;
        lensId?: string;
        cartLineKey?: string;
        notes?: unknown;
        checkoutBatchId?: string;
        redeemPoints?: number | null;
        deliveryServiceId?: string;
      };

    const notesResult = validateOrderNotes(rawNotes);
    if (!notesResult.ok) {
      return NextResponse.json({ error: notesResult.error }, { status: 400 });
    }
    const orderNotes = notesResult.notes;

    if (!lensType || !quantity || quantity <= 0) {
      return NextResponse.json(
        { error: "lensType and a valid quantity are required." },
        { status: 400 }
      );
    }

    if (session.role !== "CUSTOMER" && !userId && (!user || !user.name || !user.email)) {
      return NextResponse.json(
        { error: "Either userId or user details (name, email) are required when not acting as a customer." },
        { status: 400 }
      );
    }

    if (!Object.values(LensType).includes(lensType as LensType)) {
      return NextResponse.json({ error: "Invalid lensType." }, { status: 400 });
    }

    if (!lensId) {
      return NextResponse.json(
        { error: "lensId is required. Please update the app and add the item to cart again." },
        { status: 400 }
      );
    }

    const orderUserId = session.role === "CUSTOMER" ? session.userId : userId;

    const targetCustomerId =
      session.role === "CUSTOMER"
        ? session.userId
        : typeof orderUserId === "string" && orderUserId.trim()
          ? orderUserId.trim()
          : null;

    let reservation = null;
    if (targetCustomerId && typeof cartLineKey === "string" && cartLineKey.trim()) {
      reservation = await prisma.cartReservation.findUnique({
        where: {
          userId_cartLineKey: {
            userId: targetCustomerId,
            cartLineKey: cartLineKey.trim(),
          },
        },
      });
    }

    const lens = await resolveLensForOrder(lensType as LensType, Number(quantity), lensId);

    if (!lens) {
      return NextResponse.json({ error: "Lens not found. Remove the item from cart and add it again from Shop." }, { status: 404 });
    }

    const resolvedLensId = reservation?.lensId ?? lens.id;
    const orderQty = Number(quantity);
    const followsCustomerProcurementFlow = session.role === "CUSTOMER" || Boolean(targetCustomerId);
    const reservedQty = await computeOrderReservedQuantity(
      lensType as LensType,
      resolvedLensId,
      lens.quantity,
      orderQty
    );
    const needsProcurement = followsCustomerProcurementFlow && reservedQty < orderQty;

    if (!needsProcurement && reservedQty < orderQty && !followsCustomerProcurementFlow) {
      const productHint =
        lensType === LensType.SINGLE_VISION && "brand" in lens
          ? ` (${lens.brand} · ${lens.coating}, SPH ${lens.sph}, CYL ${lens.cyl ?? "—"})`
          : "";
      return NextResponse.json(
        {
          error: `Insufficient stock${productHint}. Available: ${reservedQty}. Check inventory for duplicate rows with the same prescription.`,
        },
        { status: 400 }
      );
    }

    const unitPrice = lens.price;
    const totalAmount = orderTotalFromPairPrice(Number(unitPrice), orderQty);
    const prescription = resolveOrderPrescription(reservation, body, lens);
    // Delivery service chosen at order time; charge calculated after packing.
    let deliveryServiceId: string | null = null;
    if (typeof rawDeliveryServiceId === "string" && rawDeliveryServiceId.trim()) {
      const service = await prisma.deliveryService.findUnique({
        where: { id: rawDeliveryServiceId.trim() },
      });
      if (!service || !service.isActive) {
        return NextResponse.json({ error: "Selected delivery service is not available." }, { status: 400 });
      }
      deliveryServiceId = service.id;
    }
    const orderReference = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orderNumber = await generateUniqueOrderNumber();
    const normalizedBatchId =
      typeof checkoutBatchId === "string" && checkoutBatchId.trim()
        ? checkoutBatchId.trim().slice(0, 64)
        : null;

    // Resolve User (Customer) — never assign the staff actor as Order.userId.
    let resolvedUserId = orderUserId;
    
    if (session.role === "CUSTOMER") {
      resolvedUserId = session.userId;
    } else if (typeof resolvedUserId === "string" && resolvedUserId.trim()) {
      const onBehalf = await prisma.user.findUnique({
        where: { id: resolvedUserId.trim() },
      });
      if (!onBehalf || onBehalf.role !== "CUSTOMER") {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      if (!isCustomerApproved(onBehalf)) {
        return NextResponse.json(
          {
            error:
              "This customer cannot place orders (pending approval, rejected, or suspended).",
          },
          { status: 403 }
        );
      }
      resolvedUserId = onBehalf.id;
    } else if (!resolvedUserId) {
      // Check if user already exists by email first
      if (!user?.email || !user?.name) {
        return NextResponse.json(
          { error: "Customer userId or user details are required." },
          { status: 400 }
        );
      }
      const existingUser = await prisma.user.findUnique({ where: { email: user.email } });
      if (existingUser) {
        if (existingUser.role !== "CUSTOMER" || !isCustomerApproved(existingUser)) {
          return NextResponse.json(
            {
              error:
                "This customer cannot place orders (pending approval, rejected, or suspended).",
            },
            { status: 403 }
          );
        }
        resolvedUserId = existingUser.id;
      } else {
        const newUser = await prisma.user.create({
          data: {
            name: user.name,
            email: user.email,
            password: user.password || "defaultPassword123!", // Should be hashed in a real scenario
            role: "CUSTOMER",
          },
        });
        resolvedUserId = newUser.id;
      }
    }

    const attribution = resolveOrderAttribution({
      session: { role: session.role, userId: session.userId },
      customerUserId: String(resolvedUserId),
    });

    // Perform sequential operations to avoid Supabase connection pooler limits (P2028)
    
    // 1. Create Income Transaction
    const newTransaction = await prisma.transaction.create({
      data: {
        reference: orderReference,
        amount: totalAmount,
        currency: "INR",
        type: TransactionType.CREDIT,
        status: TransactionStatus.COMPLETED,
        description: `Sale for order: ${orderReference}`,
        userId: session.userId,
      },
    });

    // 2. Create Ledger Entry for the Income
    await prisma.ledgerEntry.create({
      data: {
        transactionId: newTransaction.id,
        entryType: LedgerEntryType.CREDIT,
        amount: totalAmount,
        description: `Sale for order: ${orderReference}`,
      },
    });

    // 3. Create Order
    const assignedToId = await resolveOrderAssigneeId({
      checkoutBatchId: normalizedBatchId,
    });
    const cutoffSlot = await dispatchSlotForNow();
    const newOrder = await prisma.order.create({
      data: {
        orderNumber,
        checkoutBatchId: normalizedBatchId,
        userId: resolvedUserId as string,
        ...assignmentCreateFields(assignedToId),
        ...attribution,
        lineType: CartLineType.RETAIL,
        lensType: lensType as LensType,
        singleVisionLensId: lensType === LensType.SINGLE_VISION ? resolvedLensId : null,
        kryptokLensId: lensType === LensType.KRYPTOK ? resolvedLensId : null,
        progressiveLensId: lensType === LensType.PROGRESSIVE ? resolvedLensId : null,
        quantity: orderQty,
        reservedQuantity: reservedQty,
        pickedQuantity: 0,
        unitPrice: Number(unitPrice),
        totalAmount: totalAmount,
        sph: prescription.sph,
        cyl: prescription.cyl,
        axis: prescription.axis,
        add: prescription.add,
        eye: prescription.eye,
        status: needsProcurement ? OrderStatus.AWAITING_PROCUREMENT : OrderStatus.PENDING,
        notes: orderNotes,
        transactionId: newTransaction.id,
        deliveryServiceId,
        ...cutoffSlot,
      },
    });

    await createOriginalPowerVersion(prisma, newOrder, session.userId);

    const redemptionCustomerId =
      session.role === "CUSTOMER" ? session.userId : (resolvedUserId as string);
    const redemption = await resolveCheckoutRedemption({
      customerId: redemptionCustomerId,
      redeemPoints: session.role === "CUSTOMER" ? redeemPoints : null,
      orderGross: totalAmount,
    });
    if (redemption.error) {
      return NextResponse.json({ error: redemption.error }, { status: 400 });
    }

    const { invoiceId } = await createInvoiceFromOrder({
      orderId: newOrder.id,
      markPaid: newOrder.status === OrderStatus.COMPLETED,
      loyaltyDiscount: redemption.loyaltyDiscount,
    });
    const newInvoice = { id: invoiceId };

    await applyOrderRedemption({
      customerId: redemptionCustomerId,
      orderId: newOrder.id,
      invoiceId,
      loyaltyDiscount: redemption.loyaltyDiscount,
    });

    // 5. Stock is reserved on the order (reservedQuantity) and reduced when staff marks packed.

    if (targetCustomerId && typeof cartLineKey === "string" && cartLineKey.trim()) {
      await consumeCartReservation(targetCustomerId, cartLineKey.trim());
    }

    const customer = await prisma.user.findUnique({
      where: { id: resolvedUserId as string },
      select: { name: true, email: true, businessName: true },
    });
    const customerLabel =
      customer?.businessName?.trim() ||
      customer?.name?.trim() ||
      customer?.email ||
      "A customer";

    if (targetCustomerId) {
      await notifyStaffOfNewOrder(newOrder.id, customerLabel, assignedToId);
    }

    const actor = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    });
    const actorLabel = actor?.name?.trim() || actor?.email || null;
    const activityMessage = buildOnBehalfActivityMessage({
      orderNumber: newOrder.orderNumber,
      orderId: newOrder.id,
      customerLabel,
      sessionRole: session.role,
      actorLabel,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_CREATED,
      module: AuditModule.ORDER,
      entityType: "Order",
      entityId: newOrder.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: session.userId,
        actorName: actorLabel,
      },
      context: {
        orderNumber: newOrder.orderNumber,
        orderSource: attribution.orderSource,
        customerUserId: resolvedUserId,
        placedByUserId: attribution.placedByUserId,
        lensType,
        quantity: orderQty,
        status: newOrder.status,
      },
      activityMessage,
      message: `Order created (${newOrder.status})`,
    });

    // Avoid duplicate activity when audit already covers create; only log OrderActivity for on-behalf.
    if (attribution.placedByUserId) {
      await logOrderActivity(prisma, {
        orderId: newOrder.id,
        actorUserId: session.userId,
        action: "ORDER_CREATED_ON_BEHALF",
        message: activityMessage,
        metadata: {
          orderSource: attribution.orderSource,
          customerUserId: resolvedUserId,
        },
      });
    }

    return NextResponse.json({ order: newOrder, transaction: newTransaction, invoice: newInvoice }, { status: 201 });
  } catch (error) {
    console.error("POST /api/orders error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    if (message.includes("loyalty") || message.includes("X Points") || message.includes("redeem")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
