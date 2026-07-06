-- AlterTable
ALTER TABLE "stay" ADD COLUMN     "canceled_at" TIMESTAMPTZ,
ADD COLUMN     "canceled_by_id" INTEGER,
ADD COLUMN     "canceled_reason" TEXT;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_canceled_by_id_fkey" FOREIGN KEY ("canceled_by_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
