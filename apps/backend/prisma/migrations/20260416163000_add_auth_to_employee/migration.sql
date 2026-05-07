-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('ADMIN', 'EMPLOYEE');

-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "accessRole" "AccessRole" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN "passwordHash" TEXT;

UPDATE "Employee"
SET "passwordHash" = '';

-- AlterTable
ALTER TABLE "Employee"
ALTER COLUMN "passwordHash" SET NOT NULL;
