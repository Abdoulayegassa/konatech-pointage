-- CreateEnum
CREATE TYPE "SanctionRuleType" AS ENUM ('MINOR_LATENESS', 'MAJOR_LATENESS', 'EARLY_DEPARTURE', 'UNJUSTIFIED_ABSENCE', 'JUSTIFIED_ABSENCE', 'LEAVE', 'EXTERNAL_MISSION');

-- CreateEnum
CREATE TYPE "SanctionPeriod" AS ENUM ('MONTHLY');

-- CreateTable
CREATE TABLE "SanctionRule" (
    "id" TEXT NOT NULL,
    "type" "SanctionRuleType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "latenessMinMinutes" INTEGER,
    "latenessMinInclusive" BOOLEAN NOT NULL DEFAULT true,
    "latenessMaxMinutes" INTEGER,
    "latenessMaxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "monthlyTolerance" INTEGER NOT NULL DEFAULT 0,
    "amountFcfa" INTEGER NOT NULL DEFAULT 0,
    "period" "SanctionPeriod" NOT NULL DEFAULT 'MONTHLY',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "appliedReason" TEXT NOT NULL,
    "toleratedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SanctionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SanctionRule_type_active_idx" ON "SanctionRule"("type", "active");

-- CreateIndex
CREATE INDEX "SanctionRule_priority_idx" ON "SanctionRule"("priority");

-- Seed default V1 rules
INSERT INTO "SanctionRule" (
    "id",
    "type",
    "name",
    "description",
    "active",
    "latenessMinMinutes",
    "latenessMinInclusive",
    "latenessMaxMinutes",
    "latenessMaxInclusive",
    "monthlyTolerance",
    "amountFcfa",
    "period",
    "priority",
    "appliedReason",
    "toleratedReason",
    "updatedAt"
) VALUES
(
    '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001',
    'MINOR_LATENESS',
    'Retard mineur',
    NULL,
    true,
    0,
    false,
    15,
    false,
    1,
    2000,
    'MONTHLY',
    10,
    'Tolérance mensuelle déjà utilisée.',
    'Premier retard mineur du mois : tolérance accordée.',
    CURRENT_TIMESTAMP
),
(
    '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002',
    'MAJOR_LATENESS',
    'Retard majeur',
    NULL,
    true,
    15,
    true,
    NULL,
    false,
    0,
    5000,
    'MONTHLY',
    20,
    'Retard majeur (15 min ou plus) : sanction appliquée sans tolérance.',
    NULL,
    CURRENT_TIMESTAMP
);
