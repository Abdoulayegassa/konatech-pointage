-- CreateEnum
CREATE TYPE "CalendarEntryType" AS ENUM ('PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY', 'LEAVE', 'EXTERNAL_MISSION');

-- CreateTable
CREATE TABLE "CalendarEntry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "CalendarEntryType" NOT NULL,
    "employeeId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEntry_date_idx" ON "CalendarEntry"("date");

-- CreateIndex
CREATE INDEX "CalendarEntry_type_idx" ON "CalendarEntry"("type");

-- CreateIndex
CREATE INDEX "CalendarEntry_employeeId_idx" ON "CalendarEntry"("employeeId");

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
