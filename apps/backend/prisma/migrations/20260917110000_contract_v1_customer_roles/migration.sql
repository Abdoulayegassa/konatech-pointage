-- V1 customer-role contract. This migration deliberately has no fallback for
-- MANAGER or orphaned MEMBER records: deployment must stop for human review.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Membership" WHERE "role" = 'MANAGER') THEN
    RAISE EXCEPTION 'V1 role migration blocked: unresolved MANAGER memberships exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Membership" membership
    WHERE membership."role" = 'MEMBER'
      AND NOT EXISTS (
        SELECT 1
        FROM "Employee" employee
        WHERE employee."organizationId" = membership."organizationId"
          AND employee."userId" = membership."userId"
          AND employee."isActive" = true
      )
  ) THEN
    RAISE EXCEPTION 'V1 role migration blocked: MEMBER without an active linked Employee exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Organization" organization
    WHERE organization."status" = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1
        FROM "Membership" membership
        WHERE membership."organizationId" = organization."id"
          AND membership."status" = 'ACTIVE'
          AND membership."role" IN ('OWNER', 'ADMIN')
      )
  ) THEN
    RAISE EXCEPTION 'V1 role migration blocked: active organization without an active administrator exists';
  END IF;
END $$;

UPDATE "Membership"
SET "membershipVersion" = "membershipVersion" + 1
WHERE "role" IN ('OWNER', 'MEMBER');

ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_legacy";
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'EMPLOYEE');
ALTER TABLE "Membership"
  ALTER COLUMN "role" TYPE "MembershipRole"
  USING CASE "role"::text
    WHEN 'OWNER' THEN 'ADMIN'::"MembershipRole"
    WHEN 'MEMBER' THEN 'EMPLOYEE'::"MembershipRole"
    ELSE "role"::text::"MembershipRole"
  END;
DROP TYPE "MembershipRole_legacy";
