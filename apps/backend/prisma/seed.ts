import { AccessRole, AttendanceStatus, PrismaClient } from '@prisma/client';
import { getAttendanceCheckOutOutcome } from '../src/common/utils/attendance-checkout.util';
import {
  findPreviousScheduledDate,
  FULL_WORK_WEEK,
  getWeekdayName,
  isScheduledOnDate,
  normalizeAttendanceDate,
  setTimeOnDate,
  STANDARD_WORK_WEEK,
} from '../src/common/utils/attendance-date.util';
import {
  hashPassword,
  hashPinCode,
} from '../src/common/security/password.util';
import { buildAttendanceScheduleSnapshot } from '../src/common/utils/attendance-schedule-snapshot.util';

export async function seedDatabase(
  prisma: PrismaClient,
  referenceDate = new Date(),
) {
  const adminPasswordHash = await hashPassword('KonatechAdmin123!');
  const employeePasswordHash = await hashPassword('KonatechEmployee123!');
  const fatoumataPinCodeHash = await hashPinCode('4103');
  const ibrahimPinCodeHash = await hashPinCode('4104');

  const officeSchedule = await prisma.schedule.upsert({
    where: {
      name: 'Office Day Shift',
    },
    update: {
      startTime: '08:00',
      endTime: '17:00',
      latenessMarginMinutes: 5,
      isActive: true,
      workDays: [...STANDARD_WORK_WEEK],
    },
    create: {
      name: 'Office Day Shift',
      startTime: '08:00',
      endTime: '17:00',
      latenessMarginMinutes: 5,
      isActive: true,
      workDays: [...STANDARD_WORK_WEEK],
    },
  });

  const operationsSchedule = await prisma.schedule.upsert({
    where: {
      name: 'Operations Rotation',
    },
    update: {
      startTime: '09:00',
      endTime: '18:00',
      latenessMarginMinutes: 10,
      isActive: true,
      workDays: [...FULL_WORK_WEEK],
    },
    create: {
      name: 'Operations Rotation',
      startTime: '09:00',
      endTime: '18:00',
      latenessMarginMinutes: 10,
      isActive: true,
      workDays: [...FULL_WORK_WEEK],
    },
  });

  const employeeIdentifiers = {
    awa: buildSeedEmployeeIdentifier(2026, 1),
    salif: buildSeedEmployeeIdentifier(2026, 2),
    fatoumata: buildSeedEmployeeIdentifier(2026, 3),
    ibrahim: buildSeedEmployeeIdentifier(2026, 4),
    aminata: buildSeedEmployeeIdentifier(2026, 5),
  } as const;

  const employees = await Promise.all([
    prisma.employee.upsert({
      where: {
        email: 'awa.traore@konatech.local',
      },
      update: {
        employeeIdentifier: employeeIdentifiers.awa,
        pinCode: null,
        pinCodeHash: null,
        firstName: 'Awa',
        lastName: 'Traore',
        role: 'Operations Lead',
        accessRole: AccessRole.ADMIN,
        passwordHash: adminPasswordHash,
        department: 'Operations',
        isActive: true,
        scheduleId: officeSchedule.id,
      },
      create: {
        employeeIdentifier: employeeIdentifiers.awa,
        pinCode: null,
        pinCodeHash: null,
        firstName: 'Awa',
        lastName: 'Traore',
        email: 'awa.traore@konatech.local',
        role: 'Operations Lead',
        accessRole: AccessRole.ADMIN,
        passwordHash: adminPasswordHash,
        department: 'Operations',
        isActive: true,
        scheduleId: officeSchedule.id,
      },
    }),
    prisma.employee.upsert({
      where: {
        email: 'salif.diallo@konatech.local',
      },
      update: {
        employeeIdentifier: employeeIdentifiers.salif,
        pinCode: null,
        pinCodeHash: null,
        firstName: 'Salif',
        lastName: 'Diallo',
        role: 'HR Coordinator',
        accessRole: AccessRole.ADMIN,
        passwordHash: adminPasswordHash,
        department: 'People Ops',
        isActive: true,
        scheduleId: officeSchedule.id,
      },
      create: {
        employeeIdentifier: employeeIdentifiers.salif,
        pinCode: null,
        pinCodeHash: null,
        firstName: 'Salif',
        lastName: 'Diallo',
        email: 'salif.diallo@konatech.local',
        role: 'HR Coordinator',
        accessRole: AccessRole.ADMIN,
        passwordHash: adminPasswordHash,
        department: 'People Ops',
        isActive: true,
        scheduleId: officeSchedule.id,
      },
    }),
    prisma.employee.upsert({
      where: {
        email: 'fatoumata.konate@konatech.local',
      },
      update: {
        employeeIdentifier: employeeIdentifiers.fatoumata,
        pinCode: null,
        pinCodeHash: fatoumataPinCodeHash,
        firstName: 'Fatoumata',
        lastName: 'Konate',
        role: 'Support Supervisor',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: employeePasswordHash,
        department: 'Customer Support',
        isActive: true,
        scheduleId: operationsSchedule.id,
      },
      create: {
        employeeIdentifier: employeeIdentifiers.fatoumata,
        pinCode: null,
        pinCodeHash: fatoumataPinCodeHash,
        firstName: 'Fatoumata',
        lastName: 'Konate',
        email: 'fatoumata.konate@konatech.local',
        role: 'Support Supervisor',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: employeePasswordHash,
        department: 'Customer Support',
        isActive: true,
        scheduleId: operationsSchedule.id,
      },
    }),
    prisma.employee.upsert({
      where: {
        email: 'ibrahim.coulibaly@konatech.local',
      },
      update: {
        employeeIdentifier: employeeIdentifiers.ibrahim,
        pinCode: null,
        pinCodeHash: ibrahimPinCodeHash,
        firstName: 'Ibrahim',
        lastName: 'Coulibaly',
        role: 'Field Agent',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: employeePasswordHash,
        department: 'Customer Support',
        isActive: true,
        scheduleId: operationsSchedule.id,
      },
      create: {
        employeeIdentifier: employeeIdentifiers.ibrahim,
        pinCode: null,
        pinCodeHash: ibrahimPinCodeHash,
        firstName: 'Ibrahim',
        lastName: 'Coulibaly',
        email: 'ibrahim.coulibaly@konatech.local',
        role: 'Field Agent',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: employeePasswordHash,
        department: 'Customer Support',
        isActive: true,
        scheduleId: operationsSchedule.id,
      },
    }),
    prisma.employee.upsert({
      where: {
        email: 'aminata.keita@konatech.local',
      },
      update: {
        employeeIdentifier: employeeIdentifiers.aminata,
        pinCode: '4105',
        pinCodeHash: null,
        firstName: 'Aminata',
        lastName: 'Keita',
        role: 'Payroll Analyst',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: employeePasswordHash,
        department: 'Finance',
        isActive: true,
        scheduleId: null,
      },
      create: {
        employeeIdentifier: employeeIdentifiers.aminata,
        pinCode: '4105',
        pinCodeHash: null,
        firstName: 'Aminata',
        lastName: 'Keita',
        email: 'aminata.keita@konatech.local',
        role: 'Payroll Analyst',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: employeePasswordHash,
        department: 'Finance',
        isActive: true,
        scheduleId: null,
      },
    }),
  ]);

  const employeeByEmail = Object.fromEntries(
    employees.map((employee) => [employee.email, employee]),
  );
  const scheduleByEmployeeEmail = {
    'awa.traore@konatech.local': officeSchedule,
    'salif.diallo@konatech.local': officeSchedule,
    'fatoumata.konate@konatech.local': operationsSchedule,
    'ibrahim.coulibaly@konatech.local': operationsSchedule,
    'aminata.keita@konatech.local': null,
  };

  const today = normalizeAttendanceDate(referenceDate);
  const previousOfficeDay = findPreviousScheduledDate(
    today,
    STANDARD_WORK_WEEK,
  );
  const previousOperationsDay = findPreviousScheduledDate(
    today,
    FULL_WORK_WEEK,
  );

  const attendanceEntries = [
    ...(isScheduledOnDate([...STANDARD_WORK_WEEK], today)
      ? [
          {
            employeeEmail: 'awa.traore@konatech.local',
            date: today,
            clockInAt: setTimeOnDate(today, '07:56'),
            clockOutAt: setTimeOnDate(today, '17:04'),
            status: AttendanceStatus.PRESENT,
            minutesLate: 0,
            notes: 'Opened the office before team arrival.',
          },
          {
            employeeEmail: 'salif.diallo@konatech.local',
            date: today,
            clockInAt: null,
            clockOutAt: null,
            status: AttendanceStatus.ABSENT,
            minutesLate: 0,
            notes: 'Approved day off recorded by HR.',
          },
        ]
      : []),
    {
      employeeEmail: 'fatoumata.konate@konatech.local',
      date: today,
      clockInAt: setTimeOnDate(today, '08:58'),
      clockOutAt: setTimeOnDate(today, '18:03'),
      status: AttendanceStatus.PRESENT,
      minutesLate: 0,
      notes: 'Handled morning support handover.',
    },
    {
      employeeEmail: 'ibrahim.coulibaly@konatech.local',
      date: today,
      clockInAt: setTimeOnDate(today, '09:17'),
      clockOutAt: null,
      status: AttendanceStatus.LATE,
      minutesLate: 17,
      notes: `Late arrival logged on ${getWeekdayName(today).toLowerCase()}.`,
    },
    {
      employeeEmail: 'awa.traore@konatech.local',
      date: previousOfficeDay,
      clockInAt: setTimeOnDate(previousOfficeDay, '08:11'),
      clockOutAt: setTimeOnDate(previousOfficeDay, '17:01'),
      status: AttendanceStatus.LATE,
      minutesLate: 11,
      notes: 'Late arrival caused by supplier visit.',
    },
    {
      employeeEmail: 'salif.diallo@konatech.local',
      date: previousOfficeDay,
      clockInAt: setTimeOnDate(previousOfficeDay, '07:59'),
      clockOutAt: setTimeOnDate(previousOfficeDay, '16:55'),
      status: AttendanceStatus.PRESENT,
      minutesLate: 0,
      notes: 'Closed HR documentation backlog.',
    },
    {
      employeeEmail: 'fatoumata.konate@konatech.local',
      date: previousOperationsDay,
      clockInAt: setTimeOnDate(previousOperationsDay, '09:01'),
      clockOutAt: setTimeOnDate(previousOperationsDay, '18:07'),
      status: AttendanceStatus.PRESENT,
      minutesLate: 0,
      notes: 'Resolved two escalation tickets during the shift.',
    },
    {
      employeeEmail: 'ibrahim.coulibaly@konatech.local',
      date: previousOperationsDay,
      clockInAt: setTimeOnDate(previousOperationsDay, '08:54'),
      clockOutAt: setTimeOnDate(previousOperationsDay, '17:49'),
      status: AttendanceStatus.PRESENT,
      minutesLate: 0,
      notes: 'Field round completed on schedule.',
    },
  ];

  for (const entry of attendanceEntries) {
    const employee = employeeByEmail[entry.employeeEmail];
    const schedule =
      scheduleByEmployeeEmail[
        entry.employeeEmail as keyof typeof scheduleByEmployeeEmail
      ];
    const scheduledExitTime =
      schedule && isScheduledOnDate(schedule.workDays, entry.date)
        ? setTimeOnDate(entry.date, schedule.endTime)
        : null;
    const exitOutcome = getSeedExitOutcome(scheduledExitTime, entry.clockOutAt);
    const absenceCount = getSeedAbsenceCount(
      entry.employeeEmail,
      schedule,
      entry.date,
      attendanceEntries,
    );

    await prisma.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: entry.date,
        },
      },
      update: {
        clockInAt: entry.clockInAt,
        clockOutAt: entry.clockOutAt,
        scheduledExitTime,
        earlyExit: exitOutcome.earlyExit,
        earlyExitMinutes: exitOutcome.earlyExitMinutes,
        overtimeHours: exitOutcome.overtimeHours,
        overtimeMinutes: exitOutcome.overtimeMinutes,
        lateExit: exitOutcome.lateExit,
        absenceCount,
        status: entry.status,
        minutesLate: entry.minutesLate,
        notes: entry.notes,
        ...buildAttendanceScheduleSnapshot(
          schedule,
          entry.clockInAt ?? entry.date,
        ),
      },
      create: {
        employeeId: employee.id,
        date: entry.date,
        clockInAt: entry.clockInAt,
        clockOutAt: entry.clockOutAt,
        scheduledExitTime,
        earlyExit: exitOutcome.earlyExit,
        earlyExitMinutes: exitOutcome.earlyExitMinutes,
        overtimeHours: exitOutcome.overtimeHours,
        overtimeMinutes: exitOutcome.overtimeMinutes,
        lateExit: exitOutcome.lateExit,
        absenceCount,
        status: entry.status,
        minutesLate: entry.minutesLate,
        notes: entry.notes,
        ...buildAttendanceScheduleSnapshot(
          schedule,
          entry.clockInAt ?? entry.date,
        ),
      },
    });
  }

  return {
    employees: employees.length,
    schedules: 2,
    attendanceRecords: attendanceEntries.length,
  };
}

function getSeedAbsenceCount(
  employeeEmail: string,
  schedule: {
    isActive: boolean;
    workDays: Parameters<typeof isScheduledOnDate>[0];
  } | null,
  referenceDate: Date,
  entries: Array<{
    employeeEmail: string;
    date: Date;
    clockInAt: Date | null;
  }>,
) {
  if (!schedule || !schedule.isActive) {
    return 0;
  }

  const start = new Date(referenceDate);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  const referenceDayEnd = normalizeAttendanceDate(referenceDate);
  referenceDayEnd.setDate(referenceDayEnd.getDate() + 1);
  const countingEnd = referenceDayEnd < end ? referenceDayEnd : end;

  const workedDateKeys = new Set(
    entries
      .filter(
        (entry) =>
          entry.employeeEmail === employeeEmail &&
          entry.clockInAt &&
          entry.date >= start &&
          entry.date < end,
      )
      .map((entry) => normalizeAttendanceDate(entry.date).getTime()),
  );
  const cursor = new Date(start);
  let absenceCount = 0;

  while (cursor < countingEnd) {
    const currentDate = normalizeAttendanceDate(cursor);

    if (
      isScheduledOnDate(schedule.workDays, currentDate) &&
      !workedDateKeys.has(currentDate.getTime())
    ) {
      absenceCount += 1;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return absenceCount;
}

function getSeedExitOutcome(
  scheduledExitTime: Date | null,
  clockOutAt: Date | null,
) {
  return getAttendanceCheckOutOutcome(scheduledExitTime, clockOutAt);
}

function buildSeedEmployeeIdentifier(year: number, sequence: number) {
  return `EMP-${year}-${String(sequence).padStart(3, '0')}`;
}

const prisma = new PrismaClient();

async function main() {
  const result = await seedDatabase(prisma);

  console.log(
    `Seed complete: ${result.employees} employees, ${result.schedules} schedules, ${result.attendanceRecords} attendance records.`,
  );
}

if (require.main === module) {
  main()
    .catch(async (error) => {
      console.error('Seed failed:', error);
      await prisma.$disconnect();
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
