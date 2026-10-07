ALTER TABLE "OrganizationAttendanceSettings"
  ALTER COLUMN "gpsRequired" DROP NOT NULL,
  ALTER COLUMN "gpsRequired" DROP DEFAULT,
  ALTER COLUMN "selfieRequired" DROP NOT NULL,
  ALTER COLUMN "selfieRequired" DROP DEFAULT;
