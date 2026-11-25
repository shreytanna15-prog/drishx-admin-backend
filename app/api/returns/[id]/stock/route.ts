import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import { appendReturnTimelineEvent } from "@/app/lib/returns";
import { setCatalogReturnRestockedQuantity } from "@/app/lib/catalog/catalog-return-stock";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    items?: Array<{ itemId?: string; saleableQuantity?: number }>;
    reason?: string;
  } | null;
  const reason = body?.reason?.trim() ?? "";
  if (!reason || reason.length > 500 || !Array.isArray(body?.items) || !body.items.length) {
    return NextResponse.json({ error: "Reason and at least one return item are required." }, { status: 400 });
  }
  if (body.items.some((item) => !item.itemId || !Number.isInteger(item.saleableQuantity))) {
    return NextResponse.json({ error: "Each item needs a whole-number saleable quantity." }, { status: 400 });
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ReturnRequest" WHERE "id" = ${id} FOR UPDATE`;
      const request = await tx.returnRequest.findUnique({
        where: { id }, include: { items: { select: { id: true } } },
      });
      if (!request) throw new Error("Return request not found.");
      if (!["APPROVED_CREDIT", "APPROVED_REPLACEMENT", "CLOSED"].includes(request.status)) {
        throw new Error("Decide the return before correcting saleable stock.");
      }
      const allowed = new Set(request.items.map((item) => item.id));
      for (const item of body!.items!) {
        if (!allowed.has(item.itemId!)) throw new Error("Return item does not belong to this request.");
        await setCatalogReturnRestockedQuantity({
          tx, returnItemId: item.itemId!, targetQuantity: item.saleableQuantity!,
          actor: actorFromSession(auth.session!), request: buildAuditRequestContext(req), reason,
        });
      }
      await appendReturnTimelineEvent(tx, {
        returnRequestId: id, actorUserId: auth.session!.userId,
        eventType: "STOCK_CORRECTED", message: `Saleable return quantities updated: ${reason}`,
      });
    }, { maxWait: 10_000, timeout: 30_000 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update return stock.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
