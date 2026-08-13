-- CreateTable
CREATE TABLE "regional_holiday" (
    "id" SERIAL NOT NULL,
    "month_day" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "regional_holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regional_holiday_month_day_key" ON "regional_holiday"("month_day");
