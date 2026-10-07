import { PrismaClient, V1OperationalScopeStatus } from '@prisma/client';
import { EffectiveScheduleResolver } from '../src/modules/schedules/effective-schedule.resolver';
import { prepareTestDatabase } from './test-database';

describe('EffectiveScheduleResolver (e2e)', () => {
  let prisma: PrismaClient;
  let resolver: EffectiveScheduleResolver;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();
    resolver = new EffectiveScheduleResolver(prisma as never);
  }, 120_000);

  afterAll(async () => prisma?.$disconnect());

  it('selects the site and schedule effective on each business date', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Resolver', slug: 'effective-schedule-resolver', timezone: 'UTC' },
    });
    const [siteA, siteB] = await Promise.all([
      prisma.attendanceSite.create({ data: { organizationId: organization.id, name: 'A', latitude: 1, longitude: 1, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: organization.id, name: 'B', latitude: 2, longitude: 2, allowedRadiusMeters: 100 } }),
    ]);
    const [scheduleA, scheduleB, scheduleB2] = await Promise.all([
      prisma.schedule.create({ data: { organizationId: organization.id, siteId: siteA.id, name: 'A', startTime: '08:00', endTime: '17:00', workDays: ['MONDAY'], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: organization.id, siteId: siteB.id, name: 'B', startTime: '09:00', endTime: '18:00', workDays: ['TUESDAY'], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: organization.id, siteId: siteB.id, name: 'B2', startTime: '10:00', endTime: '19:00', workDays: ['WEDNESDAY'], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
    ]);
    const employee = await prisma.employee.create({
      data: {
        organizationId: organization.id,
        employeeIdentifier: 'RESOLVER-1', firstName: 'Resolver', lastName: 'Employee',
        email: 'resolver@example.test', role: 'Employee', passwordHash: 'hash',
        primarySiteId: siteA.id, scheduleId: scheduleA.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const [assignmentA, assignmentB] = await Promise.all([
      prisma.employeeSiteAssignment.create({ data: { organizationId: organization.id, employeeId: employee.id, siteId: siteA.id, effectiveFrom: new Date('2026-06-01T00:00:00.000Z'), effectiveTo: new Date('2026-06-15T00:00:00.000Z') } }),
      prisma.employeeSiteAssignment.create({ data: { organizationId: organization.id, employeeId: employee.id, siteId: siteB.id, effectiveFrom: new Date('2026-06-15T00:00:00.000Z') } }),
    ]);
    await prisma.employeeScheduleAssignment.createMany({
      data: [
        { organizationId: organization.id, employeeId: employee.id, siteId: siteA.id, scheduleId: scheduleA.id, employeeSiteAssignmentId: assignmentA.id, effectiveFrom: new Date('2026-06-01T00:00:00.000Z'), effectiveTo: new Date('2026-06-15T00:00:00.000Z'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
        { organizationId: organization.id, employeeId: employee.id, siteId: siteB.id, scheduleId: scheduleB.id, employeeSiteAssignmentId: assignmentB.id, effectiveFrom: new Date('2026-06-15T00:00:00.000Z'), effectiveTo: new Date('2026-06-20T00:00:00.000Z'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
        { organizationId: organization.id, employeeId: employee.id, siteId: siteB.id, scheduleId: scheduleB2.id, employeeSiteAssignmentId: assignmentB.id, effectiveFrom: new Date('2026-06-20T00:00:00.000Z'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      ],
    });

    await expect(resolver.resolve(employee.id, organization.id, new Date('2026-06-14T00:00:00.000Z'))).resolves.toMatchObject({ siteAssignment: { id: assignmentA.id, siteId: siteA.id }, schedule: { id: scheduleA.id } });
    await expect(resolver.resolve(employee.id, organization.id, new Date('2026-06-16T00:00:00.000Z'))).resolves.toMatchObject({ siteAssignment: { id: assignmentB.id, siteId: siteB.id }, schedule: { id: scheduleB.id } });
    await expect(resolver.resolve(employee.id, organization.id, new Date('2026-06-21T00:00:00.000Z'))).resolves.toMatchObject({ siteAssignment: { id: assignmentB.id, siteId: siteB.id }, schedule: { id: scheduleB2.id } });
  });

  it('fails closed for an unresolved employee', async () => {
    const organization = await prisma.organization.create({ data: { name: 'Resolver foreign', slug: 'effective-schedule-resolver-foreign', timezone: 'UTC' } });
    await expect(resolver.resolveOptional('missing', organization.id, new Date())).resolves.toBeNull();
  });
});
