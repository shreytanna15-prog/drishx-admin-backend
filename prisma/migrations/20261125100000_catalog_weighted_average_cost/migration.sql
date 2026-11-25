-- Unknown historical cost stays NULL. Receipt posting initializes or blends only
-- when all existing on-hand units have a known cost.
ALTER TABLE "LensProductPower" ADD COLUMN "weightedAverageCost" DECIMAL(12,4);
