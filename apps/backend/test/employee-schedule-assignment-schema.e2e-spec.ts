import {
  PrismaClient,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { prepareTestDatabase } from './test-database';

const ORG_A = 'f2600000-0000-4000-8000-000000000001';
const ORG_B = 'f2600000-0000-4000-8000-000000000002';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('EmployeeScheduleAssignment schema foundation', () => {
  let prisma: PrismaClient;
  let employeeA: string;
  let employeeB: string;
  let siteA: string;
  let siteA2: string;
  let siteB: string;
  let scheduleA: string;
  let scheduleA2: string;
  let scheduleB: string;
  let siteAssignmentA: string;
  let siteAssignmentA2: string;
  let siteAssignmentB: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    await prisma.organization.createMany({ data: [
      { id: ORG_A, name: 'Schedule A', slug: 'schedule-a', timezone: 'UTC' },
      { id: ORG_B, name: 'Schedule B', slug: 'schedule-b', timezone: 'UTC' },
    ] });
    [siteA, siteA2, siteB] = (await Promise.all([
      prisma.attendanceSite.create({ data: { organizationId: ORG_A, name: 'A', latitude: 1, longitude: 1, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: ORG_A, name: 'A2', latitude: 2, longitude: 2, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: ORG_B, name: 'B', latitude: 3, longitude: 3, allowedRadiusMeters: 100 } }),
    ])).map((site) => site.id);
    [employeeA, employeeB] = (await Promise.all([
      prisma.employee.create({ data: { organizationId: ORG_A, employeeIdentifier: 'ESA-A', firstName: 'A', lastName: 'A', email: 'esa-a@example.test', role: 'Employee', passwordHash: 'hash' } }),
      prisma.employee.create({ data: { organizationId: ORG_B, employeeIdentifier: 'ESA-B', firstName: 'B', lastName: 'B', email: 'esa-b@example.test', role: 'Employee', passwordHash: 'hash' } }),
    ])).map((employee) => employee.id);
    [scheduleA, scheduleA2, scheduleB] = (await Promise.all([
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteA, name: 'A 08', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteA2, name: 'A2 08', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: ORG_B, siteId: siteB, name: 'B 08', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
    ])).map((schedule) => schedule.id);
    [siteAssignmentA, siteAssignmentA2, siteAssignmentB] = (await Promise.all([
      prisma.employeeSiteAssignment.create({ data: { organizationId: ORG_A, employeeId: employeeA, siteId: siteA, effectiveFrom: day('2100-01-01'), effectiveTo: day('2100-02-01') } }),
      prisma.employeeSiteAssignment.create({ data: { organizationId: ORG_A, employeeId: employeeA, siteId: siteA2, effectiveFrom: day('2100-02-01') } }),
      prisma.employeeSiteAssignment.create({ data: { organizationId: ORG_B, employeeId: employeeB, siteId: siteB, effectiveFrom: day('2100-01-01') } }),
    ])).map((assignment) => assignment.id);
  }, 120_000);

  afterAll(async () => prisma.$disconnect());

  const valid = (overrides = {}) => ({
    organizationId: ORG_A, employeeId: employeeA, siteId: siteA,
    scheduleId: scheduleA, employeeSiteAssignmentId: siteAssignmentA,
    effectiveFrom: day('2100-01-01'), effectiveTo: day('2100-02-01'),
    v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL, ...overrides,
  });

  it('accepts tenant/site-consistent historical and future assignments', async () => {
    await expect(prisma.employeeScheduleAssignment.create({ data: valid() })).resolves.toBeDefined();
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ siteId: siteA2, scheduleId: scheduleA2, employeeSiteAssignmentId: siteAssignmentA2, effectiveFrom: day('2100-02-01'), effectiveTo: null }) })).resolves.toBeDefined();
  });

  it('rejects cross-tenant employee, site, schedule and lineage references', async () => {
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ employeeId: employeeB }) })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ siteId: siteB, effectiveFrom: day('2099-01-01'), effectiveTo: day('2099-02-01') }) })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ scheduleId: scheduleB, effectiveFrom: day('2099-01-01'), effectiveTo: day('2099-02-01') }) })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ employeeSiteAssignmentId: siteAssignmentB, effectiveFrom: day('2099-01-01'), effectiveTo: day('2099-02-01') }) })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a same-tenant schedule/site mismatch and overlapping windows', async () => {
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ scheduleId: scheduleA2, effectiveFrom: day('2099-01-01'), effectiveTo: day('2099-02-01') }) })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.employeeScheduleAssignment.create({ data: valid({ effectiveFrom: day('2100-01-15'), effectiveTo: day('2100-01-20') }) })).rejects.toBeTruthy();
  });

  it('keeps the legacy Employee.scheduleId compatibility reference intact', async () => {
    await prisma.employee.update({ where: { id: employeeA }, data: { scheduleId: scheduleA } });
    await expect(prisma.employee.findUniqueOrThrow({ where: { id: employeeA } })).resolves.toMatchObject({ scheduleId: scheduleA });
  });
});
