import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AccessRole,
  MembershipRole,
  PrismaClient,
  V1OperationalScopeStatus,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  STANDARD_WORK_WEEK,
  isScheduledOnDate,
  normalizeAttendanceDate,
} from '../src/common/utils/attendance-date.util';
import { hashPassword } from '../src/common/security/password.util';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { MonthlyAttendancePuppeteerPdfRendererService } from '../src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service';
import { prepareTestDatabase } from './test-database';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';

jest.setTimeout(30000);

describe('Monthly attendance custom period export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendanceService: AttendanceService;
  let exportService: MonthlyAttendanceExportService;
  let pdfRenderer: MonthlyAttendancePuppeteerPdfRendererService;

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
    exportService = app.get(MonthlyAttendanceExportService);
    pdfRenderer = app.get(MonthlyAttendancePuppeteerPdfRendererService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (app) {
      await app.close();
    }
  });

  async function login(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
      })
      .expect(201);

    return response.body as {
      accessToken: string;
    };
  }

  async function createEmployee(sequence: string) {
    const passwordHash = await hashPassword('KonatechEmployee123!');
    const schedule = await prisma.schedule.create({
      data: {
        name: `Custom Period ${sequence}`,
        startTime: '08:00',
        endTime: '17:00',
        latenessMarginMinutes: 0,
        isActive: true,
        workDays: [...STANDARD_WORK_WEEK],
      },
    });

    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `EMP-CUSTOM-${sequence}`,
        firstName: sequence,
        lastName: 'Period',
        email: `custom.period.${sequence}@konatech.local`,
        role: 'QA Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        department: 'QA',
        isActive: true,
        scheduleId: schedule.id,
      },
    });

    return { employee, schedule };
  }

  async function recordAttendance(input: {
    employeeId: string;
    date: string;
    checkInTime: string;
    checkOutTime: string;
    notes?: string;
  }) {
    await attendanceService.checkIn({
      employeeId: input.employeeId,
      occurredAt: `${input.date}T${input.checkInTime}:00.000Z`,
      notes: input.notes,
    });

    return attendanceService.checkOut({
      employeeId: input.employeeId,
      occurredAt: `${input.date}T${input.checkOutTime}:00.000Z`,
    });
  }

  function countExpectedWorkingDays(
    startDate: string,
    endDate: string,
    workDays = [...STANDARD_WORK_WEEK],
    nonWorkingDateKeys = new Set<number>(),
  ) {
    const start = normalizeAttendanceDate(
      new Date(`${startDate}T00:00:00.000Z`),
    );
    const end = normalizeAttendanceDate(new Date(`${endDate}T00:00:00.000Z`));
    let workingDays = 0;

    const cursor = new Date(start);

    while (cursor <= end) {
      const currentDate = normalizeAttendanceDate(cursor);

      if (
        isScheduledOnDate(workDays, currentDate) &&
        !nonWorkingDateKeys.has(currentDate.getTime())
      ) {
        workingDays += 1;
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return workingDays;
  }

  it('recalculates a custom period within the same month', async () => {
    const { employee } = await createEmployee('SAME-MONTH');

    await recordAttendance({
      employeeId: employee.id,
      date: '2026-08-10',
      checkInTime: '08:00',
      checkOutTime: '17:00',
    });

    const startDate = '2026-08-05';
    const endDate = '2026-08-20';
    const nonWorkingEntries = await prisma.calendarEntry.findMany({
      where: {
        isActive: true,
        type: {
          in: ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'],
        },
        date: {
          gte: new Date('2026-08-05T00:00:00.000Z'),
          lt: new Date('2026-08-21T00:00:00.000Z'),
        },
      },
      select: {
        date: true,
      },
    });
    const expectedWorkingDays = countExpectedWorkingDays(
      startDate,
      endDate,
      [...STANDARD_WORK_WEEK],
      new Set(
        nonWorkingEntries.map((entry) =>
          normalizeAttendanceDate(entry.date).getTime(),
        ),
      ),
    );

    const report = await exportService.buildMonthlyReport({
      mode: 'custom',
      startDate,
      endDate,
      employeeId: employee.id,
    });

    expect(report.reportingMode).toBe('custom');
    expect(report.periodLabel).toBe('Du 05 août 2026 au 20 août 2026');
    expect(report.employeeReport).toEqual(
      expect.objectContaining({
        workingDays: expectedWorkingDays,
        presenceDays: 1,
        absenceCount: expectedWorkingDays - 1,
      }),
    );
    expect(report.employeeReport?.dailyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '10/08/2026',
          statusLabel: 'Présent',
        }),
      ]),
    );
    expect(
      report.employeeReport?.dailyRows.every((row) => {
        const [day, month, year] = row.date.split('/').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));

        return (
          date >= new Date('2026-08-05T00:00:00.000Z') &&
          date <= new Date('2026-08-20T00:00:00.000Z')
        );
      }),
    ).toBe(true);
  });

  it('recalculates a custom period across month boundaries and shows absences, comments, and filtering correctly', async () => {
    await prisma.employee.updateMany({
      where: {
        email: {
          not: 'awa.traore@konatech.local',
        },
      },
      data: {
        isActive: false,
      },
    });

    const main = await createEmployee('A');
    const secondary = await createEmployee('B');

    await prisma.calendarEntry.create({
      data: {
        name: 'July Holiday',
        date: new Date('2026-07-08T00:00:00.000Z'),
        type: 'PUBLIC_HOLIDAY',
        description: 'Custom period holiday.',
      },
    });

    await recordAttendance({
      employeeId: main.employee.id,
      date: '2026-06-11',
      checkInTime: '08:00',
      checkOutTime: '17:05',
      notes: 'Réunion client.',
    });

    await recordAttendance({
      employeeId: main.employee.id,
      date: '2026-07-02',
      checkInTime: '08:25',
      checkOutTime: '17:10',
      notes: "Arrivée tardive en raison d'un déplacement professionnel.",
    });

    const startDate = '2026-06-10';
    const endDate = '2026-07-10';
    const nonWorkingEntries = await prisma.calendarEntry.findMany({
      where: {
        isActive: true,
        type: {
          in: ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'],
        },
        date: {
          gte: new Date('2026-06-10T00:00:00.000Z'),
          lt: new Date('2026-07-11T00:00:00.000Z'),
        },
      },
      select: {
        date: true,
      },
    });
    const nonWorkingDateKeys = new Set(
      nonWorkingEntries.map((entry) =>
        normalizeAttendanceDate(entry.date).getTime(),
      ),
    );
    const expectedWorkingDays = countExpectedWorkingDays(
      startDate,
      endDate,
      [...STANDARD_WORK_WEEK],
      nonWorkingDateKeys,
    );

    const report = await exportService.buildMonthlyReport({
      mode: 'custom',
      startDate,
      endDate,
      employeeId: main.employee.id,
      format: 'pdf',
    });

    expect(report.reportingMode).toBe('custom');
    expect(report.periodLabel).toBe('Du 10 juin 2026 au 10 juillet 2026');
    expect(report.rows).toHaveLength(1);
    expect(report.employeeReport).toEqual(
      expect.objectContaining({
        monthLabel: 'Du 10 juin 2026 au 10 juillet 2026',
        workingDays: expectedWorkingDays,
        presenceDays: 2,
        absenceCount: expectedWorkingDays - 2,
      }),
    );

    const dailyRows = report.employeeReport?.dailyRows ?? [];
    expect(dailyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '11/06/2026',
          statusLabel: 'Présent',
          commentLabel: 'Réunion client.',
        }),
        expect.objectContaining({
          date: '02/07/2026',
          statusLabel: 'Retard',
          commentLabel:
            "Arrivée tardive en raison d'un déplacement professionnel.",
        }),
        expect.objectContaining({
          date: '12/06/2026',
          statusLabel: 'Absence',
          commentLabel: null,
        }),
      ]),
    );
    expect(dailyRows.some((row) => row.date === '13/06/2026')).toBe(false);
    expect(dailyRows.some((row) => row.date === '08/07/2026')).toBe(false);

    const pdfHtml = (
      pdfRenderer as unknown as {
        buildDocument: (value: typeof report) => string;
      }
    ).buildDocument(report);

    expect(pdfHtml).toContain('Synthèse RH — Période personnalisée');
    expect(pdfHtml).toContain('Du 10 juin 2026 au 10 juillet 2026');
    expect(pdfHtml).toContain('Commentaire :');
    expect(pdfHtml).toContain('11/06/2026');
    expect(pdfHtml).toContain('02/07/2026');
    expect(pdfHtml).toContain('ABSENCE');

    const employeeFilteredReport = await exportService.buildMonthlyReport({
      mode: 'custom',
      startDate,
      endDate,
      employeeId: main.employee.id,
    });
    const teamReport = await exportService.buildMonthlyReport({
      mode: 'custom',
      startDate,
      endDate,
    });

    expect(employeeFilteredReport.rows).toHaveLength(1);
    expect(teamReport.rows).toHaveLength(3);

    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/attendance/exports/monthly?mode=custom&startDate=${startDate}&endDate=${endDate}&format=pdf&employeeId=${main.employee.id}`,
      )
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain(
      'rapport-presence-a-period-du-10-juin-2026-au-10-juillet-2026.pdf',
    );
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(response.body.length).toBeGreaterThan(2_000);

    expect(secondary.employee.id).toEqual(expect.any(String));
  });

  it('isolates Legacy, SaaS A, and SaaS B monthly exports', async () => {
    const legacy = await createEmployee('EXPORT-LEGACY');
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Export Tenant A',
          slug: 'export-tenant-a',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Export Tenant B',
          slug: 'export-tenant-b',
          timezone: 'Etc/UTC',
        },
      }),
    ]);
    const [scheduleA, scheduleB] = await Promise.all([
      prisma.schedule.create({
        data: {
          name: 'Export A Schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [...STANDARD_WORK_WEEK],
          organizationId: organizationA.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.schedule.create({
        data: {
          name: 'Export B Schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [...STANDARD_WORK_WEEK],
          organizationId: organizationB.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
    ]);
    const [employeeA, employeeB] = await Promise.all([
      prisma.employee.create({
        data: {
          employeeIdentifier: 'EMP-EXPORT-SAAS-A',
          firstName: 'Export',
          lastName: 'SaaS A',
          email: 'export.saas.a@konatech.local',
          role: 'QA Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationA.id,
          scheduleId: scheduleA.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.employee.create({
        data: {
          employeeIdentifier: 'EMP-EXPORT-SAAS-B',
          firstName: 'Export',
          lastName: 'SaaS B',
          email: 'export.saas.b@konatech.local',
          role: 'QA Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationB.id,
          scheduleId: scheduleB.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
    ]);
    const context = (organizationId: string): AuthenticationContext => ({
      generation: 'saas',
      purpose: 'account',
      userId: 'export-user',
      membershipId: 'export-membership',
      organizationId,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
    });
    const query = { month: 9, year: 2026 };

    const [legacyReport, reportA, reportB] = await Promise.all([
      exportService.buildMonthlyReport(query),
      exportService.buildMonthlyReport(query, context(organizationA.id)),
      exportService.buildMonthlyReport(query, context(organizationB.id)),
    ]);
    const legacyNames = legacyReport.rows.map((row) => row.fullName);
    const namesA = reportA.rows.map((row) => row.fullName);
    const namesB = reportB.rows.map((row) => row.fullName);
    const legacyName = `${legacy.employee.firstName} ${legacy.employee.lastName}`;
    const nameA = `${employeeA.firstName} ${employeeA.lastName}`;
    const nameB = `${employeeB.firstName} ${employeeB.lastName}`;

    expect(legacyNames).toContain(legacyName);
    expect(legacyNames).not.toContain(nameA);
    expect(legacyNames).not.toContain(nameB);
    expect(namesA).toContain(nameA);
    expect(namesA).not.toContain(nameB);
    expect(namesA).not.toContain(legacyName);
    expect(namesB).toContain(nameB);
    expect(namesB).not.toContain(nameA);
    expect(namesB).not.toContain(legacyName);
  });

  it('resets monthly tenant sanction tolerances across a custom report boundary', async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Custom sanctions tenant A',
          slug: 'custom-sanctions-tenant-a',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Custom sanctions tenant B',
          slug: 'custom-sanctions-tenant-b',
          timezone: 'Etc/UTC',
        },
      }),
    ]);
    const [scheduleA, scheduleB] = await Promise.all([
      prisma.schedule.create({
        data: {
          name: 'Custom sanctions A schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [...STANDARD_WORK_WEEK],
          organizationId: organizationA.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.schedule.create({
        data: {
          name: 'Custom sanctions B schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [...STANDARD_WORK_WEEK],
          organizationId: organizationB.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
    ]);
    const [employeeA, employeeB] = await Promise.all([
      prisma.employee.create({
        data: {
          employeeIdentifier: 'CUSTOM-SANCTIONS-A',
          firstName: 'Custom sanctions',
          lastName: 'A',
          email: 'custom-sanctions-a@konatech.local',
          role: 'QA Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationA.id,
          scheduleId: scheduleA.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.employee.create({
        data: {
          employeeIdentifier: 'CUSTOM-SANCTIONS-B',
          firstName: 'Custom sanctions',
          lastName: 'B',
          email: 'custom-sanctions-b@konatech.local',
          role: 'QA Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationB.id,
          scheduleId: scheduleB.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
    ]);

    await prisma.sanctionRule.createMany({
      data: [
        {
          organizationId: organizationA.id,
          code: 'CUSTOM_A_MINOR',
          type: 'MINOR_LATENESS',
          name: 'Tenant A minor lateness',
          latenessMinMinutes: 0,
          latenessMinInclusive: false,
          latenessMaxMinutes: 15,
          latenessMaxInclusive: true,
          monthlyTolerance: 1,
          amountFcfa: 2_000,
          priority: 10,
          appliedReason: 'Tenant A minor sanction.',
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
        {
          organizationId: organizationA.id,
          code: 'CUSTOM_A_MAJOR',
          type: 'MAJOR_LATENESS',
          name: 'Tenant A major lateness',
          latenessMinMinutes: 15,
          latenessMinInclusive: false,
          monthlyTolerance: 0,
          amountFcfa: 5_000,
          priority: 20,
          appliedReason: 'Tenant A major sanction.',
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
        {
          organizationId: organizationB.id,
          code: 'CUSTOM_B_MINOR',
          type: 'MINOR_LATENESS',
          name: 'Tenant B minor lateness',
          latenessMinMinutes: 0,
          latenessMinInclusive: false,
          latenessMaxMinutes: 5,
          latenessMaxInclusive: true,
          monthlyTolerance: 1,
          amountFcfa: 1_000,
          priority: 10,
          appliedReason: 'Tenant B minor sanction.',
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
        {
          organizationId: organizationB.id,
          code: 'CUSTOM_B_MAJOR',
          type: 'MAJOR_LATENESS',
          name: 'Tenant B major lateness',
          latenessMinMinutes: 5,
          latenessMinInclusive: false,
          monthlyTolerance: 0,
          amountFcfa: 9_000,
          priority: 20,
          appliedReason: 'Tenant B major sanction.',
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      ],
    });

    await prisma.calendarEntry.create({
      data: {
        organizationId: organizationA.id,
        name: 'Tenant A non-working day',
        date: new Date('2026-07-03T00:00:00.000Z'),
        type: 'PUBLIC_HOLIDAY',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });

    const attendanceDates = [
      ['2026-06-10', 10], // Outside the report, but consumes June tolerance.
      ['2026-06-15', 12],
      ['2026-06-20', 20],
      ['2026-06-25', 10],
      ['2026-07-02', 12],
      ['2026-07-03', 12], // Tenant A holiday: must not consume tolerance.
      ['2026-07-10', 25],
    ] as const;
    await prisma.attendance.createMany({
      data: attendanceDates.flatMap(([date, minutesLate]) => [
        {
          employeeId: employeeA.id,
          organizationId: organizationA.id,
          date: new Date(`${date}T00:00:00.000Z`),
          minutesLate,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
        {
          employeeId: employeeB.id,
          organizationId: organizationB.id,
          date: new Date(`${date}T00:00:00.000Z`),
          minutesLate,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      ]),
    });

    const context = (organizationId: string): AuthenticationContext => ({
      generation: 'saas',
      purpose: 'account',
      userId: 'custom-sanctions-user',
      membershipId: 'custom-sanctions-membership',
      organizationId,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
    });
    const query = {
      mode: 'custom' as const,
      startDate: '2026-06-15',
      endDate: '2026-07-15',
    };
    const [reportA, reportB] = await Promise.all([
      exportService.buildMonthlyReport(
        { ...query, employeeId: employeeA.id },
        context(organizationA.id),
      ),
      exportService.buildMonthlyReport(
        { ...query, employeeId: employeeB.id },
        context(organizationB.id),
      ),
    ]);

    expect(reportA.rows.map((row) => row.fullName)).not.toContain(
      `${employeeB.firstName} ${employeeB.lastName}`,
    );
    expect(reportB.rows.map((row) => row.fullName)).not.toContain(
      `${employeeA.firstName} ${employeeA.lastName}`,
    );
    expect(reportA.employeeReport?.sanctionSummary).toMatchObject({
      toleratedCount: 1,
      appliedCount: 3,
      totalAmount: 9_000,
    });
    expect(reportB.employeeReport?.sanctionSummary).toMatchObject({
      toleratedCount: 0,
      appliedCount: 5,
      totalAmount: 45_000,
    });
    expect(
      reportA.employeeReport?.dailyRows.find((row) => row.date === '02/07/2026')
        ?.sanctionLabel,
    ).toBe('Tolérance');
    expect(
      reportA.employeeReport?.dailyRows.find((row) => row.date === '03/07/2026')
        ?.sanctionLabel,
    ).toBe('-');
    expect(
      reportA.employeeReport?.dailyRows.find((row) => row.date === '20/06/2026')
        ?.sanctionLabel,
    ).toBe('-');
  });
});
