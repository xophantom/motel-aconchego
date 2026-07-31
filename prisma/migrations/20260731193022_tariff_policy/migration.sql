-- CreateTable
CREATE TABLE "tariff_policy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "special_weekdays" INTEGER[],

    CONSTRAINT "tariff_policy_pkey" PRIMARY KEY ("id")
);

-- Seed the single policy row: special days default to Fri (5) + Sat (6).
INSERT INTO "tariff_policy" ("id", "special_weekdays") VALUES (1, '{5,6}') ON CONFLICT DO NOTHING;
