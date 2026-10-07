-- One organization-wide holiday per date and one local holiday per site/date.
-- Split partial indexes enforce uniqueness for nullable scope columns.
DROP INDEX IF EXISTS "CalendarEntry_tenant_holiday_date_key";

CREATE UNIQUE INDEX "CalendarEntry_org_holiday_date_key"
ON "CalendarEntry"("organizationId", "date")
WHERE "organizationId" IS NOT NULL
  AND "siteId" IS NULL
  AND "employeeId" IS NULL
  AND "type" IN ('PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY');

CREATE UNIQUE INDEX "CalendarEntry_site_holiday_date_key"
ON "CalendarEntry"("organizationId", "siteId", "date")
WHERE "organizationId" IS NOT NULL
  AND "siteId" IS NOT NULL
  AND "employeeId" IS NULL
  AND "type" IN ('PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY');
