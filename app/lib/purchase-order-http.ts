import { NextRequest, NextResponse } from "next/server";
import { PurchaseOrderStatus, type LensType } from "@prisma/client";
import { getSessionOrUnauthorized } from "./session-auth";
import { requireStaffPermission } from "./staff-access";
import { actorFromSession } from "./audit";
import { PurchaseOrderError, type DraftLineInput } from "./purchase-orders";
import { isProcurementLensType } from "./procurement-lens";
import { GoodsReceiptError } from "./goods-receipts";
import { ProcurementDocumentError } from "./procurement-documents";

export async function requireProcurementView(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error as NextResponse };
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.view");
    if ("error" in gate) return { error: gate.error };
  }
  return {
    session,
    actor: actorFromSession(session),
  };
}

export async function requireProcurementApprove(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error as NextResponse };
  const session = auth.session;
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.approve");
    if ("error" in gate) return { error: gate.error };
  }
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  return {
    session,
    actor: actorFromSession(session),
  };
}

/**
 * Receiving goods (upload / reconcile / discard drafts): ADMIN, or EMPLOYEE
 * with `procurement.intake`. Confirm Receipt still needs approve.
 */
export async function requireProcurementIntake(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error as NextResponse };
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.intake");
    if ("error" in gate) return { error: gate.error };
  }
  return {
    session,
    actor: actorFromSession(session),
  };
}

export function purchaseOrderErrorResponse(error: unknown) {
  if (
    error instanceof GoodsReceiptError ||
    error instanceof ProcurementDocumentError
  ) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (error instanceof PurchaseOrderError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  console.error("Purchase order error:", error);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}

export function parsePoStatus(raw: string | null): PurchaseOrderStatus | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return (Object.values(PurchaseOrderStatus) as string[]).includes(upper)
    ? (upper as PurchaseOrderStatus)
    : undefined;
}

export function parseDraftLines(raw: unknown): DraftLineInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new PurchaseOrderError("Add at least one line.", 400, "PO_EMPTY");
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new PurchaseOrderError(`Invalid line at index ${index}.`, 400);
    }
    const row = item as Record<string, unknown>;
    if (!isProcurementLensType(row.lensType)) {
      throw new PurchaseOrderError(
        `Line ${index + 1}: lensType must be SINGLE_VISION, KRYPTOK or PROGRESSIVE.`,
        400
      );
    }
    if (typeof row.lensId !== "string" || !row.lensId.trim()) {
      throw new PurchaseOrderError(`Line ${index + 1}: lensId is required.`, 400);
    }
    const poQuantity = Number(row.poQuantity);
    const requiredQuantity = Number(
      row.requiredQuantity != null ? row.requiredQuantity : row.poQuantity
    );
    if (!Number.isInteger(poQuantity) || poQuantity <= 0) {
      throw new PurchaseOrderError(
        `Line ${index + 1}: poQuantity must be a positive whole number.`,
        400
      );
    }
    if (!Number.isInteger(requiredQuantity) || requiredQuantity < 0) {
      throw new PurchaseOrderError(
        `Line ${index + 1}: requiredQuantity must be a whole number ≥ 0.`,
        400
      );
    }
    let rate: number | null = null;
    if (row.rate != null && row.rate !== "") {
      rate = Number(row.rate);
      if (!Number.isFinite(rate) || rate < 0) {
        throw new PurchaseOrderError(`Line ${index + 1}: rate is invalid.`, 400);
      }
    }
    return {
      lensType: row.lensType as LensType,
      lensId: row.lensId.trim(),
      requiredQuantity,
      poQuantity,
      rate,
      procurementRequestId:
        typeof row.procurementRequestId === "string"
          ? row.procurementRequestId
          : null,
      productLabel:
        typeof row.productLabel === "string" ? row.productLabel : null,
      rangeLabel: typeof row.rangeLabel === "string" ? row.rangeLabel : null,
      powerLabel: typeof row.powerLabel === "string" ? row.powerLabel : null,
    };
  });
}
