-- Visits from the old system's frequency records: count for loyalty, not stays.
-- CreateTable
CREATE TABLE "legacy_visit" (
    "id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "visited_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "legacy_visit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legacy_visit_customer_id_visited_at_key" ON "legacy_visit"("customer_id", "visited_at");

-- AddForeignKey
ALTER TABLE "legacy_visit" ADD CONSTRAINT "legacy_visit_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
