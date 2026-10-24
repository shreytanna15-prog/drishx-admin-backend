import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";

import {
  getSignedOrderImageUrl,
  uploadColorReferenceImage,
} from "../../../../lib/supabase-storage";
import { assessSelfServeOrderEligibility } from "../../../../lib/customer-order-eligibility";
import { prisma } from "../../../../lib/prisma";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);

// POST /api/orders/rx/prescription — upload prescription attachment for RX orders
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const isStaff = session.role === "ADMIN" || session.role === "EMPLOYEE";
  if (session.role !== "CUSTOMER" && !isStaff) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    if (session.role === "CUSTOMER") {
      const customer = await prisma.user.findUnique({ where: { id: session.userId } });
      const selfGate = customer
        ? assessSelfServeOrderEligibility(customer)
        : ({
            ok: false as const,
            message:
              "Your account is pending admin approval. You cannot upload images yet.",
          });
      if (!selfGate.ok) {
        return NextResponse.json({ error: selfGate.message }, { status: 403 });
      }
    }

    const formData = await req.formData();
    const file = formData.get("photo");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Prescription file is required." }, { status: 400 });
    }

    const mime = (file.type || "image/jpeg").toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPEG or PNG." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File must be 8 MB or smaller." }, { status: 400 });
    }

    const storedImageUrl = await uploadColorReferenceImage(session.userId, file);
    const signedImageUrl = await getSignedOrderImageUrl(storedImageUrl);

    return NextResponse.json(
      {
        storedImageUrl,
        imageUrl: signedImageUrl,
        message: "Prescription uploaded successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/orders/rx/prescription error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
