-- CreateEnum
CREATE TYPE "billing_type" AS ENUM ('motel', 'hotel');

-- CreateEnum
CREATE TYPE "day_type" AS ENUM ('normal', 'special');

-- CreateEnum
CREATE TYPE "employee_role" AS ENUM ('reception', 'manager', 'housekeeper');

-- CreateEnum
CREATE TYPE "room_status" AS ENUM ('free', 'occupied', 'cleaning', 'maintenance');

-- CreateEnum
CREATE TYPE "product_category" AS ENUM ('minibar', 'erotic', 'kitchen', 'other');

-- CreateEnum
CREATE TYPE "stay_status" AS ENUM ('open', 'closed', 'canceled');

-- CreateEnum
CREATE TYPE "stay_type" AS ENUM ('room', 'walkin');

-- CreateEnum
CREATE TYPE "cash_movement_type" AS ENUM ('stay', 'consumption', 'withdrawal', 'supply', 'correction');

-- CreateEnum
CREATE TYPE "shift_period" AS ENUM ('day_07_19', 'night_19_07');

-- CreateTable
CREATE TABLE "room_category" (
    "id" SMALLSERIAL NOT NULL,
    "code" CHAR(1) NOT NULL,
    "description" TEXT NOT NULL,
    "billing" "billing_type" NOT NULL DEFAULT 'motel',
    "min_period_min" INTEGER NOT NULL,
    "max_period_min" INTEGER NOT NULL,
    "included_guests" SMALLINT NOT NULL DEFAULT 2,

    CONSTRAINT "room_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate" (
    "category_id" SMALLINT NOT NULL,
    "day" "day_type" NOT NULL,
    "base_price" DECIMAL(10,2) NOT NULL,
    "excess_price_30m" DECIMAL(10,2) NOT NULL,
    "overnight_price" DECIMAL(10,2) NOT NULL,
    "extra_guest_price" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "rate_pkey" PRIMARY KEY ("category_id","day")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "role" "employee_role" NOT NULL,
    "password_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT,
    "document" TEXT,
    "phone" TEXT,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "product_category" NOT NULL DEFAULT 'minibar',
    "price" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "track_stock" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "cost_center" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "cost_center_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "room" (
    "number" TEXT NOT NULL,
    "category_id" SMALLINT,
    "status" "room_status" NOT NULL DEFAULT 'free',
    "current_stay_id" BIGINT,
    "maintenance_reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "room_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "shift" (
    "id" BIGSERIAL NOT NULL,
    "business_date" DATE NOT NULL,
    "period" "shift_period" NOT NULL,
    "employee_id" INTEGER,
    "opened_at" TIMESTAMPTZ NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "opening_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closing_balance" DECIMAL(10,2),

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stay" (
    "id" BIGSERIAL NOT NULL,
    "type" "stay_type" NOT NULL DEFAULT 'room',
    "room_number" TEXT,
    "category_id" SMALLINT,
    "customer_id" BIGINT,
    "check_in" TIMESTAMPTZ NOT NULL,
    "check_out" TIMESTAMPTZ,
    "day" "day_type" NOT NULL DEFAULT 'normal',
    "guests" SMALLINT NOT NULL DEFAULT 2,
    "prepaid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stay_amount" DECIMAL(10,2),
    "consumption_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "stay_status" NOT NULL DEFAULT 'open',
    "entry_employee_id" INTEGER,
    "payment_employee_id" INTEGER,
    "shift_id" BIGINT,
    "legacy_seq" BIGINT,

    CONSTRAINT "stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumption" (
    "id" BIGSERIAL NOT NULL,
    "stay_id" BIGINT NOT NULL,
    "product_code" TEXT,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movement" (
    "id" BIGSERIAL NOT NULL,
    "type" "cash_movement_type" NOT NULL,
    "stay_id" BIGINT,
    "amount" DECIMAL(10,2) NOT NULL,
    "employee_id" INTEGER,
    "shift_id" BIGINT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "description" TEXT,
    "legacy_seq" BIGINT,

    CONSTRAINT "cash_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" BIGSERIAL NOT NULL,
    "entry_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "cost_center" TEXT,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wake_up_call" (
    "id" BIGSERIAL NOT NULL,
    "stay_id" BIGINT,
    "room_number" TEXT,
    "target_time" TIMESTAMPTZ NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "wake_up_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_log" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "employee_id" INTEGER,
    "room_number" TEXT,
    "legacy_seq" BIGINT,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "room_category_code_key" ON "room_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_username_key" ON "employee"("username");

-- CreateIndex
CREATE UNIQUE INDEX "shift_business_date_period_key" ON "shift"("business_date", "period");

-- CreateIndex
CREATE INDEX "stay_room_number_check_in_idx" ON "stay"("room_number", "check_in");

-- CreateIndex
CREATE INDEX "stay_customer_id_idx" ON "stay"("customer_id");

-- CreateIndex
CREATE INDEX "consumption_stay_id_idx" ON "consumption"("stay_id");

-- CreateIndex
CREATE INDEX "cash_movement_shift_id_idx" ON "cash_movement"("shift_id");

-- AddForeignKey
ALTER TABLE "rate" ADD CONSTRAINT "rate_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "room_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "room_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_current_stay_id_fkey" FOREIGN KEY ("current_stay_id") REFERENCES "stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_room_number_fkey" FOREIGN KEY ("room_number") REFERENCES "room"("number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "room_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_entry_employee_id_fkey" FOREIGN KEY ("entry_employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_payment_employee_id_fkey" FOREIGN KEY ("payment_employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stay" ADD CONSTRAINT "stay_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumption" ADD CONSTRAINT "consumption_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "product"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_cost_center_fkey" FOREIGN KEY ("cost_center") REFERENCES "cost_center"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wake_up_call" ADD CONSTRAINT "wake_up_call_stay_id_fkey" FOREIGN KEY ("stay_id") REFERENCES "stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_log" ADD CONSTRAINT "event_log_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
