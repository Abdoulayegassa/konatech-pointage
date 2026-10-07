import { PrismaClient, V1OperationalScopeStatus } from '@prisma/client';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { prepareTestDatabase } from './test-database';

const ORG_A = 'f2a00000-0000-4000-8000-000000000001';
const ORG_B = 'f2a00000-0000-4000-8000-000000000002';
const auth = (organizationId: string) => ({
  generation: 'saas' as const, purpose: 'account' as const, organizationId,
  userId: 'admin', membershipId: 'membership', membershipRole: 'ADMIN' as const,
  employeeId: null, attendanceSiteId: null,
});

describe('Employee site lifecycle (Phase 2E.3)', () => {
  let prisma: PrismaClient;
  let employees: EmployeesService;
  let siteA: string;
  let siteB: string;
  let siteOtherTenant: string;
  let scheduleA: string;
  let scheduleB: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient(); await prisma.$connect();
    employees = new EmployeesService(prisma as never, { assertMayIncrease: jest.fn() } as never);
    await prisma.organization.createMany({ data: [
      { id: ORG_A, name: 'Lifecycle A', slug: 'lifecycle-a', timezone: 'UTC' },
      { id: ORG_B, name: 'Lifecycle B', slug: 'lifecycle-b', timezone: 'UTC' },
    ] });
    [siteA, siteB, siteOtherTenant] = (await Promise.all([
      prisma.attendanceSite.create({ data: { organizationId: ORG_A, name: 'A', latitude: 1, longitude: 1, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: ORG_A, name: 'B', latitude: 2, longitude: 2, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: ORG_B, name: 'Other', latitude: 3, longitude: 3, allowedRadiusMeters: 100 } }),
    ])).map((site) => site.id);
    [scheduleA, scheduleB] = (await Promise.all([
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteA, name: 'A schedule', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: ORG_A, siteId: siteB, name: 'B schedule', startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
    ])).map((schedule) => schedule.id);
  }, 120_000);
  afterAll(async () => prisma?.$disconnect());

  it('creates a tenant employee in Site A with an open historical assignment', async () => {
    const created = await employees.create({ firstName: 'Site', lastName: 'A', email: 'site-a@example.test', role: 'Employee', password: 'Password123!', pinCode: '4567', siteId: siteA }, auth(ORG_A));
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: created.id }, include: { siteAssignments: true } });
    expect(record.primarySiteId).toBe(siteA);
    expect(record.siteAssignments).toHaveLength(1);
    expect(record.siteAssignments[0]).toMatchObject({ organizationId: ORG_A, siteId: siteA, effectiveTo: null });
  });

  it('rejects a cross-tenant site and preserves no employee record', async () => {
    await expect(employees.create({ firstName: 'Cross', lastName: 'Tenant', email: 'cross@example.test', role: 'Employee', password: 'Password123!', pinCode: '4568', siteId: siteOtherTenant }, auth(ORG_A))).rejects.toThrow('Attendance site');
  });

  it('transfers today only without attendance, preserves history, and rejects same-day attendance', async () => {
    const employee = await employees.create({ firstName: 'Transfer', lastName: 'Today', email: 'transfer@example.test', role: 'Employee', password: 'Password123!', pinCode: '4569', siteId: siteA }, auth(ORG_A));
    const today = new Date().toISOString().slice(0, 10);
    await employees.transferSite(employee.id, { siteId: siteB, scheduleId: scheduleB, effectiveFrom: today }, auth(ORG_A));
    const transferred = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { siteAssignments: { orderBy: { effectiveFrom: 'asc' } } } });
    expect(transferred.primarySiteId).toBe(siteB);
    expect(transferred.siteAssignments).toHaveLength(1);
    expect(transferred.siteAssignments[0]).toMatchObject({ siteId: siteB, effectiveTo: null });
    await prisma.attendance.create({ data: { employeeId: employee.id, organizationId: ORG_A, attendanceSiteId: siteB, date: new Date(`${today}T00:00:00.000Z`) } });
    await expect(employees.transferSite(employee.id, { siteId: siteA, scheduleId: scheduleA, effectiveFrom: today }, auth(ORG_A))).rejects.toThrow('attendance today');
  });

  it('records a future transfer without changing the current primary site', async () => {
    const employee = await employees.create({ firstName: 'Future', lastName: 'Transfer', email: 'future@example.test', role: 'Employee', password: 'Password123!', pinCode: '4570', siteId: siteA }, auth(ORG_A));
    const future = new Date(); future.setUTCDate(future.getUTCDate() + 1);
    await employees.transferSite(employee.id, { siteId: siteB, scheduleId: scheduleB, effectiveFrom: future.toISOString().slice(0, 10) }, auth(ORG_A));
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { siteAssignments: { orderBy: { effectiveFrom: 'asc' } } } });
    expect(record.primarySiteId).toBe(siteA);
    expect(record.siteAssignments).toHaveLength(2);
    expect(record.siteAssignments[0].effectiveTo).toEqual(new Date(`${future.toISOString().slice(0, 10)}T00:00:00.000Z`));
    expect(record.siteAssignments[1].siteId).toBe(siteB);
  });
});
