ALTER TABLE "Attendance"
ADD COLUMN "calendarNonWorkingDaySnapshot" BOOLEAN;

-- Punch statuses encode whether the calendar treated the date as non-working.
-- ABSENT rows are generated only for scheduled working days, so their applied
-- interpretation is false as well.
UPDATE "Attendance"
SET "calendarNonWorkingDaySnapshot" = ("status" = 'NON_WORKING_DAY_WORK')
WHERE "clockInAt" IS NOT NULL
   OR "status" = 'ABSENT';
