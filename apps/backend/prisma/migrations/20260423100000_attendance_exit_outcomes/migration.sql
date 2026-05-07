ALTER TABLE "Attendance"
ADD COLUMN "scheduledExitTime" TIMESTAMP(3),
ADD COLUMN "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lateExit" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Attendance_lateExit_idx" ON "Attendance"("lateExit");
