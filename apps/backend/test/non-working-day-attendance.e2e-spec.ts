import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessRole, AttendanceStatus, PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { FULL_WORK_WEEK } from '../src/common/utils/attendance-date.util';
import { hashPassword } from '../src/common/security/password.util';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { SanctionStatus } from '../src/modules/sanctions/sanction-engine.types';
import { SanctionsService } from '../src/modules/sanctions/sanctions.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Non-working day attendance integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendanceService: AttendanceService;
  let monthlyExportService: MonthlyAttendanceExportService;
  let sanctionsService: SanctionsService;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();

    attendanceService = app.get(AttendanceService);
    monthlyExportService = app.get(MonthlyAttendanceExportService);
    sanctionsService = app.get(SanctionsService);
    await createCalendarExceptions();
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (app) {
      await app.close();
    }
  });

  async function createEmployee(sequence: string) {
    const passwordHash = await hashPassword('KonatechEmployee123!');
    const schedule = await prisma.schedule.create({
      data: {
        name: `Non Working Attendance ${sequence}`,
        startTime: '08:00',
        endTime: '17:00',
        latenessMarginMinutes: 0,
        isActive: true,
        workDays: [...FULL_WORK_WEEK],
      },
    });

    return prisma.employee.create({
      data: {
        employeeIdentifier: `EMP-NWD-${sequence}`,
        firstName: 'NonWorking',
        lastName: sequence,
        email: `non-working.${sequence}@konatech.local`,
        role: 'QA Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        department: 'QA',
        isActive: true,
        scheduleId: schedule.id,
      },
    });
  }

  async function createCalendarExceptions() {
    await prisma.calendarEntry.createMany({
      data: [
        {
          name: 'Public Holiday Work Test',
          date: new Date('2026-06-15T00:00:00.000Z'),
          type: 'PUBLIC_HOLIDAY',
          description: 'Non-working day work public holiday.',
        },
        {
          name: 'Company Holiday Work Test',
          date: new Date('2026-06-16T00:00:00.000Z'),
          type: 'COMPANY_HOLIDAY',
          description: 'Non-working day work company holiday.',
        },
      ],
    });
  }

  async function recordAttendance(input: {
    employeeId: string;
    date: string;
    checkInTime: string;
    checkOutTime: string;
  }) {
    await attendanceService.checkIn({
      employeeId: input.employeeId,
      occurredAt: `${input.date}T${input.checkInTime}:00.000Z`,
    });

    return attendanceService.checkOut({
      employeeId: input.employeeId,
      occurredAt: `${input.date}T${input.checkOutTime}:00.000Z`,
    });
  }

  it('treats weekend attendance as non-working day work without lateness or sanction', async () => {
    const employee = await createEmployee('WEEKEND');
    const attendance = await recordAttendance({
      employeeId: employee.id,
      date: '2026-06-14',
      checkInTime: '08:00',
      checkOutTime: '17:00',
    });
    const sanction = await sanctionsService.getAttendanceSanction(attendance.id);

    expect(attendance).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.NON_WORKING_DAY_WORK,
        minutesLate: 0,
        earlyExit: false,
        earlyExitMinutes: 0,
        outsideScheduleWork: true,
        overtimeHours: 9,
        overtimeMinutes: 540,
      }),
    );
    expect(sanction).toEqual(
      expect.objectContaining({
        status: SanctionStatus.NOT_APPLICABLE,
        amount: 0,
      }),
    );
  });

  it('treats public holiday attendance as non-working day work with full worked duration as overtime', async () => {
    const employee = await createEmployee('PUBLIC');
    const attendance = await recordAttendance({
      employeeId: employee.id,
      date: '2026-06-15',
      checkInTime: '08:30',
      checkOutTime: '16:30',
    });
    const sanction = await sanctionsService.getAttendanceSanction(attendance.id);

    expect(attendance).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.NON_WORKING_DAY_WORK,
        minutesLate: 0,
        earlyExit: false,
        earlyExitMinutes: 0,
        outsideScheduleWork: true,
        overtimeHours: 8,
        overtimeMinutes: 480,
      }),
    );
    expect(sanction.status).toBe(SanctionStatus.NOT_APPLICABLE);
  });

  it('treats company holiday attendance as non-working day work with full worked duration as overtime', async () => {
    const employee = await createEmployee('COMPANY');
    const attendance = await recordAttendance({
      employeeId: employee.id,
      date: '2026-06-16',
      checkInTime: '09:00',
      checkOutTime: '13:00',
    });
    const sanction = await sanctionsService.getAttendanceSanction(attendance.id);

    expect(attendance).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.NON_WORKING_DAY_WORK,
        minutesLate: 0,
        earlyExit: false,
        earlyExitMinutes: 0,
        outsideScheduleWork: true,
        overtimeHours: 4,
        overtimeMinutes: 240,
      }),
    );
    expect(sanction.status).toBe(SanctionStatus.NOT_APPLICABLE);
  });

  it('keeps existing working-day lateness and early departure behavior unchanged', async () => {
    const employee = await createEmployee('WORKING');
    const attendance = await recordAttendance({
      employeeId: employee.id,
      date: '2026-06-17',
      checkInTime: '08:30',
      checkOutTime: '16:30',
    });

    expect(attendance).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.LATE,
        minutesLate: 30,
        earlyExit: true,
        earlyExitMinutes: 30,
        outsideScheduleWork: false,
        overtimeHours: 0,
        overtimeMinutes: 0,
      }),
    );
  });

  it('exposes non-working day work in the monthly report overtime totals', async () => {
    const employee = await createEmployee('REPORT');
    const attendance = await recordAttendance({
      employeeId: employee.id,
      date: '2026-06-21',
      checkInTime: '08:00',
      checkOutTime: '15:30',
    });

    const report = await monthlyExportService.buildMonthlyReport({
      month: 6,
      year: 2026,
      employeeId: employee.id,
    });

    expect(attendance).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.NON_WORKING_DAY_WORK,
        overtimeHours: 7.5,
        overtimeMinutes: 450,
      }),
    );
    expect(report.employeeReport).not.toBeNull();
    expect(report.employeeReport).toEqual(
      expect.objectContaining({
        overtimeHours: '7,50 h',
      }),
    );
    expect(report.rows[0].overtimeHours).toBe('7.50');
    expect(report.employeeReport?.dailyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statusLabel: 'Travail jour non ouvré',
          overtimeLabel: 'Travail jour non ouvré - 7,50 h',
        }),
      ]),
    );
  });
});
