/**
 * RC-03 power-range attribute master (SPH/CYL bounds). Mirrors lens-attribute-service patterns.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { AuditAction, AuditModule, recordAuditEvent } from "../audit";
import {
  formatCylSummary,
  formatPowerRangeLabel,
  normalizePowerValue,
  validatePowerRangeBounds,
} from "./catalog-power-select-options";

export class LensPowerRangeServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "POWER_RANGE_ERROR") {
    super(message);
    this.name = "LensPowerRangeServiceError";
    this.status = status;
    this.code = code;
  }
}

type PowerRangeRow = {
  id: string;
  sphMin: Prisma.Decimal;
  sphMax: Prisma.Decimal;
  cylMin: Prisma.Decimal;
  cylMax: Prisma.Decimal;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export function serializePowerRange(row: PowerRangeRow) {
  const sphMin = Number(row.sphMin);
  const sphMax = Number(row.sphMax);
  const cylMin = Number(row.cylMin);
  const cylMax = Number(row.cylMax);
  return {
    id: row.id,
    label: formatPowerRangeLabel(sphMin, sphMax),
    cylSummary: formatCylSummary(cylMin, cylMax),
    sphMin,
    sphMax,
    cylMin,
    cylMax,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(normalizePowerValue(n));
}

function requireFinite(label: string, value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) {
    throw new LensPowerRangeServiceError(`${label} must be a number.`);
  }
  return n;
}

function assertBounds(bounds: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
}) {
  const message = validatePowerRangeBounds(bounds);
  if (message) {
    throw new LensPowerRangeServiceError(message, 400, "INVALID_RANGE");
  }
}

export async function listLensPowerRanges(activeOnly = false) {
  const rows = await prisma.lensPowerRange.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: [
      { sortOrder: "asc" },
      { sphMin: "asc" },
      { sphMax: "asc" },
      { cylMin: "asc" },
      { cylMax: "asc" },
    ],
  });
  return rows.map(serializePowerRange);
}

export async function createLensPowerRange(input: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  sortOrder?: number;
  isActive?: boolean;
  actorUserId: string;
}) {
  const bounds = {
    sphMin: normalizePowerValue(requireFinite("sphMin", input.sphMin)),
    sphMax: normalizePowerValue(requireFinite("sphMax", input.sphMax)),
    cylMin: normalizePowerValue(requireFinite("cylMin", input.cylMin)),
    cylMax: normalizePowerValue(requireFinite("cylMax", input.cylMax)),
  };
  assertBounds(bounds);

  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.trunc(input.sortOrder)
      : 0;

  try {
    const row = await prisma.lensPowerRange.create({
      data: {
        sphMin: dec(bounds.sphMin),
        sphMax: dec(bounds.sphMax),
        cylMin: dec(bounds.cylMin),
        cylMax: dec(bounds.cylMax),
        sortOrder,
        isActive: input.isActive !== false,
      },
    });
    const item = serializePowerRange(row);

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: "LensAttribute:powerRange",
      entityId: row.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        actorName: null,
      },
      context: {
        event: "LENS_POWER_RANGE_CREATED",
        label: item.label,
        ...bounds,
      },
      activityMessage: `Catalog power range created: ${item.label} (${item.cylSummary})`,
    });

    return item;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensPowerRangeServiceError(
        "A power range with these bounds already exists.",
        409,
        "DUPLICATE_RANGE"
      );
    }
    throw err;
  }
}

export async function updateLensPowerRange(
  id: string,
  input: {
    sphMin?: number;
    sphMax?: number;
    cylMin?: number;
    cylMax?: number;
    sortOrder?: number;
    isActive?: boolean;
    actorUserId: string;
  }
) {
  const existing = await prisma.lensPowerRange.findUnique({ where: { id } });
  if (!existing) {
    throw new LensPowerRangeServiceError(
      "Power range not found.",
      404,
      "NOT_FOUND"
    );
  }

  const data: Prisma.LensPowerRangeUpdateInput = {};

  const boundsTouched =
    input.sphMin !== undefined ||
    input.sphMax !== undefined ||
    input.cylMin !== undefined ||
    input.cylMax !== undefined;

  let bounds = {
    sphMin: Number(existing.sphMin),
    sphMax: Number(existing.sphMax),
    cylMin: Number(existing.cylMin),
    cylMax: Number(existing.cylMax),
  };
  if (boundsTouched) {
    bounds = {
      sphMin: normalizePowerValue(
        input.sphMin !== undefined ? requireFinite("sphMin", input.sphMin) : bounds.sphMin
      ),
      sphMax: normalizePowerValue(
        input.sphMax !== undefined ? requireFinite("sphMax", input.sphMax) : bounds.sphMax
      ),
      cylMin: normalizePowerValue(
        input.cylMin !== undefined ? requireFinite("cylMin", input.cylMin) : bounds.cylMin
      ),
      cylMax: normalizePowerValue(
        input.cylMax !== undefined ? requireFinite("cylMax", input.cylMax) : bounds.cylMax
      ),
    };
    assertBounds(bounds);

    const changed =
      bounds.sphMin !== Number(existing.sphMin) ||
      bounds.sphMax !== Number(existing.sphMax) ||
      bounds.cylMin !== Number(existing.cylMin) ||
      bounds.cylMax !== Number(existing.cylMax);
    if (changed) {
      // Products copy bounds + encode them in SKU at write time; changing a used range
      // would leave stale SKUs. Create a new range instead.
      const inUse = await prisma.lensProduct.count({
        where: { powerRangeId: id },
      });
      if (inUse > 0) {
        throw new LensPowerRangeServiceError(
          `This power range is used by ${inUse} product(s); bounds cannot be changed. Create a new range instead.`,
          409,
          "RANGE_IN_USE"
        );
      }
    }
    data.sphMin = dec(bounds.sphMin);
    data.sphMax = dec(bounds.sphMax);
    data.cylMin = dec(bounds.cylMin);
    data.cylMax = dec(bounds.cylMax);
  }

  if (input.sortOrder != null) {
    if (!Number.isFinite(input.sortOrder)) {
      throw new LensPowerRangeServiceError("sortOrder must be a number.");
    }
    data.sortOrder = Math.trunc(input.sortOrder);
  }
  if (input.isActive != null) data.isActive = Boolean(input.isActive);

  if (Object.keys(data).length === 0) {
    throw new LensPowerRangeServiceError("No fields to update.");
  }

  try {
    const row = await prisma.lensPowerRange.update({ where: { id }, data });
    const item = serializePowerRange(row);

    await recordAuditEvent(prisma, {
      action: AuditAction.SETTINGS_UPDATED,
      module: AuditModule.INVENTORY,
      entityType: "LensAttribute:powerRange",
      entityId: row.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: input.actorUserId,
        actorName: null,
      },
      context: {
        event: "LENS_POWER_RANGE_UPDATED",
        label: item.label,
        ...(boundsTouched ? bounds : {}),
        ...(input.isActive != null ? { isActive: Boolean(input.isActive) } : {}),
        ...(input.sortOrder != null ? { sortOrder: Math.trunc(input.sortOrder) } : {}),
      },
      activityMessage: `Catalog power range updated: ${item.label}`,
    });

    return item;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new LensPowerRangeServiceError(
        "A power range with these bounds already exists.",
        409,
        "DUPLICATE_RANGE"
      );
    }
    throw err;
  }
}
