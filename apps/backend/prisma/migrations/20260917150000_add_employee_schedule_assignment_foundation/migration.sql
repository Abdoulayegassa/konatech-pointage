-- Phase 2E.4B.2 is additive. Legacy Employee.scheduleId remains the
-- compatibility reference and no historical schedule assignment is inferred.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "EmployeeScheduleAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "employeeSiteAssignmentId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "reason" TEXT,
  "createdByUserId" TEXT,
  "v1ScopeStatus" "V1OperationalScopeStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "v1ScopeReasonCode" "V1ScopeReasonCode",
  "v1ScopeReviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeScheduleAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeScheduleAssignment_effective_window_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
  CONSTRAINT "EmployeeScheduleAssignment_scope_reason_required_for_exclusion"
    CHECK ("v1ScopeStatus" <> 'LEGACY_EXCLUDED' OR "v1ScopeReasonCode" IS NOT NULL)
);

-- This nullable composite key preserves legacy schedules without site scope,
-- while making a non-null schedule site enforceable by the new assignment FK.
CREATE UNIQUE INDEX "Schedule_organizationId_siteId_id_key"
  ON "Schedule"("organizationId", "siteId", "id");

CREATE UNIQUE INDEX "EmployeeScheduleAssignment_organizationId_id_key"
  ON "EmployeeScheduleAssignment"("organizationId", "id");
CREATE INDEX "EmployeeScheduleAssignment_organizationId_employeeId_effectiveFrom_idx"
  ON "EmployeeScheduleAssignment"("organizationId", "employeeId", "effectiveFrom");
CREATE INDEX "EmployeeScheduleAssignment_organizationId_siteId_effectiveFrom_idx"
  ON "EmployeeScheduleAssignment"("organizationId", "siteId", "effectiveFrom");
CREATE INDEX "EmployeeScheduleAssignment_organizationId_scheduleId_effectiveFrom_idx"
  ON "EmployeeScheduleAssignment"("organizationId", "scheduleId", "effectiveFrom");

ALTER TABLE "EmployeeScheduleAssignment"
  ADD CONSTRAINT "EmployeeScheduleAssignment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeScheduleAssignment_organizationId_employeeId_fkey"
    FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeScheduleAssignment_organizationId_siteId_fkey"
    FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeScheduleAssignment_organizationId_siteId_scheduleId_fkey"
    FOREIGN KEY ("organizationId", "siteId", "scheduleId") REFERENCES "Schedule"("organizationId", "siteId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeScheduleAssignment_site_lineage_fkey"
    FOREIGN KEY ("organizationId", "employeeId", "siteId", "employeeSiteAssignmentId")
    REFERENCES "EmployeeSiteAssignment"("organizationId", "employeeId", "siteId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "EmployeeScheduleAssignment_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeScheduleAssignment"
  ADD CONSTRAINT "EmployeeScheduleAssignment_no_overlapping_effective_ranges"
  EXCLUDE USING GIST (
    "organizationId" WITH =,
    "employeeId" WITH =,
    tsrange("effectiveFrom", COALESCE("effectiveTo", 'infinity'::timestamp), '[)') WITH &&
  );
