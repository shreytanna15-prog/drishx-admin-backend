import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { getSessionOrUnauthorized } from "../../lib/session-auth";
import { notifyEmployeeOfTaskAssigned } from "../../lib/staff-notifications";
import { requireStaffPermission } from "../../lib/staff-access";

function parseDueDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeTitle(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeDetails(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// GET /api/tasks
// ADMIN: all tasks (optional ?employeeId=)
// EMPLOYEE: only own tasks
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "tasks.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId");
    const where =
      session.role === "EMPLOYEE"
        ? { assignedToId: session.userId }
        : employeeId
          ? { assignedToId: employeeId }
          : undefined;

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        assignedBy: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/tasks
// ADMIN only: assign task to employee
// Body: { assignedToId, title, details?, dueDate }
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const assignedToId = typeof body?.assignedToId === "string" ? body.assignedToId.trim() : "";
    const title = sanitizeTitle(body?.title);
    const details = sanitizeDetails(body?.details);
    const dueDate = parseDueDate(body?.dueDate);

    if (!assignedToId || !title || !dueDate) {
      return NextResponse.json(
        { error: "assignedToId, title and dueDate are required." },
        { status: 400 }
      );
    }
    if (title.length > 180) {
      return NextResponse.json({ error: "Title must be <= 180 characters." }, { status: 400 });
    }
    if (details && details.length > 2000) {
      return NextResponse.json({ error: "Details must be <= 2000 characters." }, { status: 400 });
    }

    const employee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, role: true, isActive: true },
    });
    if (!employee || employee.role !== "EMPLOYEE" || !employee.isActive) {
      return NextResponse.json({ error: "Valid active employee is required." }, { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        assignedToId,
        assignedById: session.userId,
        title,
        details,
        dueDate,
        status: TaskStatus.PENDING,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        assignedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await notifyEmployeeOfTaskAssigned(task.id, assignedToId, title, dueDate);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
