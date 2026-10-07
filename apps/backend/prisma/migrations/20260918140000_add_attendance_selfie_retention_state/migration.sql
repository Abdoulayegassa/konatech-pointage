ALTER TABLE "Attendance"
  ADD COLUMN "checkInVerificationPhotoDeletedAt" TIMESTAMP(3),
  ADD COLUMN "checkInVerificationPhotoDeletionFailedAt" TIMESTAMP(3),
  ADD COLUMN "checkOutVerificationPhotoDeletedAt" TIMESTAMP(3),
  ADD COLUMN "checkOutVerificationPhotoDeletionFailedAt" TIMESTAMP(3);

CREATE INDEX "Attendance_checkInVerificationPhotoDeletedAt_idx"
  ON "Attendance"("checkInVerificationPhotoDeletedAt");
CREATE INDEX "Attendance_checkOutVerificationPhotoDeletedAt_idx"
  ON "Attendance"("checkOutVerificationPhotoDeletedAt");
