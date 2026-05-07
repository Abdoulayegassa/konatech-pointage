CREATE TYPE "AttendanceVerificationLevel" AS ENUM ('OK', 'WARNING', 'STRICT');

ALTER TABLE "Attendance"
ADD COLUMN "checkInVerificationLevel" "AttendanceVerificationLevel" NOT NULL DEFAULT 'OK';

CREATE INDEX "Attendance_checkInVerificationLevel_idx" ON "Attendance"("checkInVerificationLevel");
