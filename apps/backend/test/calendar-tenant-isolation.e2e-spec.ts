import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  PrismaClient,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

const accountContext = (
  organizationId: string | null,
): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'user-a',
  membershipId: 'membership-a',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

const legacyContext: AuthenticationContext = {
  generation: 'legacy',
  purpose: 'account',
  userId: null,
  membershipId: null,
  organizationId: null,
  membershipRole: null,
  employeeId: 'legacy-employee',
  attendanceSiteId: null,
};

describe('Calendar tenant isolation (e2e)', () => {
  let prisma: PrismaClient;
  let service: CalendarService;
  let organizationAId: string;
  let organizationBId: string;
  let entryAId: string;
  let entryBId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    service = new CalendarService(prisma as never);

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Calendar Tenant A',
          slug: 'calendar-tenant-a',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Calendar Tenant B',
          slug: 'calendar-tenant-b',
          timezone: 'Etc/UTC',
        },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const [entryA, entryB] = await Promise.all([
      service.create(
        {
          name: 'Tenant A holiday',
          date: '2026-08-03',
          type: 'PUBLIC_HOLIDAY',
        },
        accountContext(organizationAId),
      ),
      service.create(
        {
          name: 'Tenant B holiday',
          date: '2026-08-04',
          type: 'COMPANY_HOLIDAY',
        },
        accountContext(organizationBId),
      ),
    ]);
    entryAId = entryA.id;
    entryBId = entryB.id;
  });

  afterAll(async () => {
    if (prisma && organizationAId && organizationBId) {
      const organizationIds = [organizationAId, organizationBId];
      await prisma.calendarEntry.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.subscriptionEvent.deleteMany({
        where: { subscriptionId: { in: organizationIds } },
      });
      await prisma.organizationSubscription.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await prisma?.$disconnect();
  });

  it('lists only entries from the authenticated organization', async () => {
    const entries = await service.findMonthEntries(
      '2026-08',
      accountContext(organizationAId),
    );

    expect(entries.map((entry) => entry.id)).toContain(entryAId);
    expect(entries.map((entry) => entry.id)).not.toContain(entryBId);
  });

  it('does not retrieve an entry from another organization', async () => {
    const overview = await service.getMonthOverview(
      '2026-08',
      accountContext(organizationAId),
    );

    expect(overview.entries.map((entry) => entry.id)).not.toContain(entryBId);
  });

  it('does not update an entry from another organization', async () => {
    await expect(
      service.update(
        entryBId,
        { name: 'Cross-tenant update' },
        accountContext(organizationAId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      await prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryBId } }),
    ).toMatchObject({ name: 'Tenant B holiday' });
  });

  it('does not delete an entry from another organization', async () => {
    await expect(
      service.remove(entryBId, accountContext(organizationAId)),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      prisma.calendarEntry.findUniqueOrThrow({ where: { id: entryBId } }),
    ).resolves.toMatchObject({ id: entryBId });
  });

  it('rejects a SaaS request without organization context', async () => {
    await expect(
      service.findMonthEntries('2026-08', accountContext(null)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forces creation into the authenticated organization', async () => {
    const entry = await service.create(
      {
        name: 'Authenticated tenant holiday',
        date: '2026-08-05T00:00:00.000Z',
        type: 'PUBLIC_HOLIDAY',
      },
      accountContext(organizationAId),
    );
    const persisted = await prisma.calendarEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });

    expect(persisted).toEqual(
      expect.objectContaining({
        organizationId: organizationAId,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      }),
    );
  });

  it('rejects a second holiday of another type on the same tenant date', async () => {
    await service.create(
      {
        name: 'First holiday type',
        date: '2026-08-11T00:00:00.000Z',
        type: 'PUBLIC_HOLIDAY',
      },
      accountContext(organizationAId),
    );

    await expect(
      service.create(
        {
          name: 'Second holiday type',
          date: '2026-08-11T00:00:00.000Z',
          type: 'COMPANY_HOLIDAY',
        },
        accountContext(organizationAId),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows only one concurrent holiday creation per tenant date', async () => {
    const results = await Promise.allSettled([
      service.create(
        {
          name: 'Concurrent public holiday',
          date: '2026-08-12T00:00:00.000Z',
          type: 'PUBLIC_HOLIDAY',
        },
        accountContext(organizationAId),
      ),
      service.create(
        {
          name: 'Concurrent company holiday',
          date: '2026-08-12T00:00:00.000Z',
          type: 'COMPANY_HOLIDAY',
        },
        accountContext(organizationAId),
      ),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('does not expose or mutate employee events through holiday operations', async () => {
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: 'CALENDAR-EVENT-A',
        firstName: 'Calendar',
        lastName: 'Employee',
        email: 'calendar-event-a@example.test',
        role: 'Employee',
        passwordHash: 'not-used-in-this-service-test',
        organizationId: organizationAId,
      },
    });
    const leave = await prisma.calendarEntry.create({
      data: {
        name: 'Private employee leave',
        date: new Date('2026-08-13T00:00:00.000Z'),
        type: 'LEAVE',
        employeeId: employee.id,
        organizationId: organizationAId,
      },
    });

    const holidays = await service.findMonthEntries(
      '2026-08',
      accountContext(organizationAId),
    );
    expect(holidays.map(({ id }) => id)).not.toContain(leave.id);
    await expect(
      service.update(
        leave.id,
        { name: 'Forged holiday update' },
        accountContext(organizationAId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove(leave.id, accountContext(organizationAId)),
    ).rejects.toBeInstanceOf(NotFoundException);

    await prisma.calendarEntry.delete({ where: { id: leave.id } });
    await prisma.employee.delete({ where: { id: employee.id } });
  });

  it('rejects a cross-tenant Employee reference', async () => {
    await expect(
      service.create(
        {
          name: 'Injected employee holiday',
          date: '2026-08-06T00:00:00.000Z',
          type: 'PUBLIC_HOLIDAY',
          employeeId: 'tenant-b-employee',
        } as never,
        accountContext(organizationAId),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a Schedule reference because Calendar has no Schedule relation', async () => {
    await expect(
      service.create(
        {
          name: 'Injected schedule holiday',
          date: '2026-08-07T00:00:00.000Z',
          type: 'PUBLIC_HOLIDAY',
          scheduleId: 'tenant-b-schedule',
        } as never,
        accountContext(organizationAId),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow a client organizationId to override authentication', async () => {
    await expect(
      service.create(
        {
          name: 'Spoofed tenant holiday',
          date: '2026-08-08T00:00:00.000Z',
          type: 'PUBLIC_HOLIDAY',
          organizationId: organizationBId,
        } as never,
        accountContext(organizationAId),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the Legacy Calendar scoped to the Legacy namespace', async () => {
    const legacyEntry = await service.create(
      {
        name: 'Legacy holiday',
        date: '2026-08-10T00:00:00.000Z',
        type: 'PUBLIC_HOLIDAY',
      },
      legacyContext,
    );
    const entries = await service.findMonthEntries('2026-08', legacyContext);
    const persisted = await prisma.calendarEntry.findUniqueOrThrow({
      where: { id: legacyEntry.id },
    });

    expect(persisted.organizationId).toBeNull();
    expect(entries.map((entry) => entry.id)).toContain(legacyEntry.id);
    expect(entries.map((entry) => entry.id)).not.toContain(entryAId);
    expect(entries.map((entry) => entry.id)).not.toContain(entryBId);

    await expect(
      service.update(
        entryAId,
        { name: 'Legacy cross-namespace update' },
        legacyContext,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
