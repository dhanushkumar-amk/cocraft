CREATE TABLE "DodoSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DodoSubscription_ownerId_idx" ON "DodoSubscription"("ownerId");
