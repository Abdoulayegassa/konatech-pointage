import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Multi-site calendar contract (e2e)', () => {
  let prisma: PrismaClient;
  let calendar: CalendarService;
  let organizationId: string;
  let siteAId: string;
  let siteBId: string;
  const suffix = `${Date.now()}`;
  const auth = (orgId: string): AuthenticationContext => ({
    generation: 'saas', purpose: 'account', userId: 'calendar-admin',
    membershipId: 'calendar-membership', organizationId: orgId,
    membershipRole: MembershipRole.ADMIN, employeeId: null, attendanceSiteId: null,
  });

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    calendar = new CalendarService(prisma as never);
    const organization = await prisma.organization.create({
      data: { name: `Calendar Scope ${suffix}`, slug: `calendar-scope-${suffix}`, timezone: 'Etc/UTC' },
    });
    organizationId = organization.id;
    const [siteA, siteB] = await Promise.all([
      prisma.attendanceSite.create({ data: { organizationId, name: 'Calendar Site A', latitude: 1, longitude: 1, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId, name: 'Calendar Site B', latitude: 2, longitude: 2, allowedRadiusMeters: 100 } }),
    ]);
    siteAId = siteA.id;
    siteBId = siteB.id;
  });

  afterAll(async () => {
    if (prisma && organizationId) {
      await prisma.calendarEntry.deleteMany({ where: { organizationId } });
      await prisma.employeeSiteAssignment.deleteMany({ where: { organizationId } });
      await prisma.employee.deleteMany({ where: { organizationId } });
      await prisma.attendanceSite.deleteMany({ where: { organizationId } });
      await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: organizationId } });
      await prisma.organizationSubscription.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma?.$disconnect();
  });

  it('supports global and per-site entries on the same date, enforces scoped duplicates, and isolates site results', async () => {
    const global = await calendar.create({ name: 'Global holiday', date: '2026-09-22', type: 'PUBLIC_HOLIDAY' }, auth(organizationId));
    const localA = await calendar.createForSite(siteAId, { name: 'Site A maintenance', date: '2026-09-22', type: 'COMPANY_HOLIDAY' }, auth(organizationId));
    const localB = await calendar.createForSite(siteBId, { name: 'Site B closure', date: '2026-09-22', type: 'COMPANY_HOLIDAY' }, auth(organizationId));
    await calendar.createForSite(siteAId, { name: 'A only closure', date: '2026-09-24', type: 'COMPANY_HOLIDAY' }, auth(organizationId));

    await expect(calendar.create({ name: 'Duplicate global', date: '2026-09-22', type: 'COMPANY_HOLIDAY' }, auth(organizationId))).rejects.toBeInstanceOf(ConflictException);
    await expect(calendar.createForSite(siteAId, { name: 'Duplicate A', date: '2026-09-22', type: 'PUBLIC_HOLIDAY' }, auth(organizationId))).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.calendarEntry.create({ data: {
      organizationId, siteId: siteAId, name: 'Index duplicate A', date: new Date('2026-09-22T00:00:00Z'),
      type: 'PUBLIC_HOLIDAY', v1ScopeStatus: 'OPERATIONAL',
    } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.calendarEntry.create({ data: {
      organizationId, siteId: siteBId, name: 'Index distinct B', date: new Date('2026-09-22T00:00:00Z'),
      type: 'PUBLIC_HOLIDAY', v1ScopeStatus: 'OPERATIONAL',
    } })).rejects.toMatchObject({ code: 'P2002' });

    const siteA = await calendar.getSiteMonthOverview(siteAId, '2026-09', auth(organizationId));
    const siteB = await calendar.getSiteMonthOverview(siteBId, '2026-09', auth(organizationId));
    expect(siteA.entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([global.id, localA.id]));
    expect(siteA.entries.find((entry) => entry.id === global.id)).toMatchObject({ scope: 'ORGANIZATION', inherited: true });
    expect(siteA.entries.find((entry) => entry.id === localA.id)).toMatchObject({ scope: 'SITE', inherited: false });
    expect(siteA.entries.map((entry) => entry.id)).not.toContain(localB.id);
    expect(siteB.entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([global.id, localB.id]));
    expect(siteB.entries.map((entry) => entry.id)).not.toContain(localA.id);
    expect((await calendar.getNonWorkingDateKeys(new Date('2026-09-22'), new Date('2026-09-23'), auth(organizationId), siteAId)).has(Date.UTC(2026, 8, 22))).toBe(true);
    expect((await calendar.getNonWorkingDateKeys(new Date('2026-09-22'), new Date('2026-09-23'), auth(organizationId), siteBId)).has(Date.UTC(2026, 8, 22))).toBe(true);
    expect((await calendar.getNonWorkingDateKeys(new Date('2026-09-24'), new Date('2026-09-25'), auth(organizationId), siteAId)).has(Date.UTC(2026, 8, 24))).toBe(true);
    expect((await calendar.getNonWorkingDateKeys(new Date('2026-09-24'), new Date('2026-09-25'), auth(organizationId), siteBId)).has(Date.UTC(2026, 8, 24))).toBe(false);
    expect((await calendar.getNonWorkingDateKeysForOrganization(new Date('2026-09-24'), new Date('2026-09-25'), organizationId)).has(Date.UTC(2026, 8, 24))).toBe(false);
  });

  it('uses effective site assignment dates when resolving local calendar events', async () => {
    const employee = await prisma.employee.create({
      data: {
        organizationId, employeeIdentifier: `CAL-${suffix}`, firstName: 'Calendar', lastName: 'Transfer',
        email: `calendar-${suffix}@example.test`, role: 'Employee', passwordHash: 'test-hash',
        v1ScopeStatus: 'OPERATIONAL',
      },
    });
    await prisma.employeeSiteAssignment.createMany({
      data: [
        { organizationId, employeeId: employee.id, siteId: siteAId, effectiveFrom: new Date('2026-09-01T00:00:00Z'), effectiveTo: new Date('2026-09-16T00:00:00Z') },
        { organizationId, employeeId: employee.id, siteId: siteBId, effectiveFrom: new Date('2026-09-16T00:00:00Z') },
      ],
    });
    await calendar.createForSite(siteAId, { name: 'A local day', date: '2026-09-10', type: 'COMPANY_HOLIDAY' }, auth(organizationId));
    await calendar.createForSite(siteBId, { name: 'B local day', date: '2026-09-21', type: 'COMPANY_HOLIDAY' }, auth(organizationId));
    const dates = await calendar.getNonWorkingDateKeysForEmployeeInOrganization(
      new Date('2026-09-10T00:00:00Z'), new Date('2026-09-22T00:00:00Z'), employee.id, organizationId,
    );
    expect(dates.has(Date.UTC(2026, 8, 10))).toBe(true);
    expect(dates.has(Date.UTC(2026, 8, 21))).toBe(true);
    expect(dates.has(Date.UTC(2026, 8, 17))).toBe(false);
  });

  it('rejects foreign site and cross-site entry mutations and blocks inactive-site mutations', async () => {
    const foreign = await prisma.organization.create({
      data: { name: `Calendar Foreign ${suffix}`, slug: `calendar-foreign-${suffix}`, timezone: 'Etc/UTC' },
    });
    const foreignSite = await prisma.attendanceSite.create({ data: { organizationId: foreign.id, name: 'Foreign calendar site', latitude: 3, longitude: 3, allowedRadiusMeters: 100 } });
    const siteAEntry = await calendar.createForSite(siteAId, { name: 'A only', date: '2026-10-12', type: 'COMPANY_HOLIDAY' }, auth(organizationId));
    await expect(calendar.getSiteMonthOverview(foreignSite.id, '2026-10', auth(organizationId))).rejects.toBeInstanceOf(NotFoundException);
    await expect(calendar.updateForSite(siteBId, siteAEntry.id, { name: 'Attempted cross-site edit' }, auth(organizationId))).rejects.toBeInstanceOf(NotFoundException);
    await prisma.attendanceSite.update({ where: { id: siteAId }, data: { isActive: false } });
    await expect(calendar.createForSite(siteAId, { name: 'Inactive attempt', date: '2026-10-13', type: 'COMPANY_HOLIDAY' }, auth(organizationId))).rejects.toBeInstanceOf(NotFoundException);
    await prisma.attendanceSite.update({ where: { id: siteAId }, data: { isActive: true } });
    await prisma.attendanceSite.delete({ where: { id: foreignSite.id } });
    await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: foreign.id } });
    await prisma.organizationSubscription.delete({ where: { organizationId: foreign.id } });
    await prisma.organization.delete({ where: { id: foreign.id } });
  });
});
