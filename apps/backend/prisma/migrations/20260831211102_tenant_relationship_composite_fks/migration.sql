-- Add tenant-scoped relationship guards alongside the existing simple foreign keys.
-- MATCH SIMPLE intentionally preserves the nullable Legacy namespace behavior.
ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_organizationId_scheduleId_tenant_fkey"
FOREIGN KEY ("organizationId", "scheduleId")
REFERENCES "Schedule"("organizationId", "id")
MATCH SIMPLE
ON DELETE SET NULL ("scheduleId")
ON UPDATE NO ACTION
NOT VALID;

ALTER TABLE "Attendance"
ADD CONSTRAINT "Attendance_organizationId_employeeId_tenant_fkey"
FOREIGN KEY ("organizationId", "employeeId")
REFERENCES "Employee"("organizationId", "id")
MATCH SIMPLE
ON DELETE CASCADE
ON UPDATE NO ACTION
NOT VALID;

ALTER TABLE "CalendarEntry"
ADD CONSTRAINT "CalendarEntry_organizationId_employeeId_tenant_fkey"
FOREIGN KEY ("organizationId", "employeeId")
REFERENCES "Employee"("organizationId", "id")
MATCH SIMPLE
ON DELETE SET NULL ("employeeId")
ON UPDATE NO ACTION
NOT VALID;

ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_organizationId_userId_membership_fkey"
FOREIGN KEY ("organizationId", "userId")
REFERENCES "Membership"("organizationId", "userId")
MATCH SIMPLE
ON DELETE NO ACTION
ON UPDATE NO ACTION
NOT VALID;

ALTER TABLE "Employee"
VALIDATE CONSTRAINT "Employee_organizationId_scheduleId_tenant_fkey";

ALTER TABLE "Attendance"
VALIDATE CONSTRAINT "Attendance_organizationId_employeeId_tenant_fkey";

ALTER TABLE "CalendarEntry"
VALIDATE CONSTRAINT "CalendarEntry_organizationId_employeeId_tenant_fkey";

ALTER TABLE "Employee"
VALIDATE CONSTRAINT "Employee_organizationId_userId_membership_fkey";
