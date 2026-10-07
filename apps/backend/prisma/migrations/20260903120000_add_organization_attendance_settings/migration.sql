CREATE TABLE "OrganizationAttendanceSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "gpsRequired" BOOLEAN NOT NULL DEFAULT false,
    "selfieRequired" BOOLEAN NOT NULL DEFAULT false,
    "allowedRadiusMeters" INTEGER,
    "defaultLatenessMarginMinutes" INTEGER,
    "defaultWorkDays" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationAttendanceSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationAttendanceSettings_organizationId_key" ON "OrganizationAttendanceSettings"("organizationId");
ALTER TABLE "OrganizationAttendanceSettings" ADD CONSTRAINT "OrganizationAttendanceSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
