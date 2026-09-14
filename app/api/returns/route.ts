import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../lib/session-auth";

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
} from "../../lib/returns";
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

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "returns.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const orderId = searchParams.get("orderId");
    const where =
      session.role === "CUSTOMER"
        ? { customerId: session.userId }
        : session.role === "EMPLOYEE"
          ? { assignedEmployeeId: session.userId }
          : {};

    const requests = await prisma.returnRequest.findMany({
      where: {
        ...where,
        ...(status &&
        (Object.values(ReturnRequestStatus) as string[]).includes(status)
          ? { status: status as (typeof ReturnRequestStatus)[keyof typeof ReturnRequestStatus] }
          : {}),
        ...(orderId ? { items: { some: { originalOrderId: orderId } } } : {}),
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    const serialized = await Promise.all(
      requests.map(async (request) =>
        serializeReturnRequest(await getReturnRequestWithRelations(request.id))
      )
    );

    return NextResponse.json(serialized.filter(Boolean));
  } catch (error) {
    console.error("GET /api/returns error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
          quantity <= 0 ||
          quantity > Number(order.quantity)
        ) {
          throw new Error("Invalid return item.");
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

    const created = await prisma.$transaction(async (tx) => {
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
    console.error("POST /api/returns error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
