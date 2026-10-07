ALTER TABLE "OfflineAttendanceReconciliation"
  ADD COLUMN "selfieDeletedAt" TIMESTAMP(3),
  ADD COLUMN "selfieDeletionFailedAt" TIMESTAMP(3);
CREATE TABLE "ReconciliationEvidenceUpload" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationEvidenceUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReconciliationEvidenceUpload_publicId_key" ON "ReconciliationEvidenceUpload"("publicId");
CREATE INDEX "ReconciliationEvidenceUpload_createdAt_idx" ON "ReconciliationEvidenceUpload"("createdAt");

ALTER TABLE "Attendance" ADD COLUMN "checkInSelfieSha256" TEXT, ADD COLUMN "checkOutSelfieSha256" TEXT;
-- Preserve reuse detection independently of binary evidence retention.
UPDATE "Attendance" SET "checkInSelfieSha256" = substring("checkInVerificationPhotoPublicId" from '([a-f0-9]{64})$') WHERE "checkInVerificationPhotoPublicId" IS NOT NULL;
UPDATE "Attendance" SET "checkOutSelfieSha256" = substring("checkOutVerificationPhotoPublicId" from '([a-f0-9]{64})$') WHERE "checkOutVerificationPhotoPublicId" IS NOT NULL;
CREATE INDEX "Attendance_organizationId_checkInSelfieSha256_idx" ON "Attendance"("organizationId", "checkInSelfieSha256");
CREATE INDEX "Attendance_organizationId_checkOutSelfieSha256_idx" ON "Attendance"("organizationId", "checkOutSelfieSha256");
