-- Create the SaaS tenant-scoped uniqueness before removing the global index.
CREATE UNIQUE INDEX "Employee_organizationId_email_key" ON "Employee"("organizationId", "email");

-- Preserve uniqueness for Legacy employees without an organization.
CREATE UNIQUE INDEX "Employee_email_legacy_unique_idx" ON "Employee"("email")
WHERE "organizationId" IS NULL;

CREATE UNIQUE INDEX "Employee_employeeCode_legacy_unique_idx" ON "Employee"("employeeCode")
WHERE "organizationId" IS NULL
  AND "employeeCode" IS NOT NULL;

CREATE UNIQUE INDEX "Employee_employeeIdentifier_legacy_unique_idx" ON "Employee"("employeeIdentifier")
WHERE "organizationId" IS NULL;

-- Preserve uniqueness for Legacy schedules without an organization.
CREATE UNIQUE INDEX "Schedule_name_legacy_unique_idx" ON "Schedule"("name")
WHERE "organizationId" IS NULL;

-- Preserve uniqueness for Legacy sanction rules without an organization.
CREATE UNIQUE INDEX "SanctionRule_code_legacy_unique_idx" ON "SanctionRule"("code")
WHERE "organizationId" IS NULL
  AND "code" IS NOT NULL;

-- Remove obsolete global uniqueness only after all replacement protections exist.
DROP INDEX "Employee_email_key";
DROP INDEX "Employee_employeeCode_key";
DROP INDEX "Employee_employeeIdentifier_key";
DROP INDEX "Schedule_name_key";
