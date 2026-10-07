-- AttendanceSite is retained by Attendance so historical records keep their
-- original site. Existing Legacy and pre-migration records intentionally stay
-- NULL because no reliable site can be inferred.
CREATE UNIQUE INDEX "AttendanceSite_organizationId_id_key"
ON "AttendanceSite"("organizationId", "id");

ALTER TABLE "Attendance"
ADD COLUMN "attendanceSiteId" TEXT;

CREATE INDEX "Attendance_organizationId_attendanceSiteId_date_idx"
ON "Attendance"("organizationId", "attendanceSiteId", "date");

ALTER TABLE "Attendance"
ADD CONSTRAINT "Attendance_organizationId_attendanceSiteId_fkey"
FOREIGN KEY ("organizationId", "attendanceSiteId")
REFERENCES "AttendanceSite"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
