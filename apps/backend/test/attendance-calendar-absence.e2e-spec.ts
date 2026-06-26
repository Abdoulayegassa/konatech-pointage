import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessRole, AttendanceStatus, PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { FULL_WORK_WEEK, setTimeOnDate } from '../src/common/utils/attendance-date.util';
import { hashPassword } from '../src/common/security/password.util';
import { AppClockService } from '../src/common/time/app-clock.service';
import { AttendanceMonthlyMetricsService } from '../src/modules/attendance/attendance-monthly-metrics.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('HR Calendar absence integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendanceService: AttendanceService;
  let monthlyMetricsService: AttendanceMonthlyMetricsService;
  let monthlyExportService: MonthlyAttendanceExportService;
  let clock: AppClockService;

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
    monthlyMetricsService = app.get(AttendanceMonthlyMetricsService);
    monthlyExportService = app.get(MonthlyAttendanceExportService);
    clock = app.get(AppClockService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (app) {
      await app.close();
    }
  });

  async function createCalendarAwareEmployee(sequence: string) {
    const passwordHash = await hashPassword('KonatechEmployee123!');
    const schedule = await prisma.schedule.create({
      data: {
        name: `Calendar Absence ${sequence}`,
        startTime: '08:00',
        endTime: '17:00',
        latenessMarginMinutes: 0,
        isActive: true,
        workDays: [...FULL_WORK_WEEK],
      },
    });
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `EMP-CALENDAR-${sequence}`,
        firstName: 'Calendar',
        lastName: `Absence ${sequence}`,
        email: `calendar.absence.${sequence}@konatech.local`,
        role: 'QA Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        department: 'QA',
        isActive: true,
        scheduleId: schedule.id,
      },
    });

    return {
      employee,
      schedule,
    };
  }

  async function createJuneCalendarExceptions() {
    await prisma.calendarEntry.createMany({
      data: [
        {
          name: 'Public Holiday Test',
          date: new Date('2026-06-15T00:00:00.000Z'),
          type: 'PUBLIC_HOLIDAY',
          description: 'Calendar absence test public holiday.',
        },
        {
          name: 'Company Holiday Test',
          date: new Date('2026-06-16T00:00:00.000Z'),
          type: 'COMPANY_HOLIDAY',
          description: 'Calendar absence test company holiday.',
        },
      ],
    });
  }

  it('does not generate absences on weekends, public holidays, or company holidays', async () => {
    await prisma.employee.updateMany({
      data: {
        isActive: false,
      },
    });
    const { employee } = await createCalendarAwareEmployee('NO-GENERATE');
    await createJuneCalendarExceptions();

    await expect(
      attendanceService.getTodaySummary(new Date('2026-06-14T12:00:00.000Z')),
    ).resolves.toEqual(
      expect.objectContaining({
        expected: 0,
        absences: 0,
      }),
    );
    await expect(
      attendanceService.getTodaySummary(new Date('2026-06-15T12:00:00.000Z')),
    ).resolves.toEqual(
      expect.objectContaining({
        expected: 0,
        absences: 0,
      }),
    );
    await expect(
      attendanceService.getTodaySummary(new Date('2026-06-16T12:00:00.000Z')),
    ).resolves.toEqual(
      expect.objectContaining({
        expected: 0,
        absences: 0,
      }),
    );
    await expect(
      attendanceService.getTodaySummary(new Date('2026-06-17T12:00:00.000Z')),
    ).resolves.toEqual(
      expect.objectContaining({
        expected: 1,
        absences: 1,
      }),
    );

    await monthlyMetricsService.recalculateMonth(2026, 6, employee.id);

    const records = await prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        date: {
          in: [
            new Date('2026-06-14T00:00:00.000Z'),
            new Date('2026-06-15T00:00:00.000Z'),
            new Date('2026-06-16T00:00:00.000Z'),
            new Date('2026-06-17T00:00:00.000Z'),
          ],
        },
      },
      orderBy: {
        date: 'asc',
      },
      select: {
        date: true,
        status: true,
        absenceCount: true,
      },
    });

    expect(
      records.find(
        (record) =>
          record.date.toISOString() === '2026-06-14T00:00:00.000Z',
      ),
    ).toBeUndefined();
    expect(
      records.find(
        (record) =>
          record.date.toISOString() === '2026-06-15T00:00:00.000Z',
      ),
    ).toBeUndefined();
    expect(
      records.find(
        (record) =>
          record.date.toISOString() === '2026-06-16T00:00:00.000Z',
      ),
    ).toBeUndefined();
    expect(
      records.find(
        (record) =>
          record.date.toISOString() === '2026-06-17T00:00:00.000Z',
      ),
    ).toEqual(
      expect.objectContaining({
        status: AttendanceStatus.ABSENT,
      }),
    );
  });

  it('excludes weekends and HR holidays from monthly report absence counts', async () => {
    const { employee } = await createCalendarAwareEmployee('REPORT');
    await createJuneCalendarExceptions();

    const eligibleWorkedDates = [
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
      '2026-06-11',
      '2026-06-12',
      '2026-06-22',
      '2026-06-23',
    ];

    await prisma.attendance.createMany({
      data: eligibleWorkedDates.map((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);

        return {
          employeeId: employee.id,
          date,
          clockInAt: setTimeOnDate(date, '08:00'),
          clockOutAt: setTimeOnDate(date, '17:00'),
          status: AttendanceStatus.PRESENT,
          minutesLate: 0,
        };
      }),
    });

    const nowSpy = jest
      .spyOn(clock, 'now')
      .mockReturnValue(new Date('2026-06-24T12:00:00.000Z'));

    try {
      const report = await monthlyExportService.buildMonthlyReport({
        month: 6,
        year: 2026,
        employeeId: employee.id,
      });

      expect(report.employeeReport).toEqual(
        expect.objectContaining({
          workingDays: 15,
          presenceDays: 12,
          absenceCount: 3,
        }),
      );
      expect(report.rows[0]).toEqual(
        expect.objectContaining({
          workingDays: 15,
          presenceDays: 12,
          absentDays: 3,
          absenceCount: 3,
        }),
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
