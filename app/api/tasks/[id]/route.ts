import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { requireStaffPermission } from "../../../lib/staff-access";

const ALLOWED_STATUSES: TaskStatus[] = [TaskStatus.PENDING, TaskStatus.COMPLETED];

function parseStatus(value: unknown): TaskStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return ALLOWED_STATUSES.includes(normalized as TaskStatus) ? (normalized as TaskStatus) : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "tasks.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        assignedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (session.role === "EMPLOYEE" && task.assignedToId !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/tasks/:id
// ADMIN: can update status to PENDING/COMPLETED
// EMPLOYEE: can update only own task status to PENDING/COMPLETED
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "tasks.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const body = await req.json();
    const status = parseStatus(body?.status);
    if (!status) {
      return NextResponse.json({ error: "Invalid status. Allowed: PENDING, COMPLETED." }, { status: 400 });
    }

    const existingTask = await prisma.task.findUnique({ where: { id } });
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    if (session.role === "EMPLOYEE" && existingTask.assignedToId !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status,
        completedAt: status === TaskStatus.COMPLETED ? new Date() : null,
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error("PATCH /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ message: "Task deleted." });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
