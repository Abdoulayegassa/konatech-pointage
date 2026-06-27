-- Rename legacy seeded sanction rule IDs to deterministic UUIDs.
UPDATE "SanctionRule"
SET
    "id" = '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default-minor-lateness'
  AND NOT EXISTS (
      SELECT 1
      FROM "SanctionRule"
      WHERE "id" = '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001'
  );

DELETE FROM "SanctionRule"
WHERE "id" = 'default-minor-lateness'
  AND EXISTS (
      SELECT 1
      FROM "SanctionRule"
      WHERE "id" = '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001'
  );

UPDATE "SanctionRule"
SET
    "id" = '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default-major-lateness'
  AND NOT EXISTS (
      SELECT 1
      FROM "SanctionRule"
      WHERE "id" = '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002'
  );

DELETE FROM "SanctionRule"
WHERE "id" = 'default-major-lateness'
  AND EXISTS (
      SELECT 1
      FROM "SanctionRule"
      WHERE "id" = '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002'
  );
