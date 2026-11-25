import { NextRequest, NextResponse } from "next/server";
import {
  LensType,
  ProcurementPriority,
  ProcurementRequestSource,
  type Prisma,
} from "@prisma/client";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { requireStaffPermission } from "../../../lib/staff-access";
import { prisma } from "../../../lib/prisma";
import { buildAuditRequestContext } from "../../../lib/audit";
import {
  createManualProcurementRequest,
  OPEN_REQUEST_STATUSES,
} from "../../../lib/procurement-requests";
import {
  buildProcurementRequestListWhere,
  parseProcurementRequestStatusQuery,
} from "../../../lib/procurement-request-filters";
import {
  formatLensLabel,
  isProcurementLensType,
  readLensDescriptor,
} from "../../../lib/procurement-lens";
import {
  addCatalogItemsToProcurementCart,
  updateProcurementCartItems,
  type CatalogCartItemInput,
} from "../../../lib/catalog/catalog-procurement-cart";
import { actorFromSession } from "../../../lib/audit";

const SOURCES = Object.values(ProcurementRequestSource);
const PRIORITIES = Object.values(ProcurementPriority);
const LENS_TYPES = Object.values(LensType);

function oneOf<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : undefined;
}

// ─────────────────────────────────────────────────────────────
// GET /api/procurement/requests
// Access: ADMIN | EMPLOYEE (procurement.view)
// ─────────────────────────────────────────────────────────────
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
    const gate = await requireStaffPermission(session, "procurement.view");
    if ("error" in gate) return gate.error;
  }

  const params = req.nextUrl.searchParams;

  const source = oneOf(params.get("source"), SOURCES);
  const statusParse = parseProcurementRequestStatusQuery(params.get("status"));
  if (!statusParse.ok) {
    return NextResponse.json(
      { error: statusParse.error },
      { status: statusParse.httpStatus }
    );
  }
  const status = statusParse.status;
  const priority = oneOf(params.get("priority"), PRIORITIES);
  const lensType = oneOf(params.get("lensType"), LENS_TYPES);

  if (params.get("source") && !source) {
    return NextResponse.json({ error: "Invalid source filter." }, { status: 400 });
  }
  if (params.get("priority") && !priority) {
    return NextResponse.json({ error: "Invalid priority filter." }, { status: 400 });
  }
  if (params.get("lensType") && !lensType) {
    return NextResponse.json({ error: "Invalid lensType filter." }, { status: 400 });
  }

  const openOnly = params.get("openOnly") === "true";
  const orderId = params.get("orderId")?.trim();
  const limit = Math.min(Math.max(Number(params.get("limit")) || 100, 1), 500);

  const dateFrom = parseDate(params.get("dateFrom"));
  const dateTo = parseDate(params.get("dateTo"));

  // Status + openOnly must AND (never overwrite). Selecting Open with
  // "Unresolved only" must return only OPEN rows, not APPROVED.
  const where: Prisma.ProcurementRequestWhereInput =
    buildProcurementRequestListWhere({
      source,
      status,
      priority,
      lensType,
      orderId,
      openOnly,
      dateFrom,
      dateTo,
    });

  try {
    const [requests, grouped] = await Promise.all([
      prisma.procurementRequest.findMany({
        where,
        include: {
          order: { select: { id: true, orderNumber: true, status: true } },
          reorderRule: { select: { id: true, minStock: true, targetStock: true } },
          supplier: { select: { id: true, name: true } },
          lensProductPower: {
            include: {
              preferredSupplier: { select: { id: true, name: true } },
              lensProductVariant: {
                select: {
                  id: true,
                  skuCode: true,
                  name: true,
                  axis: true,
                  eye: true,
                  addition: { select: { value: true } },
                  product: {
                    select: {
                      id: true,
                      family: { select: { code: true, name: true } },
                      base: { select: { name: true } },
                      coating: { select: { name: true } },
                      color: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: limit,
      }),
      prisma.procurementRequest.groupBy({
        by: ["status"],
        where: { status: { in: [...OPEN_REQUEST_STATUSES] } },
        _count: { _all: true },
      }),
    ]);

    // Attach lens labels (brand / coating / power) for display + power filtering.
    const lensKeys = Array.from(
      new Set(requests.filter((r) => r.lensType && r.lensId).map((r) => `${r.lensType}:${r.lensId}`))
    );
    const lensDetails = await Promise.all(
      lensKeys.map((key) => {
        const [type, id] = key.split(":");
        return readLensDescriptor(prisma, type as LensType, id);
      })
    );
    const lensByKey = new Map(
      lensKeys.map((key, index) => [key, lensDetails[index]])
    );

    const rows = requests.map((request) => {
      const lens = lensByKey.get(`${request.lensType}:${request.lensId}`);
      const leaf = request.lensProductPower;
      const variant = leaf?.lensProductVariant;
      const productName = variant
        ? [
            variant.product.family.name,
            variant.product.base.name,
            variant.product.coating?.name,
            variant.product.color?.name,
          ]
            .filter(Boolean)
            .join(" · ")
        : null;
      const catalogLabel = variant
        ? [variant.skuCode, productName].filter(Boolean).join(" · ")
        : null;
      const resolvedSupplier =
        request.supplier ?? leaf?.preferredSupplier ?? null;
      return {
        ...request,
        supplierId: resolvedSupplier?.id ?? request.supplierId ?? null,
        supplierName: resolvedSupplier?.name ?? null,
        productId: variant?.product.id ?? null,
        productName,
        familyCode: variant?.product.family.code ?? null,
        skuCode: variant?.skuCode ?? null,
        lensLabel:
          catalogLabel ??
          (lens && request.lensType ? formatLensLabel(request.lensType, lens) : null),
        power: leaf
          ? {
              sph: Number(leaf.sph),
              cyl: Number(leaf.cyl),
              crossPower: null,
              add: variant?.addition?.value != null ? Number(variant.addition.value) : null,
              eye: variant?.eye ?? null,
              axis: variant?.axis ?? null,
            }
          : lens
          ? {
              sph: lens.sph,
              cyl: lens.cyl,
              crossPower: lens.crossPower,
              add: lens.add,
              eye: lens.eye,
            }
          : null,
        outstandingQuantity: Math.max(
          0,
          request.requestedQuantity - request.receivedQuantity
        ),
      };
    });

    const summary = {
      open: 0,
      underReview: 0,
      approved: 0,
      critical: 0,
    };
    for (const row of grouped) {
      if (row.status === "OPEN") summary.open = row._count._all;
      if (row.status === "UNDER_REVIEW") summary.underReview = row._count._all;
      if (row.status === "APPROVED") summary.approved = row._count._all;
    }
    summary.critical = await prisma.procurementRequest.count({
      where: {
        status: { in: [...OPEN_REQUEST_STATUSES] },
        priority: ProcurementPriority.CRITICAL,
      },
    });

    return NextResponse.json({ requests: rows, summary, count: rows.length });
  } catch (error) {
    console.error("GET /api/procurement/requests error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ─────────────────────────────────────────────────────────────
// POST /api/procurement/requests
// Access: ADMIN | EMPLOYEE (procurement.view)
// Manual procurement requirement (procurement PDF §2.3).
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const body = await req.json();

    // Catalog Procurement Cart path: single or batch `{ items: [...] }` or `{ powerId / variantId }`
    if (
      Array.isArray(body?.items) ||
      typeof body?.powerId === "string" ||
      typeof body?.variantId === "string"
    ) {
      const rawItems: unknown[] = Array.isArray(body?.items)
        ? body.items
        : [body];
      const priority =
        oneOf(body?.priority, PRIORITIES) ?? ProcurementPriority.NORMAL;
      const cartItems: CatalogCartItemInput[] = rawItems.map((entry) => {
        const rec = (entry ?? {}) as Record<string, unknown>;
        return {
          powerId: typeof rec.powerId === "string" ? rec.powerId : undefined,
          variantId:
            typeof rec.variantId === "string" ? rec.variantId : undefined,
          sph: typeof rec.sph === "number" ? rec.sph : undefined,
          cyl: typeof rec.cyl === "number" ? rec.cyl : undefined,
          quantity: Number(rec.quantity),
          supplierId:
            typeof rec.supplierId === "string"
              ? rec.supplierId
              : typeof body?.supplierId === "string"
                ? body.supplierId
                : undefined,
          priority:
            typeof rec.priority === "string"
              ? oneOf(rec.priority, PRIORITIES) ?? priority
              : priority,
          reason:
            typeof rec.reason === "string"
              ? rec.reason
              : typeof body?.reason === "string"
                ? body.reason
                : null,
        };
      });

      const result = await addCatalogItemsToProcurementCart({
        items: cartItems,
        approveImmediately: session.role === "ADMIN" && body?.approveImmediately !== false,
        actor: actorFromSession(session),
        request: buildAuditRequestContext(req),
      });

      return NextResponse.json(result, { status: 201 });
    }

    if (!isProcurementLensType(body?.lensType)) {
      return NextResponse.json(
        { error: "lensType must be SINGLE_VISION, KRYPTOK or PROGRESSIVE." },
        { status: 400 }
      );
    }
    if (typeof body?.lensId !== "string" || !body.lensId.trim()) {
      return NextResponse.json({ error: "lensId is required." }, { status: 400 });
    }
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: "quantity must be a whole number greater than 0." },
        { status: 400 }
      );
    }

    const priority = oneOf(body.priority, PRIORITIES) ?? ProcurementPriority.NORMAL;

    const created = await createManualProcurementRequest({
      lensType: body.lensType,
      lensId: body.lensId.trim(),
      quantity,
      priority,
      orderId: typeof body.orderId === "string" ? body.orderId : null,
      reason: typeof body.reason === "string" ? body.reason : null,
      actorUserId: session.userId,
      request: buildAuditRequestContext(req),
    });

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/procurement/requests error:", error);
    const message = (error as Error).message;
    if (message === "Lens not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: message || "Internal Server Error" },
      { status: 400 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/procurement/requests
// Access: ADMIN | EMPLOYEE (procurement.view)
// Bulk-assign supplier or update requestedQuantity on open cart items.
// ─────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "procurement.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      ids?: string[];
      supplierId?: string | null;
      requestedQuantity?: number;
    } | null;

    const ids = Array.isArray(body?.ids)
      ? body.ids.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];

    const result = await updateProcurementCartItems({
      ids,
      supplierId: body?.supplierId,
      requestedQuantity: body?.requestedQuantity,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/procurement/requests error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal Server Error" },
      { status: 400 }
    );
  }
}
