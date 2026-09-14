import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../lib/session-auth";

import { prisma } from "../../../../lib/prisma";
import {
  RETURN_ALLOWED_IMAGE_TYPES,
  RETURN_MAX_IMAGE_BYTES,
  appendReturnTimelineEvent,
} from "../../../../lib/returns";
import {
  getSignedOrderImageUrl,
  uploadReturnRequestImage,
} from "../../../../lib/supabase-storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const request = await prisma.returnRequest.findUnique({
    where: { id },
    select: { id: true, customerId: true, assignedEmployeeId: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Return request not found." }, { status: 404 });
  }

  const allowed =
    session.role === "ADMIN" ||
    request.customerId === session.userId ||
    request.assignedEmployeeId === session.userId;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("photo");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const mime = (file.type || "image/jpeg").toLowerCase();
    if (!RETURN_ALLOWED_IMAGE_TYPES.has(mime)) {
      return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
    }
    if (file.size > RETURN_MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 400 });
    }

    const storedImageUrl = await uploadReturnRequestImage(id, file);
    const signedImageUrl = await getSignedOrderImageUrl(storedImageUrl);

    const created = await prisma.$transaction(async (tx) => {
      const image = await tx.returnRequestImage.create({
        data: {
          returnRequestId: id,
          uploadedByUserId: session.userId,
          imageUrl: storedImageUrl,
        },
      });

      await appendReturnTimelineEvent(tx, {
        returnRequestId: id,
        actorUserId: session.userId,
        eventType: "PHOTO_ADDED",
        message: "Added return evidence photo.",
      });

      return image;
    });

    return NextResponse.json(
      {
        ...created,
        imageUrl: signedImageUrl,
        storedImageUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/returns/[id]/images error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
