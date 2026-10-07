-- Phase 2D is deliberately additive. Existing legacy records retain nullable
-- scope fields and begin in REVIEW_REQUIRED; no organization, site, assignment
-- or historical attendance relationship is inferred here.
CREATE TYPE "V1OperationalScopeStatus" AS ENUM ('OPERATIONAL', 'REVIEW_REQUIRED', 'LEGACY_EXCLUDED');
CREATE TYPE "V1ScopeReasonCode" AS ENUM ('MIGRATION_PENDING', 'MISSING_ORGANIZATION', 'NO_OPERATIONAL_SITE', 'AMBIGUOUS_CURRENT_PRIMARY_SITE', 'ATTENDANCE_MISSING_SCOPE', 'ATTENDANCE_SCOPE_MISMATCH', 'ASSIGNMENT_EFFECTIVE_DATE_UNPROVEN', 'SCHEDULE_SCOPE_UNPROVEN', 'CALENDAR_SCOPE_UNPROVEN', 'SANCTION_SCOPE_OR_CODE_UNPROVEN', 'LEGACY_EXCLUDED', 'OTHER_REVIEW_REQUIRED');
CREATE TYPE "MigrationReviewResourceType" AS ENUM ('ORGANIZATION', 'EMPLOYEE', 'ATTENDANCE', 'SCHEDULE', 'CALENDAR_ENTRY', 'SANCTION_RULE');
CREATE TYPE "MigrationReviewAction" AS ENUM ('CLASSIFIED', 'MAPPING_PROPOSED', 'MAPPING_APPROVED', 'EXCLUDED', 'RESOLVED');

ALTER TABLE "Organization"
  ADD COLUMN "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "v1ScopeReasonCode" "V1ScopeReasonCode",
  ADD COLUMN "v1ScopeReviewedAt" TIMESTAMP(3);

ALTER TABLE "Employee"
  ADD COLUMN "primarySiteId" TEXT,
  ADD COLUMN "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "v1ScopeReasonCode" "V1ScopeReasonCode",
  ADD COLUMN "v1ScopeReviewedAt" TIMESTAMP(3);

ALTER TABLE "Schedule"
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "v1ScopeReasonCode" "V1ScopeReasonCode",
  ADD COLUMN "v1ScopeReviewedAt" TIMESTAMP(3);

ALTER TABLE "Attendance"
  ADD COLUMN "employeeSiteAssignmentId" TEXT,
  ADD COLUMN "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "v1ScopeReasonCode" "V1ScopeReasonCode",
  ADD COLUMN "v1ScopeReviewedAt" TIMESTAMP(3);

ALTER TABLE "CalendarEntry"
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "v1ScopeReasonCode" "V1ScopeReasonCode",
  ADD COLUMN "v1ScopeReviewedAt" TIMESTAMP(3);

ALTER TABLE "SanctionRule"
  ADD COLUMN "siteId" TEXT,
  ADD COLUMN "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "v1ScopeReasonCode" "V1ScopeReasonCode",
  ADD COLUMN "v1ScopeReviewedAt" TIMESTAMP(3);

CREATE TABLE "EmployeeSiteAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "transferReason" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeSiteAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteAttendanceSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "gpsRequired" BOOLEAN,
  "selfieRequired" BOOLEAN,
  "defaultLatenessMarginMinutes" INTEGER,
  "defaultWorkDays" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteAttendanceSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MigrationReviewEvent" (
  "id" TEXT NOT NULL,
  "resourceType" "MigrationReviewResourceType" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "organizationId" TEXT,
  "previousScopeStatus" "V1OperationalScopeStatus",
  "nextScopeStatus" "V1OperationalScopeStatus" NOT NULL,
  "action" "MigrationReviewAction" NOT NULL,
  "reasonCode" "V1ScopeReasonCode",
  "mappingDecision" JSONB,
  "manifestVersion" TEXT,
  "actorUserId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MigrationReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeSiteAssignment_organizationId_id_key"
  ON "EmployeeSiteAssignment"("organizationId", "id");
CREATE UNIQUE INDEX "EmployeeSiteAssignment_assignment_tenant_site_key"
  ON "EmployeeSiteAssignment"("organizationId", "employeeId", "siteId", "id");
CREATE INDEX "EmployeeSiteAssignment_organizationId_employeeId_effectiveFrom_idx"
  ON "EmployeeSiteAssignment"("organizationId", "employeeId", "effectiveFrom");
CREATE INDEX "EmployeeSiteAssignment_organizationId_siteId_effectiveFrom_idx"
  ON "EmployeeSiteAssignment"("organizationId", "siteId", "effectiveFrom");
CREATE UNIQUE INDEX "EmployeeSiteAssignment_one_open_assignment_per_employee_key"
  ON "EmployeeSiteAssignment"("organizationId", "employeeId")
  WHERE "effectiveTo" IS NULL;

CREATE UNIQUE INDEX "Attendance_organizationId_id_key"
  ON "Attendance"("organizationId", "id");
CREATE UNIQUE INDEX "SanctionRule_organizationId_id_key"
  ON "SanctionRule"("organizationId", "id");
CREATE UNIQUE INDEX "SiteAttendanceSettings_organizationId_siteId_key"
  ON "SiteAttendanceSettings"("organizationId", "siteId");

CREATE INDEX "Organization_v1ScopeStatus_idx" ON "Organization"("v1ScopeStatus");
CREATE INDEX "Employee_organizationId_primarySiteId_isActive_idx"
  ON "Employee"("organizationId", "primarySiteId", "isActive");
CREATE INDEX "Employee_organizationId_v1ScopeStatus_idx"
  ON "Employee"("organizationId", "v1ScopeStatus");
CREATE INDEX "Schedule_organizationId_siteId_isActive_idx"
  ON "Schedule"("organizationId", "siteId", "isActive");
CREATE INDEX "Schedule_organizationId_v1ScopeStatus_idx"
  ON "Schedule"("organizationId", "v1ScopeStatus");
CREATE INDEX "Attendance_organizationId_employeeId_attendanceSiteId_assignment_idx"
  ON "Attendance"("organizationId", "employeeId", "attendanceSiteId", "employeeSiteAssignmentId");
CREATE INDEX "Attendance_organizationId_v1ScopeStatus_date_idx"
  ON "Attendance"("organizationId", "v1ScopeStatus", "date");
CREATE INDEX "CalendarEntry_organizationId_siteId_date_idx"
  ON "CalendarEntry"("organizationId", "siteId", "date");
CREATE INDEX "CalendarEntry_organizationId_v1ScopeStatus_date_idx"
  ON "CalendarEntry"("organizationId", "v1ScopeStatus", "date");
CREATE INDEX "SanctionRule_organizationId_siteId_type_active_idx"
  ON "SanctionRule"("organizationId", "siteId", "type", "active");
CREATE INDEX "SanctionRule_organizationId_v1ScopeStatus_idx"
  ON "SanctionRule"("organizationId", "v1ScopeStatus");
CREATE INDEX "MigrationReviewEvent_resourceType_resourceId_occurredAt_idx"
  ON "MigrationReviewEvent"("resourceType", "resourceId", "occurredAt");
CREATE INDEX "MigrationReviewEvent_organizationId_occurredAt_idx"
  ON "MigrationReviewEvent"("organizationId", "occurredAt");
CREATE INDEX "MigrationReviewEvent_actorUserId_occurredAt_idx"
  ON "MigrationReviewEvent"("actorUserId", "occurredAt");

ALTER TABLE "EmployeeSiteAssignment"
  ADD CONSTRAINT "EmployeeSiteAssignment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSiteAssignment_organizationId_employeeId_fkey"
  FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSiteAssignment_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSiteAssignment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeSiteAssignment_effective_window_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_organizationId_primarySiteId_fkey"
  FOREIGN KEY ("organizationId", "primarySiteId") REFERENCES "AttendanceSite"("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SanctionRule"
  ADD CONSTRAINT "SanctionRule_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_historical_assignment_fkey"
  FOREIGN KEY ("organizationId", "employeeId", "attendanceSiteId", "employeeSiteAssignmentId")
  REFERENCES "EmployeeSiteAssignment"("organizationId", "employeeId", "siteId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing offline queue records are retained without inference. NOT VALID
-- preserves them while PostgreSQL enforces the tenant/site relationships for
-- every new or changed queue record.
ALTER TABLE "OfflineAttendanceSyncRequest"
  ADD CONSTRAINT "OfflineAttendanceSyncRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "OfflineAttendanceSyncRequest_organizationId_employeeId_fkey"
  FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "OfflineAttendanceSyncRequest_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "OfflineAttendanceSyncRequest_organizationId_attendanceId_fkey"
  FOREIGN KEY ("organizationId", "attendanceId") REFERENCES "Attendance"("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "SiteAttendanceSettings"
  ADD CONSTRAINT "SiteAttendanceSettings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SiteAttendanceSettings_organizationId_siteId_fkey"
  FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MigrationReviewEvent"
  ADD CONSTRAINT "MigrationReviewEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "MigrationReviewEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_v1ScopeReasonCode_required_for_exclusion"
  CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL);
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_v1ScopeReasonCode_required_for_exclusion"
  CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL);
ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_v1ScopeReasonCode_required_for_exclusion"
  CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL);
ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_v1ScopeReasonCode_required_for_exclusion"
  CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL);
ALTER TABLE "CalendarEntry"
  ADD CONSTRAINT "CalendarEntry_v1ScopeReasonCode_required_for_exclusion"
  CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL);
ALTER TABLE "SanctionRule"
  ADD CONSTRAINT "SanctionRule_v1ScopeReasonCode_required_for_exclusion"
  CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL);

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "EmployeeSiteAssignment"
  ADD CONSTRAINT "EmployeeSiteAssignment_no_overlapping_effective_ranges"
  EXCLUDE USING GIST (
    "organizationId" WITH =,
    "employeeId" WITH =,
    tsrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamp), '[)') WITH &&
  );

CREATE OR REPLACE FUNCTION "prevent_attendance_scope_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."organizationId" IS NOT NULL
     AND NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
    RAISE EXCEPTION 'Attendance organization scope is immutable';
  END IF;
  IF OLD."attendanceSiteId" IS NOT NULL
     AND NEW."attendanceSiteId" IS DISTINCT FROM OLD."attendanceSiteId" THEN
    RAISE EXCEPTION 'Attendance site scope is immutable';
  END IF;
  IF OLD."employeeSiteAssignmentId" IS NOT NULL
     AND NEW."employeeSiteAssignmentId" IS DISTINCT FROM OLD."employeeSiteAssignmentId" THEN
    RAISE EXCEPTION 'Attendance assignment scope is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Attendance_prevent_scope_mutation"
BEFORE UPDATE OF "organizationId", "attendanceSiteId", "employeeSiteAssignmentId" ON "Attendance"
FOR EACH ROW EXECUTE FUNCTION "prevent_attendance_scope_mutation"();

CREATE OR REPLACE FUNCTION "prevent_migration_review_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MigrationReviewEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MigrationReviewEvent_prevent_mutation"
BEFORE UPDATE OR DELETE ON "MigrationReviewEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_migration_review_event_mutation"();
