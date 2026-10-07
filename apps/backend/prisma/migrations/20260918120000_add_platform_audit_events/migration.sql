CREATE TABLE "PlatformAuditEvent" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "organizationId" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditEvent_actorUserId_occurredAt_idx"
  ON "PlatformAuditEvent"("actorUserId", "occurredAt");
CREATE INDEX "PlatformAuditEvent_organizationId_occurredAt_idx"
  ON "PlatformAuditEvent"("organizationId", "occurredAt");
CREATE INDEX "PlatformAuditEvent_resource_resourceId_occurredAt_idx"
  ON "PlatformAuditEvent"("resource", "resourceId", "occurredAt");

ALTER TABLE "PlatformAuditEvent"
  ADD CONSTRAINT "PlatformAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PlatformAuditEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_platform_audit_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformAuditEvent_prevent_mutation"
BEFORE UPDATE OR DELETE ON "PlatformAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_platform_audit_event_mutation"();
