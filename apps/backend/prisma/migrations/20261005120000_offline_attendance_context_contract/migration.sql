ALTER TYPE "OfflineAttendanceSyncStatus" ADD VALUE IF NOT EXISTS 'RECONCILIATION_REQUIRED';
ALTER TYPE "OfflineAttendanceSyncStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "OfflineAttendanceSyncRequest"
ADD COLUMN "contextSnapshot" JSONB;
