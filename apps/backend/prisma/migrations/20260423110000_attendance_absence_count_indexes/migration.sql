ALTER TABLE "Attendance"
ADD COLUMN "absenceCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Attendance_overtimeHours_idx" ON "Attendance"("overtimeHours");
CREATE INDEX "Attendance_absenceCount_idx" ON "Attendance"("absenceCount");
