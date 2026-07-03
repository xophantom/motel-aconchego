-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "plate" TEXT;

-- AlterTable
ALTER TABLE "stay" ADD COLUMN     "discount_percent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_tier" (
    "id" SERIAL NOT NULL,
    "min_visits" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL,

    CONSTRAINT "loyalty_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_redemption" (
    "id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "tier_id" INTEGER NOT NULL,
    "stay_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_tier_min_visits_key" ON "loyalty_tier"("min_visits");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_redemption_customer_id_tier_id_key" ON "loyalty_redemption"("customer_id", "tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_plate_key" ON "customer"("plate");

-- AddForeignKey
ALTER TABLE "loyalty_redemption" ADD CONSTRAINT "loyalty_redemption_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemption" ADD CONSTRAINT "loyalty_redemption_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "loyalty_tier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_redemption" ADD CONSTRAINT "loyalty_redemption_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

