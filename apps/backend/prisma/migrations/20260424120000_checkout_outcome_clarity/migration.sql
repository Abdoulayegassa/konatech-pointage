ALTER TABLE "Attendance"
ADD COLUMN "earlyExit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "earlyExitMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "overtimeMinutes" INTEGER NOT NULL DEFAULT 0;

UPDATE "Attendance"
SET "overtimeMinutes" = GREATEST(ROUND("overtimeHours" * 60), 0)::INTEGER,
    "earlyExit" = false,
    "earlyExitMinutes" = 0;

CREATE INDEX "Attendance_earlyExit_idx" ON "Attendance"("earlyExit");
