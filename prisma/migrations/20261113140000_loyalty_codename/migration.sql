-- Loyalty by codename: the client is a codename chosen at reception; the plate
-- becomes a record of each stay, no longer tied to loyalty.
ALTER TABLE "customer" ADD COLUMN "codename" TEXT,
ADD COLUMN "codename_key" TEXT;

ALTER TABLE "stay" ADD COLUMN "plate" TEXT;

-- Each stay keeps the plate it was registered with (it came from its client).
UPDATE "stay" s SET "plate" = c."plate"
FROM "customer" c
WHERE s."customer_id" = c."id" AND c."plate" IS NOT NULL;

-- Every plate already in loyalty becomes a codename with its own text, keeping
-- its visits and benefits; reception can rename it later. Plates are only
-- letters, digits and hyphens, so lower() is the codename key.
UPDATE "customer" SET "codename" = "plate", "codename_key" = lower("plate")
WHERE "plate" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "customer_codename_key_key" ON "customer"("codename_key");
