import { NextRequest, NextResponse } from "next/server";
import { LensType } from "@prisma/client";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import {
  actorFromSession,
  buildAuditRequestContext,
} from "../../../../lib/audit";
import {
  listReorderRules,
  recordReorderRuleChange,
  upsertReorderRule,
  validateReorderRule,
} from "../../../../lib/reorder-rules";
import {
  formatLensLabel,
  isProcurementLensType,
  readLensDescriptor,
} from "../../../../lib/procurement-lens";
import type { ReorderRuleInput } from "../../../../lib/reorder-rules";

type BulkItem = {
  lensType: unknown;
  lensId: unknown;
  minStock: unknown;
  targetStock: unknown;
  autoProcure?: unknown;
  preferredSupplierId?: unknown;
  moq?: unknown;
};

/**
 * POST /api/inventory/reorder-rules/bulk
 * Access: ADMIN only.
 *
 * Saves the whole Reorder Rules grid in one call. Every item is validated
 * first so a single bad row cannot leave the grid half-applied; the write
 * itself runs in one transaction.
 */
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
    const items = Array.isArray(body?.items) ? (body.items as BulkItem[]) : null;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "items[] is required." }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json(
        { error: "Too many rows in one save (max 500)." },
        { status: 400 }
      );
    }

    // ── Validate everything before writing anything ───────────────────────
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const error = validateReorderRule(item);
      if (error) {
        return NextResponse.json({ error: `Row ${i + 1}: ${error}` }, { status: 400 });
      }
      if (!isProcurementLensType(item.lensType)) {
        return NextResponse.json(
          {
            error: `Row ${i + 1}: reorder rules are only supported for Single Vision, Kryptok and Progressive lenses.`,
          },
          { status: 400 }
        );
      }
    }

    const lensIds = Array.from(
      new Set(items.map((item) => String(item.lensId)))
    );
    const lensRows = await Promise.all(
      items.map((item: BulkItem) =>
        readLensDescriptor(prisma, item.lensType as LensType, String(item.lensId))
      )
    );
    const missingIndex = lensRows.findIndex((row) => row === null);
    if (missingIndex >= 0) {
      return NextResponse.json(
        { error: `Row ${missingIndex + 1}: lens ${lensIds[missingIndex]} not found.` },
        { status: 404 }
      );
    }

    const beforeRules = await prisma.reorderRule.findMany({
      where: {
        lensId: { in: lensIds },
      },
    });
    const beforeByKey = new Map<string, (typeof beforeRules)[number]>(
      beforeRules.map((rule) => [`${rule.lensType}:${rule.lensId}`, rule])
    );

    const saved = await prisma.$transaction(async (tx) => {
      const results: Array<{ lensType: LensType; lensId: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const lensType = item.lensType as LensType;
        const lensId = String(item.lensId);
        const before = beforeByKey.get(`${lensType}:${lensId}`);
        const lens = lensRows[i];

        const input: ReorderRuleInput = {
          lensType,
          lensId,
          minStock: Number(item.minStock),
          targetStock: Number(item.targetStock),
          autoProcure: typeof item.autoProcure === "boolean" ? item.autoProcure : false,
          preferredSupplierId:
            typeof item.preferredSupplierId === "string" && item.preferredSupplierId
              ? item.preferredSupplierId
              : null,
          moq:
            item.moq === undefined || item.moq === null || item.moq === ""
              ? null
              : Number(item.moq),
        };

        const rule = await upsertReorderRule(input, tx);

        await recordReorderRuleChange({
          before: before
            ? {
                minStock: before.minStock,
                targetStock: before.targetStock,
                autoProcure: before.autoProcure,
                preferredSupplierId: before.preferredSupplierId,
                moq: before.moq,
                isActive: before.isActive,
              }
            : null,
          after: {
            minStock: rule.minStock,
            targetStock: rule.targetStock,
            autoProcure: rule.autoProcure,
            preferredSupplierId: rule.preferredSupplierId,
            moq: rule.moq,
            isActive: rule.isActive,
          },
          lensType,
          lensId,
          lensLabel: lens
            ? formatLensLabel(lensType, lens)
            : null,
          actor: actorFromSession(session),
          request: buildAuditRequestContext(req),
          client: tx,
        });

        results.push({ lensType, lensId });
      }

      return results;
    });

    const rules = await listReorderRules();

    return NextResponse.json({ saved: saved.length, rules });
  } catch (error) {
    console.error("POST /api/inventory/reorder-rules/bulk error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal Server Error" },
      { status: 400 }
    );
  }
}
