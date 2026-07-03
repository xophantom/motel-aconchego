-- CreateEnum
CREATE TYPE "charge_mode" AS ENUM ('period', 'overnight');

-- AlterTable
ALTER TABLE "stay" ADD COLUMN     "charge_mode" "charge_mode" NOT NULL DEFAULT 'period';
