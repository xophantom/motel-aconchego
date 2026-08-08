-- CreateEnum
CREATE TYPE "cash_method" AS ENUM ('cash', 'card');

-- AlterTable
ALTER TABLE "cash_movement" ADD COLUMN     "method" "cash_method";

-- AlterTable
ALTER TABLE "shift" ADD COLUMN     "closed_by_id" INTEGER,
ADD COLUMN     "expected_opening_balance" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "cash_policy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "expected_opening_balance" DECIMAL(10,2) NOT NULL DEFAULT 150,

    CONSTRAINT "cash_policy_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the single cash-policy row: expected morning float defaults to 150.
INSERT INTO "cash_policy" ("id", "expected_opening_balance") VALUES (1, 150) ON CONFLICT DO NOTHING;
