ALTER TABLE "Attendance"
ADD COLUMN "scheduleIdSnapshot" TEXT,
ADD COLUMN "scheduleNameSnapshot" TEXT,
ADD COLUMN "scheduleStartTimeSnapshot" TEXT,
ADD COLUMN "scheduleEndTimeSnapshot" TEXT,
ADD COLUMN "scheduleWorkDaysSnapshot" JSONB,
ADD COLUMN "scheduleLatenessMarginSnapshot" INTEGER,
ADD COLUMN "scheduleCapturedAt" TIMESTAMP(3);
