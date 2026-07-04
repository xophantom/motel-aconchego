-- CreateEnum
CREATE TYPE "ledger_kind" AS ENUM ('expense', 'income');

-- AlterTable
-- kind: temporary DEFAULT 'expense' so the 3809 legacy rows (2014-2016, no kind
-- in the legacy import) can backfill; the default is dropped below so new inserts
-- must supply kind explicitly (matches the Prisma schema, which has no @default).
ALTER TABLE "ledger_entry" ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "employee_id" INTEGER,
ADD COLUMN     "kind" "ledger_kind" NOT NULL DEFAULT 'expense';

-- Backfill: the obvious income rows in the legacy data are the 'REC' cost center
-- and rows described as "Receita"; everything else stays 'expense'.
UPDATE "ledger_entry" SET "kind" = 'income'
WHERE "cost_center" = 'REC' OR "description" ILIKE '%receita%';

-- Drop the temporary default so future inserts require an explicit kind.
ALTER TABLE "ledger_entry" ALTER COLUMN "kind" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ledger_entry_entry_date_idx" ON "ledger_entry"("entry_date");

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
