-- Holidays are organization-wide entries. Employee-specific calendar entries
-- remain outside this constraint so several employees can have events per day.
CREATE UNIQUE INDEX "CalendarEntry_tenant_holiday_date_key"
ON "CalendarEntry"("organizationId", "date")
WHERE "organizationId" IS NOT NULL
  AND "employeeId" IS NULL
  AND "type" IN ('PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY');
