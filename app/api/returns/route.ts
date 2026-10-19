import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../lib/session-auth";

import { prisma } from "../../lib/prisma";
import {
  appendReturnTimelineEvent,
  buildReturnRequestNumber,
  getOrderPowerSnapshot,
  getReturnRequestWithRelations,
  parseRequestedPowerInput,
  parseReturnReason,
  parseReturnRequestType,
  resolveReplacementPowerForOrder,
  ReturnRequestStatus,
  serializeReturnItemPowers,
  serializeReturnOrderContext,
} from "../../lib/returns";
import {
  buildReturnsListWhere,
  parseReturnsListParams,
  returnsListInclude,
  serializeReturnListItem,
} from "../../lib/returns-list";
import {
  aggregateQuantitiesByOrderId,
  lockOrdersForReturnEligibility,
  loadReservedReturnQuantitiesByOrderId,
  ReturnEligibilityError,
  validateRequestedReturnQuantities,
} from "../../lib/return-eligibility";
import { notifyAdminsOfReturnSubmitted, notifyCustomerOfReturnSubmittedOnBehalf } from "../../lib/staff-notifications";
import { requireStaffPermission } from "../../lib/staff-access";
import { getSignedOrderImageUrl } from "../../lib/supabase-storage";

type ReturnItemInput = {
  orderId?: unknown;
  quantity?: unknown;
  eye?: unknown;
  reason?: unknown;
  itemRemarks?: unknown;
  lensLabel?: unknown;
  requestedSph?: unknown;
  requestedCyl?: unknown;
  requestedAxis?: unknown;
  requestedAdd?: unknown;
};

async function serializeReturnRequest(
  input: Awaited<ReturnType<typeof getReturnRequestWithRelations>>
) {
  if (!input) return null;
  const images = await Promise.all(
    input.images.map(async (image) => ({
      ...image,
      imageUrl: await getSignedOrderImageUrl(image.imageUrl),
    }))
  );

  return {
    ...input,
    approvedAmount: input.approvedAmount !== null ? Number(input.approvedAmount) : null,
    primaryOrder: serializeReturnOrderContext(input.primaryOrder),
    primaryInvoice: input.primaryInvoice
      ? {
          ...input.primaryInvoice,
          amount: Number(input.primaryInvoice.amount),
        }
      : null,
    creditNote: input.creditNote
      ? {
          ...input.creditNote,
          amount: Number(input.creditNote.amount),
        }
      : null,
    items: input.items.map((item) => serializeReturnItemPowers(item)),
    images,
  };
}

// GET /api/returns — paginated summary (RW-11 Phase C)
// Fat detail + signed images remain on GET /api/returns/:id
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "returns.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const { searchParams } = new URL(req.url);
    const params = parseReturnsListParams(searchParams);
    const roleScope =
      session.role === "CUSTOMER"
        ? { customerId: session.userId }
        : session.role === "EMPLOYEE"
          ? { assignedEmployeeId: session.userId }
          : {};
    const where = buildReturnsListWhere(roleScope, params);
    const skip = (params.page - 1) * params.limit;

    const [total, rows] = await Promise.all([
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.findMany({
        where,
        include: returnsListInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: params.limit,
      }),
    ]);

    const items = rows.map(serializeReturnListItem);
    const hasMore = skip + items.length < total;

    return NextResponse.json({
      items,
      page: params.page,
      limit: params.limit,
      hasMore,
      total,
    });
  } catch (error) {
    console.error("GET /api/returns error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (
    session.role !== "CUSTOMER" &&
    session.role !== "ADMIN" &&
    session.role !== "EMPLOYEE"
  ) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const requestType = parseReturnRequestType(body?.requestType);
    const customerRemarks =
      typeof body?.customerRemarks === "string" ? body.customerRemarks.trim() : "";
    const itemsInput = (
      Array.isArray(body?.items) ? body.items : []
    ) as ReturnItemInput[];

    if (!requestType) {
      return NextResponse.json({ error: "Valid requestType is required." }, { status: 400 });
    }
    if (itemsInput.length === 0) {
      return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
    }

    const orderIds = [
      ...new Set(
        itemsInput
          .map((item) => String(item?.orderId ?? "").trim())
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const orderWhere =
      session.role === "CUSTOMER"
        ? { id: { in: orderIds }, userId: session.userId }
        : { id: { in: orderIds } };

    const orders = await prisma.order.findMany({
      where: orderWhere,
      include: {
        invoice: true,
        singleVisionLens: true,
        kryptokLens: true,
        progressiveLens: true,
      },
    });
    if (orders.length !== orderIds.length) {
      return NextResponse.json({ error: "Some requested items were not found." }, { status: 404 });
    }

    if (session.role === "EMPLOYEE") {
      const notAssigned = orders.some(
        (order) => order.assignedToId && order.assignedToId !== session.userId
      );
      if (notAssigned) {
        return NextResponse.json(
          { error: "Forbidden. Not your assigned order." },
          { status: 403 }
        );
      }
    }

    const byOrderId = new Map(orders.map((order) => [order.id, order]));
    const normalizedItems = await Promise.all(
      itemsInput.map(async (item) => {
        const orderId = String(item?.orderId ?? "").trim();
        const order = byOrderId.get(orderId);
        const reason = parseReturnReason(item?.reason);
        const quantity = Number(item?.quantity);
        if (
          !order ||
          !reason ||
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          throw new ReturnEligibilityError("Invalid return item.");
        }

        const lensLabel =
          order.singleVisionLensId ||
          order.kryptokLensId ||
          order.progressiveLensId ||
          order.oriVisionLensId ||
          order.magnusLensId ||
          order.bifocalLensId
            ? [
                order.lensType.replace(/_/g, " "),
                typeof item?.lensLabel === "string" ? item.lensLabel : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : order.lensType.replace(/_/g, " ");

        const original = getOrderPowerSnapshot(order);
        const requestedInput = parseRequestedPowerInput(item);
        const isReplacement = requestType === "REPLACEMENT";
        const resolvedRequested = isReplacement
          ? await resolveReplacementPowerForOrder(order, requestedInput, {
              required: false,
            })
          : null;

        return {
          originalOrderId: order.id,
          lensType: order.lensType,
          lensId:
            order.singleVisionLensId ??
            order.kryptokLensId ??
            order.progressiveLensId ??
            order.oriVisionLensId ??
            order.magnusLensId ??
            order.bifocalLensId ??
            null,
          lensLabel,
          quantity,
          eye:
            typeof item?.eye === "string" && item.eye.trim()
              ? item.eye.trim().toUpperCase()
              : order.eye ?? null,
          reason,
          itemRemarks:
            typeof item?.itemRemarks === "string" ? item.itemRemarks.trim() : null,
          originalSph: original.sph,
          originalCyl: original.cyl,
          originalAxis: original.axis,
          originalAdd: original.add,
          requestedSph: resolvedRequested?.sph ?? null,
          requestedCyl: resolvedRequested?.cyl ?? null,
          requestedAxis: resolvedRequested?.axis ?? null,
          requestedAdd: resolvedRequested?.add ?? null,
        };
      })
    );

    const primaryOrder = orders[0]!;
    const customerId = primaryOrder.userId;

    const requestedByOrderId = aggregateQuantitiesByOrderId(
      normalizedItems.map((item) => ({
        originalOrderId: item.originalOrderId,
        quantity: item.quantity,
      }))
    );
    const orderedQtyByOrderId = new Map(
      orders.map((order) => [order.id, Number(order.quantity)])
    );

    const created = await prisma.$transaction(async (tx) => {
      await lockOrdersForReturnEligibility(tx, [...requestedByOrderId.keys()]);
      const reservedQtyByOrderId = await loadReservedReturnQuantitiesByOrderId(
        tx,
        [...requestedByOrderId.keys()]
      );
      const qtyCheck = validateRequestedReturnQuantities({
        requestedByOrderId,
        orderedQtyByOrderId,
        reservedQtyByOrderId,
      });
      if (!qtyCheck.ok) {
        throw new ReturnEligibilityError(qtyCheck.error);
      }

      const request = await tx.returnRequest.create({
        data: {
          requestNumber: buildReturnRequestNumber(),
          customerId,
          primaryOrderId: primaryOrder.id,
          primaryInvoiceId: primaryOrder.invoice?.id ?? null,
          // Admin reviews first; employee assigned only on approval.
          assignedEmployeeId: null,
          requestType,
          status: ReturnRequestStatus.SUBMITTED,
          customerRemarks:
            customerRemarks ||
            (session.role !== "CUSTOMER"
              ? `Submitted by ${session.role.toLowerCase()} on behalf of customer.`
              : null),
          items: {
            create: normalizedItems,
          },
        },
      });

      await appendReturnTimelineEvent(tx, {
        returnRequestId: request.id,
        actorUserId: session.userId,
        eventType: "SUBMITTED",
        message:
          session.role === "CUSTOMER"
            ? `Customer submitted a ${requestType.toLowerCase()} request.`
            : `${session.role} submitted a ${requestType.toLowerCase()} request on behalf of the customer.`,
      });

      return request;
    });

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { name: true, businessName: true, email: true },
    });
    const customerLabel =
      customer?.businessName || customer?.name || customer?.email || "Customer";

    await notifyAdminsOfReturnSubmitted(
      created.id,
      created.requestNumber,
      customerLabel,
      created.primaryOrderId
    );

    if (session.role !== "CUSTOMER") {
      await notifyCustomerOfReturnSubmittedOnBehalf(
        customerId,
        created.requestNumber,
        created.primaryOrderId
      );
    }

    const full = await getReturnRequestWithRelations(created.id);
    return NextResponse.json(await serializeReturnRequest(full), { status: 201 });
  } catch (error) {
    if (error instanceof ReturnEligibilityError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/returns error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
