import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../lib/audit";
import {
  ensurePricingTiersSeeded,
  PRICING_TIER_CODES,
  serializePricingTier,
} from "../../../lib/finance/pricing-tier";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    await ensurePricingTiersSeeded();
    const tiers = await prisma.pricingTier.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ tiers: tiers.map(serializePricingTier) });
  } catch (error) {
    console.error("GET /api/admin/pricing-tiers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT body: { tiers: [{ code, discountPercent }] } — updates A–F percents only.
 */
export async function PUT(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    await ensurePricingTiersSeeded();
    const body = (await req.json()) as {
      tiers?: Array<{ code?: unknown; discountPercent?: unknown }>;
    };
    const rows = Array.isArray(body.tiers) ? body.tiers : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "tiers array is required." }, { status: 400 });
    }

    const updates: Array<{ code: string; discountPercent: number }> = [];
    for (const row of rows) {
      const code = String(row.code ?? "")
        .trim()
        .toUpperCase();
      if (!(PRICING_TIER_CODES as readonly string[]).includes(code)) {
        return NextResponse.json(
          { error: `Invalid tier code: ${code}` },
          { status: 400 }
        );
      }
      const pct = Number(row.discountPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json(
          { error: `discountPercent for ${code} must be between 0 and 100.` },
          { status: 400 }
        );
      }
      updates.push({ code, discountPercent: pct });
    }

    await prisma.$transaction(
      updates.map((u) =>
        prisma.pricingTier.update({
          where: { code: u.code },
          data: { discountPercent: u.discountPercent },
        })
      )
    );

    const tiers = await prisma.pricingTier.findMany({
      orderBy: { sortOrder: "asc" },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.FINANCE,
      entityType: "PricingTier",
      entityId: "all",
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: { updates },
      activityMessage: "Pricing tiers updated",
    });

    return NextResponse.json({
      tiers: tiers.map(serializePricingTier),
      message: "Pricing tiers saved.",
    });
  } catch (error) {
    console.error("PUT /api/admin/pricing-tiers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
