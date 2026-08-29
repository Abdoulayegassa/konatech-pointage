import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
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
      prisma.calendarEntry.create({
        data: {
          name: 'Tenant A holiday',
          date: new Date('2026-08-03T00:00:00.000Z'),
          type: 'PUBLIC_HOLIDAY',
          organizationId: organizationAId,
        },
      }),
      prisma.calendarEntry.create({
        data: {
          name: 'Tenant B holiday',
          date: new Date('2026-08-04T00:00:00.000Z'),
          type: 'COMPANY_HOLIDAY',
          organizationId: organizationBId,
        },
      }),
    ]);
    entryAId = entryA.id;
    entryBId = entryB.id;
  });

  afterAll(async () => {
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

    expect(persisted.organizationId).toBe(organizationAId);
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

  it('preserves legacy global Calendar behavior', async () => {
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
    expect(entries.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([entryAId, entryBId, legacyEntry.id]),
    );
  });
});
