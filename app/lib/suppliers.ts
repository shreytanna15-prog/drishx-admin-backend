import { NextRequest, NextResponse } from "next/server";
import { Prisma, PurchaseOrderStatus, type Supplier } from "@prisma/client";
import { requireProcurementView } from "./purchase-order-http";
import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  diffFields,
  recordAuditEvent,
  type AuditActor,
  type AuditRequestContext,
} from "./audit";
import {
  checkSupplierConsistency,
  SUPPLIER_PROFILE_FIELDS,
  validateSupplierInput,
  type NormalizedSupplierInput,
} from "./supplier-profile";

/** PO statuses that still expect goods from the supplier. */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.OPEN,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

export class SupplierError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    status = 400,
    code = "SUPPLIER_ERROR",
    fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = "SupplierError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type SupplierWithOpenPos = Supplier & { openPoCount: number };

const openPoCountSelect = {
  _count: {
    select: {
      purchaseOrders: { where: { status: { in: OPEN_PO_STATUSES } } },
    },
  },
} satisfies Prisma.SupplierInclude;

type SupplierWithCount = Supplier & { _count: { purchaseOrders: number } };

function withOpenPos(row: SupplierWithCount): SupplierWithOpenPos {
  const { _count, ...rest } = row;
  return { ...rest, openPoCount: _count.purchaseOrders };
}

export function serializeSupplier(s: SupplierWithOpenPos | Supplier) {
  return {
    id: s.id,
    name: s.name,
    tradeName: s.tradeName,
    businessEntityType: s.businessEntityType,
    gstin: s.gstin,
    pan: s.pan,
    state: s.state,
    stateCode: s.stateCode,
    contactPerson: s.contactPerson,
    phone: s.phone,
    alternatePhone: s.alternatePhone,
    email: s.email,
    address: s.address,
    city: s.city,
    pincode: s.pincode,
    dispatchAddress: s.dispatchAddress,
    notes: s.notes,
    isActive: s.isActive,
    openPoCount: "openPoCount" in s ? s.openPoCount : null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export type SerializedSupplier = ReturnType<typeof serializeSupplier>;

export const SUPPLIER_PAGE_SIZE_DEFAULT = 25;
const SUPPLIER_PAGE_SIZE_MAX = 100;

export async function listSuppliers(opts: {
  search?: string | null;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
} = {}) {
  const pageSize = Math.min(
    SUPPLIER_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(opts.pageSize ?? SUPPLIER_PAGE_SIZE_DEFAULT))
  );
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const search = opts.search?.trim().slice(0, 100) ?? "";

  const and: Prisma.SupplierWhereInput[] = [];
  if (!opts.includeInactive) and.push({ isActive: true });
  if (search) {
    const ci = (value: string) => ({ contains: value, mode: "insensitive" as const });
    const or: Prisma.SupplierWhereInput[] = [
      { name: ci(search) },
      { tradeName: ci(search) },
      { gstin: ci(search) },
      { contactPerson: ci(search) },
      { phone: ci(search) },
      { alternatePhone: ci(search) },
      { email: ci(search) },
      { city: ci(search) },
    ];
    // Phones are stored as +91XXXXXXXXXX — also match on typed digits.
    const digits = search.replace(/[^0-9]/g, "");
    if (digits.length >= 4 && digits !== search) {
      or.push({ phone: { contains: digits } }, { alternatePhone: { contains: digits } });
    }
    and.push({ OR: or });
  }
  const where: Prisma.SupplierWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await prisma.$transaction([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      include: openPoCountSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    suppliers: rows.map(withOpenPos),
    total,
    page,
    pageSize,
  };
}

export async function getSupplier(id: string): Promise<SupplierWithOpenPos | null> {
  const row = await prisma.supplier.findUnique({
    where: { id },
    include: openPoCountSelect,
  });
  return row ? withOpenPos(row) : null;
}

function validationError(errors: Record<string, string>): SupplierError {
  const message =
    errors._form ??
    (Object.keys(errors).length === 1
      ? Object.values(errors)[0]
      : "Please fix the highlighted fields.");
  return new SupplierError(message, 400, "SUPPLIER_VALIDATION_FAILED", errors);
}

async function assertGstinUnique(
  client: Prisma.TransactionClient,
  gstin: string,
  excludeId?: string
) {
  const clash = await client.supplier.findFirst({
    where: {
      gstin: { equals: gstin, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (clash) {
    throw new SupplierError(
      `Another supplier (${clash.name}) already uses this GSTIN.`,
      409,
      "SUPPLIER_GSTIN_EXISTS",
      { gstin: `Already used by ${clash.name}.` }
    );
  }
}

function auditSnapshot(s: Partial<Supplier>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of SUPPLIER_PROFILE_FIELDS) out[field] = s[field] ?? null;
  return out;
}

function toWriteData(data: NormalizedSupplierInput) {
  const out: Prisma.SupplierUpdateInput = {};
  for (const field of SUPPLIER_PROFILE_FIELDS) {
    const value = data[field];
    if (value !== undefined) (out as Record<string, unknown>)[field] = value;
  }
  return out;
}

/** Creates a supplier from raw (unvalidated) input. */
export async function createSupplier(
  raw: unknown,
  actor: AuditActor,
  request?: AuditRequestContext | null
): Promise<SupplierWithOpenPos> {
  const result = validateSupplierInput(raw, "create");
  if (!result.ok) throw validationError(result.errors);
  const data = result.data;

  const created = await prisma.$transaction(async (tx) => {
    if (data.gstin) await assertGstinUnique(tx, data.gstin);
    const supplier = await tx.supplier.create({
      data: { ...(toWriteData(data) as Prisma.SupplierCreateInput), name: data.name! },
    });
    await recordAuditEvent(tx, {
      action: AuditAction.SUPPLIER_CREATED,
      module: AuditModule.INVENTORY,
      entityType: "Supplier",
      entityId: supplier.id,
      actor,
      request: request ?? null,
      changes: diffFields({}, auditSnapshot(supplier), [...SUPPLIER_PROFILE_FIELDS]),
      context: { supplierName: supplier.name, gstin: supplier.gstin },
      activityMessage: `Supplier created — ${supplier.name}`,
    });
    return supplier;
  });

  return { ...created, openPoCount: 0 };
}

/**
 * Partially updates a supplier from raw input (only provided keys change).
 * Deactivating a supplier with open POs is allowed but returns a warning.
 */
export async function updateSupplier(
  id: string,
  raw: unknown,
  actor: AuditActor,
  request?: AuditRequestContext | null
): Promise<{ supplier: SupplierWithOpenPos; warning: string | null }> {
  const result = validateSupplierInput(raw, "update");
  if (!result.ok) throw validationError(result.errors);
  const data = result.data;

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new SupplierError("Supplier not found.", 404, "SUPPLIER_NOT_FOUND");
    }

    // Cross-check tax identity against stored values, only when touched, so
    // legacy rows with inconsistent data stay editable for unrelated fields.
    const taxTouched =
      data.gstin !== undefined || data.pan !== undefined || data.stateCode !== undefined;
    if (taxTouched) {
      const merged = {
        gstin: data.gstin !== undefined ? data.gstin : existing.gstin,
        pan: data.pan !== undefined ? data.pan : existing.pan,
        stateCode: data.stateCode !== undefined ? data.stateCode : existing.stateCode,
      };
      const errors = checkSupplierConsistency(merged);
      if (Object.keys(errors).length > 0) throw validationError(errors);
    }

    if (data.gstin) await assertGstinUnique(tx, data.gstin, id);

    const writeData = toWriteData(data);
    const changes = diffFields(
      auditSnapshot(existing),
      auditSnapshot({ ...existing, ...(data as Partial<Supplier>) }),
      [...SUPPLIER_PROFILE_FIELDS]
    );

    const openPoCount = await tx.purchaseOrder.count({
      where: { supplierId: id, status: { in: OPEN_PO_STATUSES } },
    });

    if (changes.length === 0) {
      return { supplier: { ...existing, openPoCount }, warning: null };
    }

    const updated = await tx.supplier.update({ where: { id }, data: writeData });

    const deactivated = existing.isActive && data.isActive === false;
    const reactivated = !existing.isActive && data.isActive === true;
    const warning =
      deactivated && openPoCount > 0
        ? `${updated.name} has ${openPoCount} open purchase order${openPoCount === 1 ? "" : "s"}. They stay open and can still be received.`
        : null;

    await recordAuditEvent(tx, {
      action: AuditAction.SUPPLIER_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: "Supplier",
      entityId: id,
      actor,
      request: request ?? null,
      changes,
      context: {
        supplierName: updated.name,
        ...(deactivated ? { deactivated: true, openPoCount } : {}),
        ...(reactivated ? { reactivated: true } : {}),
      },
      activityMessage: deactivated
        ? `Supplier deactivated — ${updated.name}`
        : reactivated
          ? `Supplier reactivated — ${updated.name}`
          : `Supplier updated — ${updated.name}`,
    });

    return { supplier: { ...updated, openPoCount }, warning };
  });

  return outcome;
}

// ---------------------------------------------------------------------------
// HTTP helpers for app/api/procurement/suppliers/**
// ---------------------------------------------------------------------------

/** Read access: ADMIN, or EMPLOYEE with `procurement.view`. */
export async function requireSupplierView(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return { error: gate.error };
  const { session, actor } = gate as Exclude<typeof gate, { error: NextResponse }>;
  return { session, actor, canEdit: session.role === "ADMIN" };
}

/** Write access: ADMIN only. */
export async function requireSupplierEdit(req: NextRequest) {
  const gate = await requireSupplierView(req);
  if ("error" in gate) return gate;
  if (!gate.canEdit) {
    return {
      error: NextResponse.json(
        { error: "Only admins can change supplier profiles.", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }
  return gate;
}

export function supplierErrorResponse(error: unknown, route: string) {
  if (error instanceof SupplierError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
      { status: error.status }
    );
  }
  console.error(`[${route}] supplier error:`, error);
  return NextResponse.json(
    { error: "Internal Server Error", code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new SupplierError("Request body must be valid JSON.", 400, "INVALID_JSON");
  }
}
