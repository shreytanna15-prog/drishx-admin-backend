import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../lib/session-auth";
import { prisma } from "../../lib/prisma";

// GET /api/notifications
// Access: ADMIN | EMPLOYEE | CUSTOMER (returns only own notifications)
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/notifications
// Mark all unread notifications as read for the current user
export async function PATCH(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await prisma.notification.updateMany({
      where: { userId: session.userId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, updatedCount: result.count });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
