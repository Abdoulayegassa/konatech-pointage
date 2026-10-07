import {
  CalendarEntryType,
  PrismaClient,
  SanctionRuleType,
  V1OperationalScopeStatus,
  V1ScopeReasonCode,
} from '@prisma/client';
import {
  attendanceOperationalWhere,
  calendarOperationalWhere,
  employeeOperationalWhere,
  sanctionRuleOperationalWhere,
  scheduleOperationalWhere,
} from '../src/common/prisma/operational-scope';
import { prepareTestDatabase } from './test-database';

const ORG_A = 'f2900000-0000-4000-8000-000000000001';
const ORG_B = 'f2900000-0000-4000-8000-000000000002';

describe('Phase 2E.1 operational scope predicates', () => {
  let prisma: PrismaClient;
  let operationalEmployeeId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: ORG_A, name: 'Scope A', slug: 'scope-a', timezone: 'UTC' },
        { id: ORG_B, name: 'Scope B', slug: 'scope-b', timezone: 'UTC' },
      ],
    });
    operationalEmployeeId = (
      await prisma.employee.create({
        data: {
          employeeIdentifier: 'SCOPE-OP', firstName: 'Operational', lastName: 'A',
          email: 'scope-op@example.test', role: 'Employee', passwordHash: 'hash',
          organizationId: ORG_A, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      })
    ).id;
    await prisma.employee.createMany({
      data: [
        { employeeIdentifier: 'SCOPE-REVIEW', firstName: 'Review', lastName: 'A', email: 'scope-review@example.test', role: 'Employee', passwordHash: 'hash', organizationId: ORG_A },
        { employeeIdentifier: 'SCOPE-EXCLUDED', firstName: 'Excluded', lastName: 'A', email: 'scope-excluded@example.test', role: 'Employee', passwordHash: 'hash', organizationId: ORG_A, v1ScopeStatus: V1OperationalScopeStatus.LEGACY_EXCLUDED, v1ScopeReasonCode: V1ScopeReasonCode.LEGACY_EXCLUDED },
        { employeeIdentifier: 'SCOPE-OTHER', firstName: 'Other', lastName: 'B', email: 'scope-other@example.test', role: 'Employee', passwordHash: 'hash', organizationId: ORG_B, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      ],
    });
  }, 120_000);

  afterAll(async () => prisma.$disconnect());

  it('returns only OPERATIONAL employees for the authenticated organization', async () => {
    const records = await prisma.employee.findMany({ where: employeeOperationalWhere(ORG_A) });
    expect(records.map(({ employeeIdentifier }) => employeeIdentifier)).toEqual(['SCOPE-OP']);
    expect(await prisma.employee.findMany({ where: employeeOperationalWhere(ORG_B) })).toHaveLength(1);
  });

  it('excludes review/excluded operational records across attendance, schedules, calendar and sanctions', async () => {
    await prisma.schedule.createMany({ data: [
      { name: 'Operational', startTime: '08:00', endTime: '17:00', workDays: [], organizationId: ORG_A, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      { name: 'Review', startTime: '08:00', endTime: '17:00', workDays: [], organizationId: ORG_A },
    ] });
    await prisma.attendance.createMany({ data: [
      { employeeId: operationalEmployeeId, organizationId: ORG_A, date: new Date('2099-01-01'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      { employeeId: operationalEmployeeId, organizationId: ORG_A, date: new Date('2099-01-02') },
    ] });
    await prisma.calendarEntry.createMany({ data: [
      { name: 'Operational holiday', date: new Date('2099-01-03'), type: CalendarEntryType.PUBLIC_HOLIDAY, organizationId: ORG_A, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      { name: 'Review holiday', date: new Date('2099-01-04'), type: CalendarEntryType.PUBLIC_HOLIDAY, organizationId: ORG_A },
      { name: 'Excluded holiday', date: new Date('2099-01-05'), type: CalendarEntryType.PUBLIC_HOLIDAY, organizationId: ORG_A, v1ScopeStatus: V1OperationalScopeStatus.LEGACY_EXCLUDED, v1ScopeReasonCode: V1ScopeReasonCode.LEGACY_EXCLUDED },
    ] });
    await prisma.sanctionRule.createMany({ data: [
      { name: 'Operational rule', code: 'SCOPE-OP', type: SanctionRuleType.MINOR_LATENESS, appliedReason: 'test', organizationId: ORG_A, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      { name: 'Review rule', code: 'SCOPE-REVIEW', type: SanctionRuleType.MINOR_LATENESS, appliedReason: 'test', organizationId: ORG_A },
    ] });
    await expect(prisma.schedule.findMany({ where: scheduleOperationalWhere(ORG_A) })).resolves.toHaveLength(1);
    await expect(prisma.attendance.findMany({ where: attendanceOperationalWhere(ORG_A) })).resolves.toHaveLength(1);
    await expect(prisma.calendarEntry.findMany({ where: calendarOperationalWhere(ORG_A) })).resolves.toHaveLength(1);
    await expect(prisma.sanctionRule.findMany({ where: sanctionRuleOperationalWhere(ORG_A) })).resolves.toHaveLength(1);
  });
});
