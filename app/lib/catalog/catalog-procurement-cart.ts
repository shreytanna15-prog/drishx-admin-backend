/**
 * Catalog Procurement Cart — add single or bulk catalog power leaves
 * (existing or unstocked) into ProcurementRequest, and bulk-update supplier/qty.
 */

import {
  ProcurementPriority,
  ProcurementRequestSource,
  ProcurementRequestStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
  systemActor,
  type AuditActor,
  type AuditRequestContext,
} from "@/app/lib/audit";
import { ensureCatalogPowerLeaf } from "@/app/lib/catalog/catalog-po-resolve";
import { encodeStockLeafKey } from "@/app/lib/catalog/lens-product-stock-core";
import { nextProcurementRequestPublicId } from "@/app/lib/procurement-requests";
import { PROCUREMENT_REQUEST_STATUSES_OPEN } from "@/app/lib/procurement-rules";

export type CatalogCartItemInput = {
  powerId?: string;
  variantId?: string;
  sph?: number;
  cyl?: number;
  quantity: number;
  supplierId?: string | null;
  priority?: ProcurementPriority;
  reason?: string | null;
};

export async function addCatalogItemsToProcurementCart(input: {
  items: CatalogCartItemInput[];
  approveImmediately?: boolean;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
}) {
  if (input.items.length === 0) {
    throw new Error("At least one item is required.");
  }
  if (input.items.length > 200) {
    throw new Error("Maximum 200 items per cart batch.");
  }

  for (const item of input.items) {
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error("Quantity must be a whole number greater than 0.");
    }
    if (
      !item.powerId?.trim() &&
      (typeof item.variantId !== "string" ||
        !item.variantId.trim() ||
        typeof item.sph !== "number" ||
        !Number.isFinite(item.sph) ||
        typeof item.cyl !== "number" ||
        !Number.isFinite(item.cyl))
    ) {
      throw new Error("Each item requires powerId or variantId + sph + cyl.");
    }
  }

  // Pre-resolve leaves outside the interactive transaction to avoid long round-trips on pooled DBs.
  const variantIds = Array.from(
    new Set(
      input.items
        .map((i) => i.variantId?.trim())
        .filter((v): v is string => Boolean(v))
    )
  );
  const directPowerIds = Array.from(
    new Set(
      input.items
        .map((i) => i.powerId?.trim())
        .filter((v): v is string => Boolean(v))
    )
  );

  const [existingByVariant, existingById] = await Promise.all([
    variantIds.length > 0
      ? prisma.lensProductPower.findMany({
          where: { lensProductVariantId: { in: variantIds } },
          select: {
            id: true,
            lensProductVariantId: true,
            sph: true,
            cyl: true,
            quantity: true,
            blockedQty: true,
            minStock: true,
            targetStock: true,
            preferredSupplierId: true,
          },
        })
      : Promise.resolve([]),
    directPowerIds.length > 0
      ? prisma.lensProductPower.findMany({
          where: { id: { in: directPowerIds } },
          select: {
            id: true,
            lensProductVariantId: true,
            sph: true,
            cyl: true,
            quantity: true,
            blockedQty: true,
            minStock: true,
            targetStock: true,
            preferredSupplierId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const leafByKey = new Map(
    existingByVariant.map((r) => [
      encodeStockLeafKey(r.lensProductVariantId, Number(r.sph), Number(r.cyl)),
      r,
    ])
  );
  const leafById = new Map(existingById.map((r) => [r.id, r]));

  const resolvedItems: Array<{
    powerId: string;
    quantity: number;
    supplierId: string | null;
    priority: ProcurementPriority;
    reason: string | null;
    onHand: number;
    minStock: number;
    targetStock: number;
  }> = [];

  for (const item of input.items) {
    let leaf = item.powerId?.trim() ? leafById.get(item.powerId.trim()) : undefined;
    if (!leaf && item.variantId && item.sph != null && item.cyl != null) {
      const key = encodeStockLeafKey(item.variantId.trim(), item.sph, item.cyl);
      leaf = leafByKey.get(key);
      if (!leaf) {
        const createdLeaf = await ensureCatalogPowerLeaf(
          prisma,
          item.variantId.trim(),
          item.sph,
          item.cyl
        );
        leaf = {
          id: createdLeaf.id,
          lensProductVariantId: createdLeaf.lensProductVariantId,
          sph: createdLeaf.sph,
          cyl: createdLeaf.cyl,
          quantity: createdLeaf.quantity,
          blockedQty: createdLeaf.blockedQty,
          minStock: createdLeaf.minStock,
          targetStock: createdLeaf.targetStock,
          preferredSupplierId: createdLeaf.preferredSupplierId,
        };
        leafByKey.set(key, leaf);
        leafById.set(leaf.id, leaf);
      }
    }
    if (!leaf) {
      throw new Error(`Stock leaf not found: ${item.powerId ?? item.variantId}`);
    }
    resolvedItems.push({
      powerId: leaf.id,
      quantity: Number(item.quantity),
      supplierId:
        item.supplierId !== undefined
          ? item.supplierId || null
          : leaf.preferredSupplierId ?? null,
      priority: item.priority ?? ProcurementPriority.NORMAL,
      reason: item.reason?.trim() || null,
      onHand: leaf.quantity,
      minStock: leaf.minStock,
      targetStock: leaf.targetStock,
    });
  }

  const allPowerIds = Array.from(new Set(resolvedItems.map((i) => i.powerId)));

  return prisma.$transaction(
    async (tx) => {
      const openLocks = await tx.openPurchaseOrderPower.findMany({
        where: { lensProductPowerId: { in: allPowerIds } },
        include: { purchaseOrder: { select: { publicId: true } } },
      });
      const openLockByPowerId = new Map(
        openLocks
          .filter((l) => l.lensProductPowerId)
          .map((l) => [l.lensProductPowerId!, l.purchaseOrder.publicId])
      );

      const existingRequests = await tx.procurementRequest.findMany({
        where: {
          lensProductPowerId: { in: allPowerIds },
          status: {
            in: [...PROCUREMENT_REQUEST_STATUSES_OPEN] as ProcurementRequestStatus[],
          },
        },
        orderBy: { createdAt: "asc" },
      });
      const existingByPowerId = new Map<string, (typeof existingRequests)[number]>();
      for (const req of existingRequests) {
        if (req.lensProductPowerId && !existingByPowerId.has(req.lensProductPowerId)) {
          existingByPowerId.set(req.lensProductPowerId, req);
        }
      }

      const created: Array<{ id: string; publicId: string; powerId: string }> = [];
      const updated: Array<{ id: string; publicId: string; powerId: string }> = [];
      const skippedOpenPo: Array<{ powerId: string; poPublicId: string }> = [];

      const actorUserId =
        input.actor && "actorUserId" in input.actor && input.actor.actorUserId
          ? input.actor.actorUserId
          : null;
      const now = new Date();

      for (const item of resolvedItems) {
        const openPoPublicId = openLockByPowerId.get(item.powerId);
        if (openPoPublicId) {
          skippedOpenPo.push({
            powerId: item.powerId,
            poPublicId: openPoPublicId,
          });
          continue;
        }

        const existing = existingByPowerId.get(item.powerId);
        if (existing) {
          const nextReq = existing.requestedQuantity + item.quantity;
          await tx.procurementRequest.update({
            where: { id: existing.id },
            data: {
              requestedQuantity: nextReq,
              requiredQuantity: Math.max(existing.requiredQuantity, nextReq),
              ...(item.supplierId ? { supplierId: item.supplierId } : {}),
            },
          });
          updated.push({
            id: existing.id,
            publicId: existing.publicId,
            powerId: item.powerId,
          });
          continue;
        }

        const publicId = await nextProcurementRequestPublicId(tx);
        const status = input.approveImmediately
          ? ProcurementRequestStatus.APPROVED
          : ProcurementRequestStatus.OPEN;

        const row = await tx.procurementRequest.create({
          data: {
            publicId,
            lensProductPowerId: item.powerId,
            supplierId: item.supplierId,
            source: ProcurementRequestSource.MANUAL,
            status,
            priority: item.priority,
            requiredQuantity: item.quantity,
            requestedQuantity: item.quantity,
            stockAtTrigger: item.onHand,
            availableAtTrigger: item.onHand,
            minStockAtTrigger: item.minStock,
            targetStockAtTrigger: item.targetStock,
            triggerReason: item.reason || "Manual cart pick",
            createdById: actorUserId,
            ...(input.approveImmediately
              ? { approvedAt: now, approvedById: actorUserId }
              : {}),
          },
        });

        existingByPowerId.set(item.powerId, row);
        created.push({
          id: row.id,
          publicId: row.publicId,
          powerId: item.powerId,
        });
      }

      if (created.length > 0 || updated.length > 0) {
        await recordAuditEvent(tx, {
          action: AuditAction.PROCUREMENT_REQUEST_CREATED,
          module: AuditModule.INVENTORY,
          entityType: "ProcurementRequest",
          entityId: created[0]?.id ?? updated[0]!.id,
          actor: input.actor ?? systemActor(),
          request: input.request ?? null,
          context: {
            createdCount: String(created.length),
            updatedCount: String(updated.length),
          },
          activityMessage: `Procurement Cart batch: ${created.length} added, ${updated.length} updated`,
        });
      }

      return { created, updated, skippedOpenPo };
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
}

export async function updateProcurementCartItems(input: {
  ids: string[];
  supplierId?: string | null;
  requestedQuantity?: number;
}) {
  if (input.ids.length === 0) {
    throw new Error("At least one request id is required.");
  }
  const data: {
    supplierId?: string | null;
    requestedQuantity?: number;
    requiredQuantity?: number;
  } = {};
  if (input.supplierId !== undefined) {
    data.supplierId = input.supplierId ? input.supplierId.trim() : null;
  }
  if (input.requestedQuantity !== undefined) {
    if (!Number.isInteger(input.requestedQuantity) || input.requestedQuantity <= 0) {
      throw new Error("requestedQuantity must be a whole number greater than 0.");
    }
    data.requestedQuantity = input.requestedQuantity;
    data.requiredQuantity = input.requestedQuantity;
  }

  const res = await prisma.procurementRequest.updateMany({
    where: {
      id: { in: input.ids },
      status: {
        in: [...PROCUREMENT_REQUEST_STATUSES_OPEN] as ProcurementRequestStatus[],
      },
    },
    data,
  });

  return { updatedCount: res.count };
}
