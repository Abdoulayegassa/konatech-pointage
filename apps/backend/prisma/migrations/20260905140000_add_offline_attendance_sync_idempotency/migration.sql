CREATE TYPE "OfflineAttendanceSyncStatus" AS ENUM ('PROCESSING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "OfflineAttendanceSyncRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "siteId" TEXT,
    "payloadHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "OfflineAttendanceSyncStatus" NOT NULL DEFAULT 'PROCESSING',
    "attendanceId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineAttendanceSyncRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfflineAttendanceSyncRequest_organizationId_clientRequestId_key"
ON "OfflineAttendanceSyncRequest"("organizationId", "clientRequestId");

CREATE INDEX "OfflineAttendanceSyncRequest_organizationId_employeeId_capturedAt_idx"
ON "OfflineAttendanceSyncRequest"("organizationId", "employeeId", "capturedAt");

CREATE INDEX "OfflineAttendanceSyncRequest_status_updatedAt_idx"
ON "OfflineAttendanceSyncRequest"("status", "updatedAt");
