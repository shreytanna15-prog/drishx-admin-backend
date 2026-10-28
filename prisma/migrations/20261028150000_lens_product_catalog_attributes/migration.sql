-- CreateTable
CREATE TABLE "LensFamily" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensBase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensMaterial" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensIndex" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensCoating" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensCoating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensColor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensBaseMaterialLink" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,

    CONSTRAINT "LensBaseMaterialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LensProduct" (
    "id" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "indexId" TEXT,
    "coatingId" TEXT,
    "colorId" TEXT,
    "rangeType" TEXT NOT NULL DEFAULT 'NORMAL',
    "sphMin" DECIMAL(65,30) NOT NULL,
    "sphMax" DECIMAL(65,30) NOT NULL,
    "cylMin" DECIMAL(65,30) NOT NULL,
    "cylMax" DECIMAL(65,30) NOT NULL,
    "addMin" DECIMAL(65,30),
    "addMax" DECIMAL(65,30),
    "axis" INTEGER,
    "eye" TEXT,
    "defaultPrice" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LensFamily_code_key" ON "LensFamily"("code");

-- CreateIndex
CREATE INDEX "LensFamily_isActive_sortOrder_idx" ON "LensFamily"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LensBase_code_key" ON "LensBase"("code");

-- CreateIndex
CREATE INDEX "LensBase_isActive_sortOrder_idx" ON "LensBase"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LensMaterial_code_key" ON "LensMaterial"("code");

-- CreateIndex
CREATE INDEX "LensMaterial_isActive_sortOrder_idx" ON "LensMaterial"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LensIndex_code_key" ON "LensIndex"("code");

-- CreateIndex
CREATE INDEX "LensIndex_isActive_sortOrder_idx" ON "LensIndex"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LensCoating_code_key" ON "LensCoating"("code");

-- CreateIndex
CREATE INDEX "LensCoating_isActive_sortOrder_idx" ON "LensCoating"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LensColor_code_key" ON "LensColor"("code");

-- CreateIndex
CREATE INDEX "LensColor_isActive_sortOrder_idx" ON "LensColor"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "LensBaseMaterialLink_materialId_idx" ON "LensBaseMaterialLink"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "LensBaseMaterialLink_baseId_materialId_key" ON "LensBaseMaterialLink"("baseId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "LensProduct_skuCode_key" ON "LensProduct"("skuCode");

-- CreateIndex
CREATE INDEX "LensProduct_familyId_isActive_idx" ON "LensProduct"("familyId", "isActive");

-- CreateIndex
CREATE INDEX "LensProduct_baseId_idx" ON "LensProduct"("baseId");

-- CreateIndex
CREATE INDEX "LensProduct_materialId_idx" ON "LensProduct"("materialId");

-- CreateIndex
CREATE INDEX "LensProduct_isActive_updatedAt_idx" ON "LensProduct"("isActive", "updatedAt");

-- AddForeignKey
ALTER TABLE "LensBaseMaterialLink" ADD CONSTRAINT "LensBaseMaterialLink_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "LensBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensBaseMaterialLink" ADD CONSTRAINT "LensBaseMaterialLink_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "LensMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "LensFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "LensBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "LensMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_indexId_fkey" FOREIGN KEY ("indexId") REFERENCES "LensIndex"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_coatingId_fkey" FOREIGN KEY ("coatingId") REFERENCES "LensCoating"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "LensColor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
