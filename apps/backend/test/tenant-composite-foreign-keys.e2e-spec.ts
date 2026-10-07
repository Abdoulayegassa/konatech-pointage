import {
  CalendarEntryType,
  MembershipRole,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { prepareTestDatabase } from './test-database';

const ORG_A = 'f2700000-0000-4000-8000-000000000001';
const ORG_B = 'f2700000-0000-4000-8000-000000000002';

describe('Tenant composite foreign keys', () => {
  let prisma: PrismaClient;
  let scheduleA: string;
  let scheduleB: string;
  let legacySchedule: string;
  let employeeA: string;
  let employeeB: string;
  let legacyEmployee: string;
  let userA: string;
  let userB: string;

  const employeeData = (
    suffix: string,
    organizationId: string | null,
    overrides: Partial<Prisma.EmployeeUncheckedCreateInput> = {},
  ): Prisma.EmployeeUncheckedCreateInput => ({
    employeeIdentifier: `FK-${suffix}`,
    firstName: 'Composite',
    lastName: suffix,
    email: `composite-${suffix.toLowerCase()}@example.test`,
    role: 'Employee',
    passwordHash: 'test-hash',
    organizationId,
    ...overrides,
  });

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();

    await prisma.organization.createMany({
      data: [
        {
          id: ORG_A,
          name: 'Composite A',
          slug: 'composite-a',
          timezone: 'UTC',
        },
        {
          id: ORG_B,
          name: 'Composite B',
          slug: 'composite-b',
          timezone: 'UTC',
        },
      ],
    });
    [scheduleA, scheduleB, legacySchedule] = (
      await Promise.all([
        prisma.schedule.create({
          data: {
            name: 'Composite A',
            startTime: '08:00',
            endTime: '17:00',
            workDays: [],
            organizationId: ORG_A,
          },
        }),
        prisma.schedule.create({
          data: {
            name: 'Composite B',
            startTime: '08:00',
            endTime: '17:00',
            workDays: [],
            organizationId: ORG_B,
          },
        }),
        prisma.schedule.create({
          data: {
            name: 'Composite Legacy',
            startTime: '08:00',
            endTime: '17:00',
            workDays: [],
            organizationId: null,
          },
        }),
      ])
    ).map((schedule) => schedule.id);

    [userA, userB] = (
      await Promise.all([
        prisma.user.create({
          data: {
            normalizedEmail: 'composite-a@example.test',
            passwordHash: 'test-hash',
          },
        }),
        prisma.user.create({
          data: {
            normalizedEmail: 'composite-b@example.test',
            passwordHash: 'test-hash',
          },
        }),
      ])
    ).map((user) => user.id);
    await prisma.membership.createMany({
      data: [
        { organizationId: ORG_A, userId: userA, role: MembershipRole.ADMIN },
        { organizationId: ORG_B, userId: userB, role: MembershipRole.ADMIN },
      ],
    });

    employeeA = (
      await prisma.employee.create({
        data: employeeData('A', ORG_A, {
          scheduleId: scheduleA,
          userId: userA,
        }),
      })
    ).id;
    employeeB = (
      await prisma.employee.create({
        data: employeeData('B', ORG_B, {
          scheduleId: scheduleB,
          userId: userB,
        }),
      })
    ).id;
    legacyEmployee = (
      await prisma.employee.create({
        data: employeeData('LEGACY', null, { scheduleId: legacySchedule }),
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces Employee to Schedule tenant equality while preserving MATCH SIMPLE', async () => {
    await expect(
      prisma.employee.create({
        data: employeeData('SAME-SCHEDULE', ORG_A, { scheduleId: scheduleA }),
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.employee.create({
        data: employeeData('FOREIGN-SCHEDULE', ORG_A, {
          scheduleId: scheduleB,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.employee.create({
        data: employeeData('LEGACY-SCHEDULE', ORG_A, {
          scheduleId: legacySchedule,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.employee.create({
        data: employeeData('NULL-SCHEDULE', ORG_A, { scheduleId: null }),
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.employee.create({
        data: employeeData('LEGACY-SAAS-SCHEDULE', null, {
          scheduleId: scheduleB,
        }),
      }),
    ).resolves.toBeDefined();
  });

  it('sets only scheduleId to null when a referenced Schedule is deleted', async () => {
    const schedule = await prisma.schedule.create({
      data: {
        name: 'Composite Delete',
        startTime: '08:00',
        endTime: '17:00',
        workDays: [],
        organizationId: ORG_A,
      },
    });
    const employee = await prisma.employee.create({
      data: employeeData('SCHEDULE-DELETE', ORG_A, { scheduleId: schedule.id }),
    });
    await prisma.schedule.delete({ where: { id: schedule.id } });
    await expect(
      prisma.employee.findUnique({ where: { id: employee.id } }),
    ).resolves.toMatchObject({
      organizationId: ORG_A,
      scheduleId: null,
    });
  });

  it('enforces Attendance to Employee tenant equality and documents Legacy MATCH SIMPLE', async () => {
    await expect(
      prisma.attendance.create({
        data: {
          employeeId: employeeA,
          organizationId: ORG_A,
          date: new Date('2098-01-01'),
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.attendance.create({
        data: {
          employeeId: employeeB,
          organizationId: ORG_A,
          date: new Date('2098-01-02'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.attendance.create({
        data: {
          employeeId: legacyEmployee,
          organizationId: ORG_A,
          date: new Date('2098-01-03'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.attendance.create({
        data: {
          employeeId: legacyEmployee,
          organizationId: null,
          date: new Date('2098-01-04'),
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.attendance.create({
        data: {
          employeeId: employeeA,
          organizationId: null,
          date: new Date('2098-01-05'),
        },
      }),
    ).resolves.toBeDefined();
  });

  it('cascades Attendance deletion when its Employee is deleted', async () => {
    const employee = await prisma.employee.create({
      data: employeeData('ATTENDANCE-DELETE', ORG_A),
    });
    const attendance = await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        organizationId: ORG_A,
        date: new Date('2098-02-01'),
      },
    });
    await prisma.employee.delete({ where: { id: employee.id } });
    await expect(
      prisma.attendance.findUnique({ where: { id: attendance.id } }),
    ).resolves.toBeNull();
  });

  it('enforces CalendarEntry to Employee tenant equality and documents Legacy MATCH SIMPLE', async () => {
    const entry = (
      name: string,
      employeeId: string,
      organizationId: string | null,
      day: number,
    ) =>
      prisma.calendarEntry.create({
        data: {
          name,
          date: new Date(`2098-03-${String(day).padStart(2, '0')}`),
          type: CalendarEntryType.LEAVE,
          employeeId,
          organizationId,
        },
      });
    await expect(
      entry('Same tenant', employeeA, ORG_A, 1),
    ).resolves.toBeDefined();
    await expect(
      entry('Foreign tenant', employeeB, ORG_A, 2),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      entry('SaaS to Legacy', legacyEmployee, ORG_A, 3),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      entry('Legacy to Legacy', legacyEmployee, null, 4),
    ).resolves.toBeDefined();
    await expect(
      entry('Legacy to SaaS', employeeA, null, 5),
    ).resolves.toBeDefined();
  });

  it('sets only employeeId to null when a CalendarEntry Employee is deleted', async () => {
    const employee = await prisma.employee.create({
      data: employeeData('CALENDAR-DELETE', ORG_A),
    });
    const entry = await prisma.calendarEntry.create({
      data: {
        name: 'Delete employee',
        date: new Date('2098-04-01'),
        type: CalendarEntryType.LEAVE,
        employeeId: employee.id,
        organizationId: ORG_A,
      },
    });
    await prisma.employee.delete({ where: { id: employee.id } });
    await expect(
      prisma.calendarEntry.findUnique({ where: { id: entry.id } }),
    ).resolves.toMatchObject({
      organizationId: ORG_A,
      employeeId: null,
    });
  });

  it('requires a matching Membership only when both Employee FK columns are non-null', async () => {
    const matchingUser = await prisma.user.create({
      data: {
        normalizedEmail: 'composite-matching@example.test',
        passwordHash: 'test-hash',
      },
    });
    await prisma.membership.create({
      data: {
        organizationId: ORG_A,
        userId: matchingUser.id,
        role: MembershipRole.EMPLOYEE,
      },
    });
    await expect(
      prisma.employee.create({
        data: employeeData('MATCHING-MEMBERSHIP', ORG_A, {
          userId: matchingUser.id,
        }),
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.employee.create({
        data: employeeData('FOREIGN-MEMBERSHIP', ORG_A, { userId: userB }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const noMembershipUser = await prisma.user.create({
      data: {
        normalizedEmail: 'composite-no-membership@example.test',
        passwordHash: 'test-hash',
      },
    });
    await expect(
      prisma.employee.create({
        data: employeeData('NO-MEMBERSHIP', ORG_A, {
          userId: noMembershipUser.id,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.employee.create({ data: employeeData('NO-USER', ORG_A) }),
    ).resolves.toBeDefined();
    await expect(
      prisma.employee.create({
        data: employeeData('LEGACY-WITH-USER', null, {
          userId: noMembershipUser.id,
        }),
      }),
    ).resolves.toBeDefined();
  });

  it('allows Memberships without Employees and blocks deletion of a referenced Membership', async () => {
    await expect(
      prisma.membership.delete({
        where: {
          organizationId_userId: { organizationId: ORG_A, userId: userA },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const admin = await prisma.user.create({
      data: {
        normalizedEmail: 'composite-admin@example.test',
        passwordHash: 'test-hash',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        organizationId: ORG_A,
        userId: admin.id,
        role: MembershipRole.ADMIN,
      },
    });
    await expect(
      prisma.membership.delete({ where: { id: membership.id } }),
    ).resolves.toBeDefined();
  });

  it('stores all composite constraints as validated MATCH SIMPLE constraints', async () => {
    const constraints = await prisma.$queryRaw<
      Array<{ conname: string; convalidated: boolean; definition: string }>
    >`SELECT conname, convalidated, pg_get_constraintdef(oid, true) AS definition
      FROM pg_constraint
      WHERE conname IN (
        'Employee_organizationId_scheduleId_tenant_fkey',
        'Attendance_organizationId_employeeId_tenant_fkey',
        'CalendarEntry_organizationId_employeeId_tenant_fkey',
        'Employee_organizationId_userId_membership_fkey'
      )`;
    expect(constraints).toHaveLength(4);
    expect(constraints.every(({ convalidated }) => convalidated)).toBe(true);
  });
});
