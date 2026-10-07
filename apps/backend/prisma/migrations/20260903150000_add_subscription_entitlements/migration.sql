CREATE TYPE "SubscriptionPlan" AS ENUM ('STARTER', 'PRO', 'BUSINESS');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING_DOWNGRADE', 'CANCELLED');
CREATE TYPE "SubscriptionEventType" AS ENUM ('TRIAL_STARTED', 'ACTIVATED', 'REACTIVATED', 'EXPIRED', 'SUSPENDED', 'DOWNGRADE_SCHEDULED', 'DOWNGRADE_APPLIED', 'CANCELLED');

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrganizationSubscription" (
    "organizationId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'PRO',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3) NOT NULL,
    "trialUsedAt" TIMESTAMP(3),
    "pendingPlan" "SubscriptionPlan",
    "pendingPlanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("organizationId")
);
CREATE INDEX "OrganizationSubscription_status_endsAt_idx" ON "OrganizationSubscription"("status", "endsAt");
CREATE INDEX "OrganizationSubscription_status_graceEndsAt_idx" ON "OrganizationSubscription"("status", "graceEndsAt");
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" "SubscriptionEventType" NOT NULL,
    "previousPlan" "SubscriptionPlan",
    "nextPlan" "SubscriptionPlan",
    "previousStatus" "SubscriptionStatus",
    "nextStatus" "SubscriptionStatus",
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "metadata" JSONB,
    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionEvent_subscriptionId_occurredAt_idx" ON "SubscriptionEvent"("subscriptionId", "occurredAt");
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "OrganizationSubscription"("organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "OrganizationSubscription" ("organizationId", "plan", "status", "startsAt", "endsAt", "graceEndsAt", "trialUsedAt", "updatedAt")
SELECT "id", 'PRO', 'TRIALING', "createdAt", "createdAt" + INTERVAL '14 days', "createdAt" + INTERVAL '21 days', "createdAt", CURRENT_TIMESTAMP
FROM "Organization"
ON CONFLICT ("organizationId") DO NOTHING;

INSERT INTO "SubscriptionEvent" ("id", "subscriptionId", "type", "nextPlan", "nextStatus", "occurredAt")
SELECT "id" || ':trial', "id", 'TRIAL_STARTED', 'PRO', 'TRIALING', "createdAt"
FROM "Organization"
ON CONFLICT ("id") DO NOTHING;

CREATE OR REPLACE FUNCTION create_organization_trial_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "OrganizationSubscription" ("organizationId", "plan", "status", "startsAt", "endsAt", "graceEndsAt", "trialUsedAt", "updatedAt")
  VALUES (NEW."id", 'PRO', 'TRIALING', NEW."createdAt", NEW."createdAt" + INTERVAL '14 days', NEW."createdAt" + INTERVAL '21 days', NEW."createdAt", CURRENT_TIMESTAMP);
  INSERT INTO "SubscriptionEvent" ("id", "subscriptionId", "type", "nextPlan", "nextStatus", "occurredAt")
  VALUES (NEW."id" || ':trial', NEW."id", 'TRIAL_STARTED', 'PRO', 'TRIALING', NEW."createdAt");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organization_trial_subscription_after_insert
AFTER INSERT ON "Organization"
FOR EACH ROW EXECUTE FUNCTION create_organization_trial_subscription();
