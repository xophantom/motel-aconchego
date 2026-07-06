-- CreateEnum
CREATE TYPE "stock_movement_reason" AS ENUM ('restock', 'loss', 'inventory', 'correction');

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" BIGSERIAL NOT NULL,
    "product_code" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" "stock_movement_reason" NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "note" TEXT,
    "employee_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_movement_product_code_idx" ON "stock_movement"("product_code");

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "product"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
