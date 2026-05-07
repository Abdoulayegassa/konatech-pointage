ALTER TABLE "Attendance"
ADD COLUMN "checkOutLatitude" DOUBLE PRECISION,
ADD COLUMN "checkOutLongitude" DOUBLE PRECISION,
ADD COLUMN "checkOutAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "checkOutDistanceMeters" INTEGER,
ADD COLUMN "checkOutVerificationMethod" "AttendanceVerificationMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN "checkOutVerificationReason" TEXT,
ADD COLUMN "checkOutVerificationLevel" "AttendanceVerificationLevel" NOT NULL DEFAULT 'OK',
ADD COLUMN "checkOutVerificationPhoto" TEXT,
ADD COLUMN "checkOutVerificationPhotoPublicId" TEXT;

CREATE INDEX "Attendance_checkOutDistanceMeters_idx" ON "Attendance"("checkOutDistanceMeters");
CREATE INDEX "Attendance_checkOutVerificationLevel_idx" ON "Attendance"("checkOutVerificationLevel");
