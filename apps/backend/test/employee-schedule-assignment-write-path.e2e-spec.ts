import { PrismaClient, V1OperationalScopeStatus } from '@prisma/client';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { prepareTestDatabase } from './test-database';

const ORG_A = 'f2500000-0000-4000-8000-000000000001';
const ORG_B = 'f2500000-0000-4000-8000-000000000002';
const auth = (organizationId: string) => ({ generation: 'saas' as const, purpose: 'account' as const, organizationId, userId: 'admin', membershipId: 'membership', membershipRole: 'ADMIN' as const, employeeId: null, attendanceSiteId: null });

describe('Employee schedule assignment write paths', () => {
  let prisma: PrismaClient; let employees: EmployeesService;
  let siteA: string; let siteB: string; let siteForeign: string;
  let scheduleA: string; let scheduleA2: string; let scheduleB: string; let scheduleForeign: string;
  beforeAll(async () => {
    await prepareTestDatabase(); prisma = new PrismaClient(); await prisma.$connect();
    employees = new EmployeesService(prisma as never, { assertMayIncrease: jest.fn() } as never);
    await prisma.organization.createMany({ data: [{ id: ORG_A, name: 'Write A', slug: 'write-a', timezone: 'UTC' }, { id: ORG_B, name: 'Write B', slug: 'write-b', timezone: 'UTC' }] });
    [siteA, siteB, siteForeign] = (await Promise.all([
      prisma.attendanceSite.create({ data: { organizationId: ORG_A, name: 'A', latitude: 1, longitude: 1, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: ORG_A, name: 'B', latitude: 2, longitude: 2, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: ORG_B, name: 'Foreign', latitude: 3, longitude: 3, allowedRadiusMeters: 100 } }),
    ])).map((site) => site.id);
    [scheduleA, scheduleA2, scheduleB, scheduleForeign] = (await Promise.all([
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteA, name: 'A1', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteA, name: 'A2', startTime: '09:00', endTime: '18:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteB, name: 'B1', startTime: '07:00', endTime: '16:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: ORG_B, siteId: siteForeign, name: 'F1', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
    ])).map((schedule) => schedule.id);
  }, 120_000);
  afterAll(async () => prisma.$disconnect());

  async function createEmployee(name: string, scheduleId = scheduleA) {
    return employees.create({ firstName: name, lastName: 'Employee', email: `${name}@example.test`, role: 'Employee', password: 'Password123!', pinCode: String(5000 + Math.floor(Math.random() * 999)), siteId: siteA, scheduleId }, auth(ORG_A));
  }

  it('creates an operational employee with linked initial site and schedule history', async () => {
    const employee = await createEmployee('initial');
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { siteAssignments: true, scheduleAssignments: true } });
    expect(record).toMatchObject({ primarySiteId: siteA, scheduleId: scheduleA, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL });
    expect(record.siteAssignments).toHaveLength(1);
    expect(record.scheduleAssignments).toMatchObject([{ siteId: siteA, scheduleId: scheduleA, employeeSiteAssignmentId: record.siteAssignments[0].id }]);
  });

  it('writes immediate and future assignment intervals without prematurely changing the projection', async () => {
    const employee = await createEmployee('change');
    await employees.assignSchedule(employee.id, { scheduleId: scheduleA2 }, auth(ORG_A));
    const future = new Date(); future.setUTCDate(future.getUTCDate() + 1);
    await employees.assignSchedule(employee.id, { scheduleId: scheduleA, effectiveFrom: future.toISOString() }, auth(ORG_A));
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { scheduleAssignments: { orderBy: { effectiveFrom: 'asc' } } } });
    expect(record.scheduleId).toBe(scheduleA2);
    expect(record.scheduleAssignments).toHaveLength(2);
    expect(record.scheduleAssignments[0].effectiveTo).toEqual(new Date(`${future.toISOString().slice(0, 10)}T00:00:00.000Z`));
    expect(record.scheduleAssignments[1]).toMatchObject({ scheduleId: scheduleA, effectiveTo: null });
  });

  it('rejects a backdated schedule change without rewriting assignment history', async () => {
    const employee = await createEmployee('backdated');
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 1);
    await expect(
      employees.assignSchedule(
        employee.id,
        { scheduleId: scheduleA2, effectiveFrom: past.toISOString() },
        auth(ORG_A),
      ),
    ).rejects.toThrow('cannot be backdated');
    const record = await prisma.employee.findUniqueOrThrow({
      where: { id: employee.id },
      include: { scheduleAssignments: true },
    });
    expect(record.scheduleId).toBe(scheduleA);
    expect(record.scheduleAssignments).toMatchObject([
      { scheduleId: scheduleA, effectiveTo: null },
    ]);
  });

  it('rejects cross-site and cross-tenant schedules without creating assignments', async () => {
    const employee = await createEmployee('reject');
    await expect(employees.assignSchedule(employee.id, { scheduleId: scheduleB }, auth(ORG_A))).rejects.toThrow('effective site');
    await expect(employees.assignSchedule(employee.id, { scheduleId: scheduleForeign }, auth(ORG_A))).rejects.toThrow('effective site');
    expect(await prisma.employeeScheduleAssignment.count({ where: { employeeId: employee.id } })).toBe(1);
  });

  it('routes generic update scheduleId through the same historical assignment write path', async () => {
    const employee = await createEmployee('generic');
    await employees.update(employee.id, { scheduleId: scheduleA2 }, auth(ORG_A));
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { scheduleAssignments: true } });
    expect(record.scheduleId).toBe(scheduleA2);
    expect(record.scheduleAssignments).toHaveLength(1);
    expect(record.scheduleAssignments[0].scheduleId).toBe(scheduleA2);
  });

  it('requires a target schedule before creating a transfer', async () => {
    const employee = await createEmployee('transfer'); const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await expect(employees.transferSite(employee.id, { siteId: siteB, effectiveFrom: tomorrow.toISOString() }, auth(ORG_A))).rejects.toThrow('target-site schedule');
    await expect(employees.transferSite(employee.id, { siteId: siteB, scheduleId: scheduleB, effectiveFrom: tomorrow.toISOString() }, auth(ORG_A))).resolves.toBeDefined();
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { siteAssignments: true, scheduleAssignments: true } });
    expect(record.primarySiteId).toBe(siteA);
    expect(record.siteAssignments).toHaveLength(2); expect(record.scheduleAssignments).toHaveLength(2);
  });
});
