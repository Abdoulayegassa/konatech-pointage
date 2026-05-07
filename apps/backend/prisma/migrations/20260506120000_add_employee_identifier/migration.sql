ALTER TABLE "Employee"
ADD COLUMN "employeeIdentifier" TEXT;

WITH ranked_employees AS (
  SELECT
    id,
    EXTRACT(YEAR FROM "createdAt")::int AS created_year,
    ROW_NUMBER() OVER (
      PARTITION BY EXTRACT(YEAR FROM "createdAt")::int
      ORDER BY "createdAt" ASC, id ASC
    ) AS sequence_number
  FROM "Employee"
)
UPDATE "Employee" AS employee
SET "employeeIdentifier" =
  'EMP-' ||
  ranked_employees.created_year::text ||
  '-' ||
  LPAD(ranked_employees.sequence_number::text, 3, '0')
FROM ranked_employees
WHERE employee.id = ranked_employees.id;

ALTER TABLE "Employee"
ALTER COLUMN "employeeIdentifier" SET NOT NULL;

CREATE UNIQUE INDEX "Employee_employeeIdentifier_key"
ON "Employee"("employeeIdentifier");
