import 'dotenv/config';
import { MembershipRole, MembershipStatus, PrismaClient } from '@prisma/client';

const DISPOSABLE_DATABASE_NAME = 'konatech_attendance_e2e';
const DISPOSABLE_DATABASE_HOST = '127.0.0.1';
const DISPOSABLE_DATABASE_PORT = '5433';

type MembershipSummary = {
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  role: MembershipRole;
  status: MembershipStatus;
  count: number;
};

function assertDisposableDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');

  if (
    (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
    parsed.hostname !== DISPOSABLE_DATABASE_HOST ||
    parsed.port !== DISPOSABLE_DATABASE_PORT ||
    databaseName !== DISPOSABLE_DATABASE_NAME
  ) {
    throw new Error(
      `Refusing role-migration preflight outside ${DISPOSABLE_DATABASE_HOST}:${DISPOSABLE_DATABASE_PORT}/${DISPOSABLE_DATABASE_NAME}.`,
    );
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  assertDisposableDatabaseUrl(databaseUrl);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    const [memberships, managers, organizationsWithoutActiveAdmin] =
      await Promise.all([
        prisma.membership.groupBy({
          by: ['organizationId', 'role', 'status'],
          _count: { _all: true },
          orderBy: [
            { organizationId: 'asc' },
            { role: 'asc' },
            { status: 'asc' },
          ],
        }),
        prisma.membership.findMany({
          where: { role: MembershipRole.MANAGER },
          orderBy: [{ organizationId: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            organizationId: true,
            userId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: { id: true, normalizedEmail: true, status: true },
            },
            organization: { select: { name: true, status: true } },
          },
        }),
        prisma.organization.findMany({
          where: {
            status: 'ACTIVE',
            memberships: {
              none: {
                status: MembershipStatus.ACTIVE,
                role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
              },
            },
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

    const [organizationRows, managerEmployees] = await Promise.all([
      prisma.organization.findMany({
        select: { id: true, name: true, status: true },
      }),
      managers.length === 0
        ? Promise.resolve([])
        : prisma.employee.findMany({
            where: {
              OR: managers.map((manager) => ({
                organizationId: manager.organizationId,
                userId: manager.userId,
              })),
            },
            select: {
              organizationId: true,
              userId: true,
              id: true,
              isActive: true,
              employeeIdentifier: true,
            },
          }),
    ]);

    const organizationNames = new Map(
      organizationRows.map((organization) => [organization.id, organization]),
    );
    const employeesByOrganizationUser = new Map(
      managerEmployees.map((employee) => [
        `${employee.organizationId}:${employee.userId}`,
        employee,
      ]),
    );

    const membershipSummary: MembershipSummary[] = memberships.map((row) => {
      const organization = organizationNames.get(row.organizationId);
      return {
        organizationId: row.organizationId,
        organizationName: organization?.name ?? '[missing organization]',
        organizationStatus: organization?.status ?? 'UNKNOWN',
        role: row.role,
        status: row.status,
        count: row._count._all,
      };
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          target: `${DISPOSABLE_DATABASE_HOST}:${DISPOSABLE_DATABASE_PORT}/${DISPOSABLE_DATABASE_NAME}`,
          roleMapping: {
            OWNER: 'ADMIN',
            ADMIN: 'ADMIN',
            MANAGER: 'REQUIRES_EXPLICIT_ADMIN_DECISION',
            MEMBER: 'EMPLOYEE_IF_LINKED_TO_ACTIVE_EMPLOYEE_PROFILE',
          },
          membershipSummary,
          managersRequiringDecision: managers.map((manager) => ({
            membershipId: manager.id,
            organizationId: manager.organizationId,
            organizationName: manager.organization.name,
            organizationStatus: manager.organization.status,
            membershipStatus: manager.status,
            user: manager.user,
            linkedEmployee:
              employeesByOrganizationUser.get(
                `${manager.organizationId}:${manager.userId}`,
              ) ?? null,
            usageAttribution:
              'UNAVAILABLE: privileged audit events are log-only in the current baseline.',
          })),
          activeOrganizationsWithoutCurrentAdmin:
            organizationsWithoutActiveAdmin,
          readyForContractMigration:
            managers.length === 0 &&
            organizationsWithoutActiveAdmin.length === 0,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
