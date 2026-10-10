import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../lib/session-auth";

import { prisma } from "../../lib/prisma";
import { isCustomerApproved } from "../../lib/user-public";
import {
  getSignedOrderImageUrl,
  uploadColorReferenceImage,
} from "../../lib/supabase-storage";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);

// POST /api/color-references — upload a lens color reference image to Supabase
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
      if (!customer || !isCustomerApproved(customer)) {
        return NextResponse.json(
          { error: "Your account is pending admin approval. You cannot upload images yet." },
          { status: 403 }
        );
      }
    }

    const formData = await req.formData();
    const file = formData.get("photo");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const mime = (file.type || "image/jpeg").toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPEG or PNG." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 400 });
    }

    const storedImageUrl = await uploadColorReferenceImage(session.userId, file);
    const signedImageUrl = await getSignedOrderImageUrl(storedImageUrl);

    return NextResponse.json(
      {
        imageUrl: signedImageUrl,
        storedImageUrl,
        message: "Color reference image uploaded successfully.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/color-references error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
