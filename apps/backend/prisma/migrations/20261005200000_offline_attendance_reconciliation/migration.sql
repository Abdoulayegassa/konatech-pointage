CREATE TYPE "OfflineAttendanceReconciliationStatus" AS ENUM (
  'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED', 'EXPIRED'
);
CREATE TYPE "OfflineAttendanceReconciliationDecisionType" AS ENUM ('APPROVE', 'REJECT', 'RESOLVE');

CREATE UNIQUE INDEX "OfflineAttendanceSyncRequest_organizationId_id_key"
ON "OfflineAttendanceSyncRequest"("organizationId", "id");

CREATE TABLE "OfflineAttendanceReconciliation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "syncRequestId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "siteId" TEXT,
  "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "comments" TEXT,
  "evidenceSnapshot" JSONB,
  "selfiePublicId" TEXT,
  "selfieMimeType" TEXT,
  "selfieByteSize" INTEGER,
  "selfieSha256" TEXT,
  "status" "OfflineAttendanceReconciliationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionReason" TEXT,
  "resultingAttendanceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfflineAttendanceReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfflineAttendanceReconciliation_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfflineAttendanceReconciliation_request_fkey" FOREIGN KEY ("organizationId", "syncRequestId") REFERENCES "OfflineAttendanceSyncRequest"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfflineAttendanceReconciliation_employee_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfflineAttendanceReconciliation_site_fkey" FOREIGN KEY ("organizationId", "siteId") REFERENCES "AttendanceSite"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OfflineAttendanceReconciliation_syncRequestId_key" ON "OfflineAttendanceReconciliation"("syncRequestId");
CREATE UNIQUE INDEX "OfflineAttendanceReconciliation_organizationId_syncRequestId_key" ON "OfflineAttendanceReconciliation"("organizationId", "syncRequestId");
CREATE UNIQUE INDEX "OfflineAttendanceReconciliation_organizationId_selfieSha256_key" ON "OfflineAttendanceReconciliation"("organizationId", "selfieSha256");
CREATE INDEX "OfflineAttendanceReconciliation_organizationId_status_createdAt_idx" ON "OfflineAttendanceReconciliation"("organizationId", "status", "createdAt");
CREATE INDEX "OfflineAttendanceReconciliation_organizationId_employeeId_createdAt_idx" ON "OfflineAttendanceReconciliation"("organizationId", "employeeId", "createdAt");
CREATE INDEX "OfflineAttendanceReconciliation_organizationId_siteId_createdAt_idx" ON "OfflineAttendanceReconciliation"("organizationId", "siteId", "createdAt");
CREATE UNIQUE INDEX "OfflineAttendanceReconciliation_organizationId_id_key" ON "OfflineAttendanceReconciliation"("organizationId", "id");

CREATE TABLE "OfflineAttendanceReconciliationDecision" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "decision" "OfflineAttendanceReconciliationDecisionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineAttendanceReconciliationDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfflineAttendanceReconciliationDecision_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfflineAttendanceReconciliationDecision_case_fkey" FOREIGN KEY ("organizationId", "reconciliationId") REFERENCES "OfflineAttendanceReconciliation"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfflineAttendanceReconciliationDecision_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "OfflineAttendanceReconciliationDecision_organizationId_reconciliationId_decidedAt_idx" ON "OfflineAttendanceReconciliationDecision"("organizationId", "reconciliationId", "decidedAt");
CREATE INDEX "OfflineAttendanceReconciliationDecision_actorUserId_decidedAt_idx" ON "OfflineAttendanceReconciliationDecision"("actorUserId", "decidedAt");
