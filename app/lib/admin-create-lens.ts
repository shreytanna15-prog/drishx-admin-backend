import { Eye } from "@prisma/client";
import { prisma } from "./prisma";

export type LensCategoryType = "single-vision" | "kryptok" | "progressive";

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function toNullableNumber(value: unknown): number | null {
  if (isBlank(value)) return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function toRequiredNumber(value: unknown, field: string): number {
  const n = toNullableNumber(value);
  if (n === null) {
    throw new Error(`${field} is required and must be a valid number.`);
  }
  return n;
}

function toOptionalInt(value: unknown): number | null {
  if (isBlank(value)) return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

type CreateSingleVisionBody = {
  category?: string | null;
  brand: string;
  item?: string | null;
  index: string | number;
  coating: string;
  sph?: string | number | null;
  sphStartRange?: string | number | null;
  cyl?: string | number | null;
  cylStartRange?: string | number | null;
  crossPower?: string | number | null;
  price: string | number;
  quantity?: string | number | null;
  costPrice?: string | number | null;
};

type CreateKryptokBody = {
  category?: string | null;
  brand?: string | null;
  item?: string | null;
  coating?: string | null;
  sph: string | number;
  sphStartRange?: string | number | null;
  cyl?: string | number | null;
  cylStartRange?: string | number | null;
  crossPower?: string | number | null;
  axis?: string | number | null;
  add: string | number;
  price: string | number;
  quantity?: string | number | null;
  costPrice?: string | number | null;
};

type CreateProgressiveBody = {
  category?: string | null;
  item: string;
  brand: string;
  index: string | number;
  type: string;
  coating: string;
  sph: string | number;
  sphStartRange?: string | number | null;
  cyl?: string | number | null;
  cylStartRange?: string | number | null;
  axis?: string | number | null;
  add: string | number;
  eye: Eye | string;
  price: string | number;
  quantity?: string | number | null;
  costPrice?: string | number | null;
};

function requireNonBlankString(value: unknown, field: string): string {
  if (isBlank(value)) {
    throw new Error(`${field} is required.`);
  }
  const s = String(value).trim();
  if (!s) throw new Error(`${field} is required.`);
  return s;
}

function requireEye(value: unknown): Eye {
  const s = requireNonBlankString(value, "eye").toUpperCase();
  if (s !== "LEFT" && s !== "RIGHT") {
    throw new Error("eye must be LEFT or RIGHT.");
  }
  return s as Eye;
}

export async function createAdminLens(
  lensType: LensCategoryType,
  body: CreateSingleVisionBody | CreateKryptokBody | CreateProgressiveBody
) {
  switch (lensType) {
    case "single-vision": {
      const b = body as CreateSingleVisionBody;
      const brand = requireNonBlankString(b.brand, "brand");
      const coating = requireNonBlankString(b.coating, "coating");
      const index = toRequiredNumber(b.index, "index");
      const price = toRequiredNumber(b.price, "price");
      const quantity = toOptionalInt(b.quantity) ?? 0;
      const costPrice = toNullableNumber(b.costPrice);

      const crossPower = toNullableNumber(b.crossPower);
      const hasCross = crossPower !== null && Math.abs(crossPower) > 1e-9;

      const sph = toNullableNumber(b.sph);
      const sphStartRange = toNullableNumber(b.sphStartRange);
      const cyl = toNullableNumber(b.cyl);
      const cylStartRange = toNullableNumber(b.cylStartRange);

      if (!hasCross) {
        if (sph === null) throw new Error("sph is required when crossPower is empty.");
        if (sphStartRange === null) {
          throw new Error("sphStartRange is required when sph is provided.");
        }
        if (cyl !== null && cylStartRange === null) {
          throw new Error("cylStartRange is required when cyl is provided.");
        }
      }

      return prisma.singleVisionLens.create({
        data: {
          category: b.category ? String(b.category) : null,
          brand,
          item: b.item ? String(b.item) : null,
          index,
          coating,
          sph: hasCross ? null : sph,
          sphStartRange: hasCross ? null : sphStartRange,
          cyl: hasCross ? null : cyl,
          cylStartRange: hasCross ? null : cylStartRange,
          crossPower: hasCross ? crossPower : null,
          price,
          quantity,
          costPrice,
        },
      });
    }

    case "kryptok": {
      const b = body as CreateKryptokBody;
      const sph = toRequiredNumber(b.sph, "sph");
      const sphStartRange = toRequiredNumber(
        b.sphStartRange ?? sph,
        "sphStartRange"
      );
      const cyl = toNullableNumber(b.cyl);
      const cylStartRange = toNullableNumber(b.cylStartRange);
      const add = toRequiredNumber(b.add, "add");
      const price = toRequiredNumber(b.price, "price");
      const quantity = toOptionalInt(b.quantity) ?? 0;
      const costPrice = toNullableNumber(b.costPrice);

      if (cyl !== null && cylStartRange === null) {
        throw new Error("cylStartRange is required when cyl is provided.");
      }

      const axis =
        toOptionalInt(b.axis) ?? null;
      const crossPower = toNullableNumber(b.crossPower);

      return prisma.kryptokLens.create({
        data: {
          category: b.category ? String(b.category) : null,
          brand: b.brand ? String(b.brand) : null,
          item: b.item ? String(b.item) : null,
          coating: b.coating ? String(b.coating) : null,
          sph,
          sphStartRange,
          cyl: cyl,
          cylStartRange: cylStartRange,
          crossPower,
          axis,
          add,
          price,
          quantity,
          costPrice,
        },
      });
    }

    case "progressive": {
      const b = body as CreateProgressiveBody;
      const item = requireNonBlankString(b.item, "item");
      const brand = requireNonBlankString(b.brand, "brand");
      const coating = requireNonBlankString(b.coating, "coating");
      const index = toRequiredNumber(b.index, "index");
      const type = requireNonBlankString(b.type, "type");
      const sph = toRequiredNumber(b.sph, "sph");
      const sphStartRange = toRequiredNumber(
        b.sphStartRange ?? sph,
        "sphStartRange"
      );
      const add = toRequiredNumber(b.add, "add");
      const price = toRequiredNumber(b.price, "price");
      const quantity = toOptionalInt(b.quantity) ?? 0;
      const costPrice = toNullableNumber(b.costPrice);

      const cyl = toNullableNumber(b.cyl);
      const cylStartRange = toNullableNumber(b.cylStartRange);
      if (cyl !== null && cylStartRange === null) {
        throw new Error("cylStartRange is required when cyl is provided.");
      }

      const axis = toOptionalInt(b.axis);
      const eye = requireEye(b.eye);

      return prisma.progressiveLens.create({
        data: {
          category: b.category ? String(b.category) : null,
          item,
          brand,
          index,
          type,
          coating,
          sph,
          sphStartRange,
          cyl,
          cylStartRange,
          axis,
          add,
          eye,
          price,
          quantity,
          costPrice,
        },
      });
    }
  }
}

