import { NextRequest, NextResponse } from "next/server";
import { PaymentMode } from "@prisma/client";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  confirmPaymentClaim,
  recordCustomerPayment,
  rejectPaymentClaim,
  submitPaymentClaim,
} from "@/app/lib/finance/payments";
import { prisma } from "@/app/lib/prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function parsePageLimit(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : DEFAULT_LIMIT
    )
  );
  return { page, limit, skip: (page - 1) * limit };
}

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "payments";
  const { page, limit, skip } = parsePageLimit(searchParams);

  if (kind === "claims") {
    const where =
      session.role === "CUSTOMER"
        ? { customerId: session.userId }
        : searchParams.get("status")
          ? { status: searchParams.get("status") as "PENDING" | "CONFIRMED" | "REJECTED" }
          : {};
    const [total, claims] = await Promise.all([
      prisma.paymentClaim.count({ where }),
      prisma.paymentClaim.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true, businessName: true } },
          items: { include: { invoice: { select: { id: true, invoiceNumber: true, amount: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);
    return NextResponse.json({
      items: claims,
      page,
      limit,
      hasMore: skip + claims.length < total,
      total,
    });
  }

  const where =
    session.role === "CUSTOMER" ? { customerId: session.userId } : {};
  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true, businessName: true } },
        allocations: {
          include: { invoice: { select: { id: true, invoiceNumber: true } } },
        },
      },
      orderBy: { paidAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return NextResponse.json({
    items: payments,
    page,
    limit,
    hasMore: skip + payments.length < total,
    total,
  });
}

export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const body = await req.json();
  const action = body.action as string;

  try {
    if (action === "claim" || session.role === "CUSTOMER") {
      if (session.role !== "CUSTOMER" && action === "claim") {
        // admin creating claim on behalf not needed
      }
      if (session.role === "CUSTOMER" || action === "claim") {
        const customerId =
          session.role === "CUSTOMER" ? session.userId : body.customerId;
        if (!customerId) {
          return NextResponse.json({ error: "customerId required." }, { status: 400 });
        }
        const claim = await submitPaymentClaim({
          customerId,
          amount: Number(body.amount),
          mode: (body.mode as PaymentMode) || PaymentMode.UPI,
          reference: body.reference,
          notes: body.notes,
          invoiceIds: body.invoiceIds,
        });
        await recordAuditEvent(prisma, {
          action: AuditAction.PAYMENT_CLAIM_SUBMITTED,
          module: AuditModule.FINANCE,
          entityType: "PaymentClaim",
          entityId: claim.id,
          actor: {
            actorType: "HUMAN",
            actorUserId: session.userId,
            actorName: null,
          },
          message: `Payment claim ₹${body.amount}`,
        }).catch(() => undefined);
        return NextResponse.json(claim, { status: 201 });
      }
    }

    if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (action === "confirm-claim") {
      const payment = await confirmPaymentClaim({
        claimId: body.claimId,
        reviewerId: session.userId,
        allocations: body.allocations,
      });
      await recordAuditEvent(prisma, {
        action: AuditAction.PAYMENT_CLAIM_CONFIRMED,
        module: AuditModule.FINANCE,
        entityType: "PaymentClaim",
        entityId: body.claimId,
        actor: {
          actorType: "HUMAN",
          actorUserId: session.userId,
          actorName: null,
        },
      }).catch(() => undefined);
      return NextResponse.json(payment);
    }

    if (action === "reject-claim") {
      const claim = await rejectPaymentClaim({
        claimId: body.claimId,
        reviewerId: session.userId,
        reason: body.reason,
      });
      await recordAuditEvent(prisma, {
        action: AuditAction.PAYMENT_CLAIM_REJECTED,
        module: AuditModule.FINANCE,
        entityType: "PaymentClaim",
        entityId: body.claimId,
        actor: {
          actorType: "HUMAN",
          actorUserId: session.userId,
          actorName: null,
        },
      }).catch(() => undefined);
      return NextResponse.json(claim);
    }

    // Direct admin payment record
    const payment = await recordCustomerPayment({
      customerId: body.customerId,
      amount: Number(body.amount),
      mode: (body.mode as PaymentMode) || PaymentMode.CASH,
      reference: body.reference,
      notes: body.notes,
      recordedById: session.userId,
      allocations: body.allocations,
      auditActorUserId: session.userId,
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
