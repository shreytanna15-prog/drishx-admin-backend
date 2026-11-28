-- Storefront Catalog merchandising tables (cards, product links, coating chips)

CREATE TABLE "StorefrontCard" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorefrontCardProduct" (
    "id" TEXT NOT NULL,
    "storefrontCardId" TEXT NOT NULL,
    "lensProductId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontCardProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorefrontCoatingChip" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "coatingId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontCoatingChip_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontCard_familyId_name_key" ON "StorefrontCard"("familyId", "name");
CREATE INDEX "StorefrontCard_familyId_isActive_sortOrder_idx" ON "StorefrontCard"("familyId", "isActive", "sortOrder");

CREATE UNIQUE INDEX "StorefrontCardProduct_lensProductId_key" ON "StorefrontCardProduct"("lensProductId");
CREATE UNIQUE INDEX "StorefrontCardProduct_storefrontCardId_lensProductId_key" ON "StorefrontCardProduct"("storefrontCardId", "lensProductId");
CREATE INDEX "StorefrontCardProduct_storefrontCardId_sortOrder_idx" ON "StorefrontCardProduct"("storefrontCardId", "sortOrder");

CREATE UNIQUE INDEX "StorefrontCoatingChip_familyId_coatingId_key" ON "StorefrontCoatingChip"("familyId", "coatingId");
CREATE INDEX "StorefrontCoatingChip_familyId_isActive_sortOrder_idx" ON "StorefrontCoatingChip"("familyId", "isActive", "sortOrder");

ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "LensFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StorefrontCardProduct" ADD CONSTRAINT "StorefrontCardProduct_storefrontCardId_fkey" FOREIGN KEY ("storefrontCardId") REFERENCES "StorefrontCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontCardProduct" ADD CONSTRAINT "StorefrontCardProduct_lensProductId_fkey" FOREIGN KEY ("lensProductId") REFERENCES "LensProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorefrontCoatingChip" ADD CONSTRAINT "StorefrontCoatingChip_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "LensFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StorefrontCoatingChip" ADD CONSTRAINT "StorefrontCoatingChip_coatingId_fkey" FOREIGN KEY ("coatingId") REFERENCES "LensCoating"("id") ON DELETE RESTRICT ON UPDATE CASCADE;