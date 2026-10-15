import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { LensType } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import { generateUniqueOrderNumber } from "../../../lib/order-numbers";
import { isCustomerApproved } from "../../../lib/user-public";
import { getSignedOrderImageUrl, uploadOrderImage } from "../../../lib/supabase-storage";
import { resolveCheckoutDeliveryServiceId } from "../../../lib/delivery-pack";
import { dispatchSlotForNow } from "../../../lib/dispatch-cutoff";
import { warehouseReleaseCreateFields } from "../../../lib/prescription-order-hold";
import { resolveOrderAttribution } from "../../../lib/order-attribution";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);

// POST /api/orders/photo — upload prescription image to Supabase and create an Order row
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Only customers can submit photo orders." }, { status: 403 });
  }

  try {
    const customer = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!customer || !isCustomerApproved(customer)) {
      return NextResponse.json(
        { error: "Your account is pending admin approval. You cannot place orders yet." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("photo");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Photo file is required." }, { status: 400 });
    }

    const mime = (file.type || "image/jpeg").toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 8 MB or smaller." }, { status: 400 });
    }

    const storedImageUrl = await uploadOrderImage(session.userId, file);
    const orderNumber = await generateUniqueOrderNumber();

    let deliveryServiceId: string | null = null;
    try {
      deliveryServiceId = await resolveCheckoutDeliveryServiceId(formData.get("deliveryServiceId"));
    } catch {
      return NextResponse.json({ error: "Selected delivery service is not available." }, { status: 400 });
    }

    const attribution = resolveOrderAttribution({
      session: { role: session.role, userId: session.userId },
      customerUserId: session.userId,
    });

    // RW-05: photo prescription stays admin-held — no auto-assign / staff notify.
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: session.userId,
        ...warehouseReleaseCreateFields(),
        ...attribution,
        lensType: LensType.SINGLE_VISION,
        quantity: 0,
        unitPrice: 0,
        totalAmount: 0,
        status: "PENDING",
        deliveryServiceId,
        orderImageUrl: storedImageUrl,
        ...(await dispatchSlotForNow()),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            businessName: true,
          },
        },
      },
    });

    const signedImageUrl = await getSignedOrderImageUrl(storedImageUrl);

    return NextResponse.json(
      {
        order: {
          ...order,
          warehouseReleasedAt: null,
          orderImageUrl: signedImageUrl,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        message:
          "Your order will be placed soon. Our team will process your prescription photo.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/orders/photo error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
