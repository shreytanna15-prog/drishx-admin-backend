import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  serializeOrderPrescription,
  serializeWholesaleLineItem,
} from "./serialize-order";
import { getSignedOrderImageUrl } from "./supabase-storage";
import { sanitizeOrderForRole } from "./order-activity";
import { serializeDeliveryService } from "./delivery-service";
import { serializeDeliveryForRole } from "./delivery-pack";

export const orderDetailInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      businessName: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      status: true,
      issuedAt: true,
    },
  },
  singleVisionLens: true,
  kryptokLens: true,
  progressiveLens: true,
  oriVisionLens: true,
  magnusLens: true,
  bifocalLens: true,
  wholesaleLineItems: {
    orderBy: { createdAt: "asc" as const },
  },
  activityLogs: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: {
      actor: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  },
  returnRequests: {
    select: {
      id: true,
      requestNumber: true,
      status: true,
      requestType: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
  powerVersions: {
    orderBy: { versionNumber: "asc" as const },
  },
  alternateSuggestions: {
    where: { status: "PENDING" as const },
    orderBy: [{ availability: "asc" as const }, { distanceScore: "asc" as const }],
  },
  deliveryService: true,
  delivery: true,
} satisfies Prisma.OrderInclude;

export async function serializeOrderDetail(
  order: NonNullable<
    Awaited<
      ReturnType<
        typeof prisma.order.findUnique<{
          where: { id: string };
          include: typeof orderDetailInclude;
        }>
      >
    >
  >,
  role: string
) {
  const payload = {
    ...order,
    ...serializeOrderPrescription(order),
    wholesaleLineItems: order.wholesaleLineItems.map(serializeWholesaleLineItem),
    unitPrice: Number(order.unitPrice),
    totalAmount: Number(order.totalAmount),
    invoice: order.invoice
      ? {
          ...order.invoice,
          amount: Number(order.invoice.amount),
          issuedAt: order.invoice.issuedAt
            ? order.invoice.issuedAt.toISOString()
            : null,
        }
      : null,
    orderImageUrl: order.orderImageUrl
      ? await getSignedOrderImageUrl(order.orderImageUrl)
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    assignedAt: order.assignedAt?.toISOString() ?? null,
    activityLogs: order.activityLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    returnRequests: order.returnRequests.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    powerVersions: (order.powerVersions ?? []).map((v) => ({
      ...v,
      sph: v.sph !== null ? Number(v.sph) : null,
      cyl: v.cyl !== null ? Number(v.cyl) : null,
      add: v.add !== null ? Number(v.add) : null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      acceptedAt: v.acceptedAt?.toISOString() ?? null,
      supersededAt: v.supersededAt?.toISOString() ?? null,
    })),
    alternateSuggestions: (order.alternateSuggestions ?? []).map((s) => ({
      ...s,
      sph: Number(s.sph),
      cyl: s.cyl !== null ? Number(s.cyl) : null,
      add: s.add !== null ? Number(s.add) : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    deliveryService: order.deliveryService
      ? serializeDeliveryService(order.deliveryService as Parameters<typeof serializeDeliveryService>[0])
      : null,
    delivery: serializeDeliveryForRole(
      order.delivery as unknown as Record<string, unknown> | null,
      role
    ),
  };

  return sanitizeOrderForRole(payload, role);
}