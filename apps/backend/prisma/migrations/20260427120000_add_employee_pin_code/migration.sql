ALTER TABLE "Employee"
ADD COLUMN "pinCode" TEXT;

CREATE UNIQUE INDEX "Employee_pinCode_key" ON "Employee"("pinCode");
