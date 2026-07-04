-- AlterTable
ALTER TABLE "event_log" ADD COLUMN     "entity" TEXT,
ADD COLUMN     "entity_id" TEXT,
ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP;
