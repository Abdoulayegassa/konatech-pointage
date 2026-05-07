CREATE TYPE "AttendanceVerificationMethod" AS ENUM ('NONE', 'GPS', 'PHOTO');

ALTER TABLE "Attendance"
ADD COLUMN "checkInLatitude" DOUBLE PRECISION,
ADD COLUMN "checkInLongitude" DOUBLE PRECISION,
ADD COLUMN "checkInAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN "checkInDistanceMeters" INTEGER,
ADD COLUMN "checkInVerificationMethod" "AttendanceVerificationMethod" NOT NULL DEFAULT 'NONE',
ADD COLUMN "checkInVerificationReason" TEXT,
ADD COLUMN "checkInVerificationPhoto" TEXT;

CREATE INDEX "Attendance_checkInDistanceMeters_idx" ON "Attendance"("checkInDistanceMeters");
