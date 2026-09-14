-- Allow nearest alternates that are out of stock to be suggested with OUT_OF_STOCK label.
ALTER TYPE "AlternateAvailability" ADD VALUE IF NOT EXISTS 'OUT_OF_STOCK';
