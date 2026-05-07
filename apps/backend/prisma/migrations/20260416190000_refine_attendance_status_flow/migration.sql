CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'LATE', 'INCOMPLETE', 'ABSENT');

ALTER TABLE "Attendance" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Attendance"
ALTER COLUMN "status" TYPE "AttendanceStatus_new"
USING (
  CASE
    WHEN "status"::text = 'ON_TIME' AND "clockOutAt" IS NULL THEN 'INCOMPLETE'::"AttendanceStatus_new"
    WHEN "status"::text = 'ON_TIME' THEN 'PRESENT'::"AttendanceStatus_new"
    WHEN "status"::text = 'CHECKED_OUT' AND "minutesLate" > 0 THEN 'LATE'::"AttendanceStatus_new"
    WHEN "status"::text = 'CHECKED_OUT' THEN 'PRESENT'::"AttendanceStatus_new"
    WHEN "status"::text = 'LATE' THEN 'LATE'::"AttendanceStatus_new"
    ELSE 'ABSENT'::"AttendanceStatus_new"
  END
);

ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "AttendanceStatus_old";

ALTER TABLE "Attendance" ALTER COLUMN "status" SET DEFAULT 'INCOMPLETE';
