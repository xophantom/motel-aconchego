-- DropIndex
DROP INDEX "shift_business_date_period_key";

-- CreateIndex
CREATE INDEX "shift_business_date_period_idx" ON "shift"("business_date", "period");

-- CreateIndex
CREATE INDEX "shift_closed_at_idx" ON "shift"("closed_at");
