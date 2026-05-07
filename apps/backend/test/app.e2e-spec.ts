import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AttendanceStatus, PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { inflateRawSync, inflateSync } from 'zlib';

import { AppModule, validateSecurityConfig } from '../src/app.module';
import { verifyPinCode } from '../src/common/security/password.util';
import { MonthlyAttendanceCsvExporterService } from '../src/modules/attendance/exports/monthly-attendance-csv-exporter.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { MonthlyAttendancePuppeteerPdfRendererService } from '../src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { prepareTestDatabase } from './test-database';
import { resolveSessionToken } from '../../frontend/lib/auth-session';

jest.setTimeout(30000);

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let managedEmployeeId: string;
  let managedScheduleId: string;
  let officeScheduleId: string;
  let operationsScheduleId: string;
  let awaEmployeeId: string;
  const attendanceSecurityEnvKeys = [
    'ATTENDANCE_SECURITY_ENABLED',
    'COMPANY_LATITUDE',
    'COMPANY_LONGITUDE',
    'ATTENDANCE_TRUSTED_RADIUS_METERS',
    'ATTENDANCE_WARNING_RADIUS_METERS',
    'ATTENDANCE_ALLOWED_RADIUS_METERS',
    'ATTENDANCE_MAX_ACCURACY_METERS',
  ];

  function enableAttendanceSecurityForTest(
    overrides: Partial<
      Record<(typeof attendanceSecurityEnvKeys)[number], string | null>
    > = {},
  ) {
    const previousValues = Object.fromEntries(
      attendanceSecurityEnvKeys.map((key) => [key, process.env[key]]),
    );
    const nextValues: Record<
      (typeof attendanceSecurityEnvKeys)[number],
      string
    > = {
      ATTENDANCE_SECURITY_ENABLED: 'true',
      COMPANY_LATITUDE: '5.359952',
      COMPANY_LONGITUDE: '-4.008256',
      ATTENDANCE_TRUSTED_RADIUS_METERS: '100',
      ATTENDANCE_WARNING_RADIUS_METERS: '300',
      ATTENDANCE_ALLOWED_RADIUS_METERS: '',
      ATTENDANCE_MAX_ACCURACY_METERS: '200',
    };

    for (const key of attendanceSecurityEnvKeys) {
      const nextValue = key in overrides ? overrides[key] : nextValues[key];

      if (nextValue === null || nextValue === undefined || nextValue === '') {
        delete process.env[key];
      } else {
        process.env[key] = nextValue;
      }
    }

    return () => {
      for (const key of attendanceSecurityEnvKeys) {
        const previousValue = previousValues[key];

        if (previousValue === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previousValue;
        }
      }
    };
  }

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
      user: {
        email: string;
        accessRole: 'ADMIN' | 'EMPLOYEE';
      };
    };
  }

  function loginForAttendanceEntry(pinCode: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/attendance-entry/login')
      .send({
        pinCode,
      });
  }

  function collectNestedKeys(
    value: unknown,
    matcher: (key: string) => boolean,
    path = '$',
  ): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        collectNestedKeys(item, matcher, `${path}[${index}]`),
      );
    }

    if (!value || typeof value !== 'object') {
      return [];
    }

    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nestedValue]) => {
        const currentPath = `${path}.${key}`;

        return [
          ...(matcher(key) ? [currentPath] : []),
          ...collectNestedKeys(nestedValue, matcher, currentPath),
        ];
      },
    );
  }

  function expectNoPinSecretExposure(payload: unknown) {
    expect(
      collectNestedKeys(
        payload,
        (key) => key === 'pinCode' || key === 'pinCodeHash',
      ),
    ).toEqual([]);
  }

  function expectNoKnownPinValues(payload: string) {
    for (const pinCode of ['4103', '4104', '4105', '4900']) {
      expect(payload).not.toContain(pinCode);
    }
  }

  function extractPdfStreams(buffer: Buffer) {
    const content = buffer.toString('latin1');
    const streams = content.match(/stream\r?\n[\s\S]*?\r?\nendstream/g) ?? [];

    return streams
      .map((stream) =>
        stream
          .replace(/^stream\r?\n/, '')
          .replace(/\r?\nendstream$/, ''),
      )
      .flatMap((rawStream) => {
        const streamBuffer = Buffer.from(rawStream, 'latin1');

        for (const inflate of [inflateSync, inflateRawSync]) {
          try {
            return [inflate(streamBuffer).toString('utf8')];
          } catch {
            continue;
          }
        }

        return [];
      })
      .join('\n');
  }

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
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    if (app) {
      await app.close();
    }
  });

  it('/api/v1/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('konatech-attendance-api');
  });

  it('/api/v1/auth/login (POST)', async () => {
    const response = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    expect(response.accessToken).toEqual(expect.any(String));
    expect(response.user).toEqual(
      expect.objectContaining({
        email: 'awa.traore@konatech.local',
        accessRole: 'ADMIN',
      }),
    );
    expectNoPinSecretExposure(response);
  });

  it('attendance-entry session selection never falls back to the normal app session', () => {
    expect(
      resolveSessionToken(
        {
          sessionToken: 'admin-session',
          attendanceEntrySessionToken: 'employee-session',
        },
        'attendance-entry',
      ),
    ).toBe('employee-session');
    expect(
      resolveSessionToken(
        {
          sessionToken: 'admin-session',
          attendanceEntrySessionToken: null,
        },
        'attendance-entry',
      ),
    ).toBeNull();
    expect(
      resolveSessionToken(
        {
          sessionToken: 'admin-session',
          attendanceEntrySessionToken: 'employee-session',
        },
        'default',
      ),
    ).toBe('admin-session');
  });

  it('production config validation rejects unsafe frontend origins', () => {
    const baseConfig = {
      NODE_ENV: 'production',
      ATTENDANCE_SECURITY_ENABLED: false,
      JWT_SECRET:
        'replace-this-production-jwt-secret-with-at-least-32-characters',
      FRONTEND_URL: 'https://attendance.example.com',
    };

    expect(() =>
      validateSecurityConfig({
        ...baseConfig,
        FRONTEND_URL: 'http://attendance.example.com',
      }),
    ).toThrow('FRONTEND_URL must use HTTPS in production.');
    expect(() =>
      validateSecurityConfig({
        ...baseConfig,
        FRONTEND_URL: 'http://localhost:3000',
      }),
    ).toThrow('FRONTEND_URL cannot point to localhost in production.');
    expect(() =>
      validateSecurityConfig({
        ...baseConfig,
        FRONTEND_URL: 'https://demo.trycloudflare.com',
      }),
    ).toThrow(
      'FRONTEND_URL cannot use a temporary tunnel hostname in production.',
    );
  });

  it('/api/v1/auth/attendance-entry/login (POST) allows a valid employee PIN with a short-lived token', async () => {
    const response = await loginForAttendanceEntry('4103').expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: '15m',
        user: expect.objectContaining({
          email: 'fatoumata.konate@konatech.local',
          accessRole: 'EMPLOYEE',
        }),
      }),
    );
    expectNoPinSecretExposure(response.body);
  });

  it('/api/v1/auth/attendance-entry/login (POST) migrates a legacy plain PIN to pinCodeHash on first successful login', async () => {
    const legacyEmployeeBefore = await prisma.employee.findUniqueOrThrow({
      where: {
        email: 'aminata.keita@konatech.local',
      },
      select: {
        id: true,
        pinCode: true,
        pinCodeHash: true,
      },
    });

    expect(legacyEmployeeBefore.pinCode).toBe('4105');
    expect(legacyEmployeeBefore.pinCodeHash).toBeNull();

    const response = await loginForAttendanceEntry('4105').expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: '15m',
        user: expect.objectContaining({
          email: 'aminata.keita@konatech.local',
          accessRole: 'EMPLOYEE',
        }),
      }),
    );
    expectNoPinSecretExposure(response.body);

    const legacyEmployeeAfter = await prisma.employee.findUniqueOrThrow({
      where: {
        id: legacyEmployeeBefore.id,
      },
      select: {
        pinCode: true,
        pinCodeHash: true,
      },
    });

    expect(legacyEmployeeAfter.pinCode).toBeNull();
    expect(legacyEmployeeAfter.pinCodeHash).toEqual(expect.any(String));
    expect(
      await verifyPinCode('4105', legacyEmployeeAfter.pinCodeHash as string),
    ).toBe(true);
  });

  it('/api/v1/auth/attendance-entry/login (POST) returns generic credentials errors for invalid PIN attempts', async () => {
    const response = await loginForAttendanceEntry('9999').expect(401);

    expect(response.body.message).toBe('Identifiants invalides.');
    expect(response.body.message).not.toContain('PIN');
    expect(response.body.message).not.toContain('incorrect');
    expect(response.body.message).not.toContain('inactif');
  });

  it('/api/v1/auth/attendance-entry/login (POST) blocks repeated PIN brute-force attempts with HTTP 429', async () => {
    let blockedResponse:
      | Awaited<ReturnType<typeof loginForAttendanceEntry>>
      | undefined;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await loginForAttendanceEntry('9999');

      if (response.status === 429) {
        blockedResponse = response;
        break;
      }

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Identifiants invalides.');
    }

    expect(blockedResponse?.status).toBe(429);

    const throttledResponse = blockedResponse as NonNullable<
      typeof blockedResponse
    >;

    expect(throttledResponse.body.message).toBe(
      'Trop de tentatives. Reessayez dans quelques minutes.',
    );
    expect(throttledResponse.body.message).not.toContain('PIN');
    expect(throttledResponse.body.message).not.toContain('employ');
  });

  it('/api/v1/auth/me (GET) returns the authenticated user', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        email: 'awa.traore@konatech.local',
        accessRole: 'ADMIN',
      }),
    );
    expectNoPinSecretExposure(response.body);
  });

  it('/api/v1/dashboard/overview (GET) requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .expect(401);
  });

  it('/api/v1/dashboard/overview (GET) blocks employee role', async () => {
    const session = await login(
      'ibrahim.coulibaly@konatech.local',
      'KonatechEmployee123!',
    );

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('/api/v1/dashboard/overview (GET) allows admin role', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        generatedAt: expect.any(String),
        date: expect.any(String),
        summary: expect.objectContaining({
          totalEmployees: expect.any(Number),
          presentToday: expect.any(Number),
          lateEmployeesToday: expect.any(Number),
          absentEmployeesToday: expect.any(Number),
          earlyExitToday: expect.any(Number),
          overtimeHoursToday: expect.any(Number),
          totalAttendanceRecordsToday: expect.any(Number),
        }),
        analytics: expect.objectContaining({
          attendanceRate: expect.any(Number),
          latenessRate: expect.any(Number),
          absenceRate: expect.any(Number),
          outsideScheduleWorkDays: expect.any(Number),
          outsideScheduleOvertimeHoursThisMonth: expect.any(Number),
          gpsValidatedCheckInCount: expect.any(Number),
          gpsValidatedCheckOutCount: expect.any(Number),
          gpsValidatedAttendanceCount: expect.any(Number),
          insideZoneCheckInCount: expect.any(Number),
          insideZoneCheckOutCount: expect.any(Number),
          insideZoneAttendanceCount: expect.any(Number),
          blockedCheckInCount: null,
          blockedCheckOutCount: null,
          blockedAttendanceAttemptCount: null,
          outsideZoneRejectedAttemptCount: null,
          legacySensitiveCheckInCount: expect.any(Number),
          legacySensitiveCheckOutCount: expect.any(Number),
          legacyHistoricalVerificationCount: expect.any(Number),
          legacyPhotoCheckInCount: expect.any(Number),
          legacyPhotoCheckOutCount: expect.any(Number),
          legacyHistoricalPhotoCount: expect.any(Number),
          earlyExitCount: expect.any(Number),
          overtimeHoursThisMonth: expect.any(Number),
          suspiciousCheckInCount: expect.any(Number),
          suspiciousCheckOutCount: expect.any(Number),
          photoVerificationCount: expect.any(Number),
          checkOutPhotoVerificationCount: expect.any(Number),
          topLateEmployees: expect.any(Array),
          topLegacySecurityEmployees: expect.any(Array),
          topSuspiciousEmployees: expect.any(Array),
          topOvertimeEmployees: expect.any(Array),
          topEarlyExitEmployees: expect.any(Array),
        }),
        recentActivity: expect.any(Array),
      }),
    );

    if (response.body.recentActivity.length > 0) {
      expect(response.body.recentActivity[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          employeeId: expect.any(String),
          employeeIdentifier: expect.any(String),
          employeeName: expect.any(String),
          status: expect.any(String),
          date: expect.any(String),
          minutesLate: expect.any(Number),
        }),
      );
    }

    expectNoPinSecretExposure(response.body);
  });

  it('/api/v1/employees (GET) blocks employee role', async () => {
    const session = await login(
      'ibrahim.coulibaly@konatech.local',
      'KonatechEmployee123!',
    );

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('/api/v1/employees (GET) allows admin role and returns employees', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        employeeIdentifier: expect.stringMatching(/^EMP-\d{4}-\d{3,}$/),
        email: expect.any(String),
        role: expect.any(String),
        accessRole: expect.any(String),
        isActive: expect.any(Boolean),
        pinConfigured: expect.any(Boolean),
      }),
    );
    expectNoPinSecretExposure(response.body);

    const adminEmployee = response.body.find(
      (employee: { email: string }) => employee.email === 'awa.traore@konatech.local',
    );
    const supportEmployee = response.body.find(
      (employee: { email: string }) =>
        employee.email === 'fatoumata.konate@konatech.local',
    );

    officeScheduleId = adminEmployee.schedule.id;
    operationsScheduleId = supportEmployee.schedule.id;
    awaEmployeeId = adminEmployee.id;
  });

  it('/api/v1/schedules (GET) blocks employee role', async () => {
    const session = await login(
      'ibrahim.coulibaly@konatech.local',
      'KonatechEmployee123!',
    );

    await request(app.getHttpServer())
      .get('/api/v1/schedules')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('/api/v1/schedules (GET) allows admin role and returns schedules', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/schedules')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        startTime: expect.any(String),
        endTime: expect.any(String),
        latenessMarginMinutes: expect.any(Number),
        isActive: expect.any(Boolean),
        workDays: expect.any(Array),
        employees: expect.any(Array),
      }),
    );
  });

  it('/api/v1/schedules (POST) validates the schedule window', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        name: 'Broken Window Shift',
        startTime: '18:00',
        endTime: '08:00',
        latenessMarginMinutes: 10,
        isActive: true,
        workDays: ['MONDAY', 'TUESDAY'],
      })
      .expect(400);

    expect(response.body.message).toBe(
      'endTime must be later than startTime for the same schedule day.',
    );
  });

  it('/api/v1/schedules (POST) creates a schedule', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        name: 'Early Warehouse Shift',
        startTime: '07:00',
        endTime: '15:30',
        latenessMarginMinutes: 12,
        isActive: true,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      })
      .expect(201);

    managedScheduleId = response.body.id;

    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Early Warehouse Shift',
        startTime: '07:00',
        endTime: '15:30',
        latenessMarginMinutes: 12,
        isActive: true,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        employees: [],
      }),
    );
  });

  it('/api/v1/schedules/:id (GET) returns one schedule', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get(`/api/v1/schedules/${managedScheduleId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: managedScheduleId,
        name: 'Early Warehouse Shift',
        employees: [],
      }),
    );
  });

  it('/api/v1/schedules/:id (PATCH) updates schedule fields', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/schedules/${managedScheduleId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        name: 'Early Warehouse Shift - Revised',
        startTime: '07:30',
        endTime: '16:00',
        latenessMarginMinutes: 8,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: managedScheduleId,
        name: 'Early Warehouse Shift - Revised',
        startTime: '07:30',
        endTime: '16:00',
        latenessMarginMinutes: 8,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
      }),
    );
  });

  it('/api/v1/schedules/:id/status (PATCH) activates and deactivates a schedule', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    const deactivateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/schedules/${managedScheduleId}/status`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        isActive: false,
      })
      .expect(200);

    expect(deactivateResponse.body.isActive).toBe(false);

    const activateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/schedules/${managedScheduleId}/status`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        isActive: true,
      })
      .expect(200);

    expect(activateResponse.body.isActive).toBe(true);
  });

  it('/api/v1/employees (POST) creates an employee', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        pinCode: '4900',
        firstName: 'Moussa',
        lastName: 'Sissoko',
        email: 'moussa.sissoko@konatech.local',
        role: 'Warehouse Agent',
        accessRole: 'EMPLOYEE',
        password: 'KonatechEmployee123!',
        department: 'Logistics',
        isActive: true,
        scheduleId: officeScheduleId,
      })
      .expect(201);

    managedEmployeeId = response.body.id;

    expect(response.body).toEqual(
      expect.objectContaining({
        employeeIdentifier: expect.stringMatching(/^EMP-\d{4}-\d{3,}$/),
        pinConfigured: true,
        firstName: 'Moussa',
        lastName: 'Sissoko',
        email: 'moussa.sissoko@konatech.local',
        role: 'Warehouse Agent',
        department: 'Logistics',
        accessRole: 'EMPLOYEE',
        isActive: true,
        schedule: expect.objectContaining({
          id: officeScheduleId,
        }),
      }),
    );
    expect(response.body.pinCode).toBeUndefined();
    expectNoPinSecretExposure(response.body);

    const storedEmployee = await prisma.employee.findUniqueOrThrow({
      where: {
        id: managedEmployeeId,
      },
      select: {
        pinCode: true,
        pinCodeHash: true,
      },
    });

    expect(storedEmployee.pinCode).toBeNull();
    expect(storedEmployee.pinCodeHash).toEqual(expect.any(String));
    expect(
      await verifyPinCode('4900', storedEmployee.pinCodeHash as string),
    ).toBe(true);
  });

  it('/api/v1/employees (POST) blocks duplicate PIN values', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        pinCode: '4900',
        firstName: 'Mariam',
        lastName: 'Doumbia',
        email: 'mariam.doumbia@konatech.local',
        role: 'Support Agent',
        accessRole: 'EMPLOYEE',
        password: 'KonatechEmployee123!',
        department: 'Support',
        isActive: true,
        scheduleId: officeScheduleId,
      })
      .expect(409);

    expect(response.body.message).toBe('Ce code PIN est deja utilise.');
  });

  it('/api/v1/employees (POST) rejects weak employee PIN values', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        pinCode: '1234',
        firstName: 'Assetou',
        lastName: 'Camara',
        email: 'assetou.camara@konatech.local',
        role: 'Support Agent',
        accessRole: 'EMPLOYEE',
        password: 'KonatechEmployee123!',
        department: 'Support',
        isActive: true,
        scheduleId: officeScheduleId,
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining(['Code PIN invalide.']),
    );
  });

  it('/api/v1/employees/:id (GET) returns one employee', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get(`/api/v1/employees/${managedEmployeeId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: managedEmployeeId,
        employeeIdentifier: expect.stringMatching(/^EMP-\d{4}-\d{3,}$/),
        email: 'moussa.sissoko@konatech.local',
        pinConfigured: true,
        schedule: expect.objectContaining({
          id: officeScheduleId,
        }),
      }),
    );
    expectNoPinSecretExposure(response.body);
  });

  it('/api/v1/employees/:id (PATCH) updates core employee fields', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        firstName: 'Moussa Ali',
        role: 'Warehouse Coordinator',
        department: 'Operations Support',
        scheduleId: operationsScheduleId,
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: managedEmployeeId,
        firstName: 'Moussa Ali',
        role: 'Warehouse Coordinator',
        department: 'Operations Support',
        pinConfigured: true,
        schedule: expect.objectContaining({
          id: operationsScheduleId,
        }),
      }),
    );
    expectNoPinSecretExposure(response.body);

    const storedEmployee = await prisma.employee.findUniqueOrThrow({
      where: {
        id: managedEmployeeId,
      },
      select: {
        pinCode: true,
        pinCodeHash: true,
      },
    });

    expect(storedEmployee.pinCode).toBeNull();
    expect(storedEmployee.pinCodeHash).toEqual(expect.any(String));
    expect(
      await verifyPinCode('4900', storedEmployee.pinCodeHash as string),
    ).toBe(true);
  });

  it('/api/v1/employees/:id/status (PATCH) activates and deactivates an employee account', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    const deactivateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/status`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        isActive: false,
      })
      .expect(200);

    expect(deactivateResponse.body.isActive).toBe(false);
    expect(deactivateResponse.body.pinConfigured).toBe(true);
    expectNoPinSecretExposure(deactivateResponse.body);

    const activateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/status`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        isActive: true,
      })
      .expect(200);

    expect(activateResponse.body.isActive).toBe(true);
    expect(activateResponse.body.pinConfigured).toBe(true);
    expectNoPinSecretExposure(activateResponse.body);
  });

  it('/api/v1/employees/:id/role (PATCH) assigns a role', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/role`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        role: 'Regional Coordinator',
      })
      .expect(200);

    expect(response.body.role).toBe('Regional Coordinator');
  });

  it('/api/v1/employees/:id/department (PATCH) assigns a department', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/department`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        department: 'Regional Ops',
      })
      .expect(200);

    expect(response.body.department).toBe('Regional Ops');
  });

  it('/api/v1/employees/:id/schedule (PATCH) assigns and clears a schedule', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    const assignResponse = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/schedule`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        scheduleId: officeScheduleId,
      })
      .expect(200);

    expect(assignResponse.body.schedule.id).toBe(officeScheduleId);

    const clearResponse = await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/schedule`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        scheduleId: null,
      })
      .expect(200);

    expect(clearResponse.body.schedule).toBeNull();
  });

  it('/api/v1/attendance/me/today (GET) blocks admin self access', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('/api/v1/attendance/entry (GET) redirects to the fixed frontend attendance entry page', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/entry')
      .expect(302);

    expect(response.headers.location).toBe(
      'http://localhost:3000/attendance-entry',
    );
  });

  it('/api/v1/attendance/me/today (GET) allows employee self access', async () => {
    const session = await login(
      'ibrahim.coulibaly@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        date: expect.any(String),
        expectedToday: expect.any(Boolean),
        canCheckIn: expect.any(Boolean),
        canCheckOut: expect.any(Boolean),
        securityPolicy: expect.objectContaining({
          enabled: false,
          locationConfigured: true,
          trustedRadiusMeters: null,
          warningRadiusMeters: null,
          allowedRadiusMeters: null,
          companyLatitude: null,
          companyLongitude: null,
        }),
        employee: expect.objectContaining({
          employeeIdentifier: expect.stringMatching(/^EMP-\d{4}-\d{3,}$/),
          email: 'ibrahim.coulibaly@konatech.local',
          accessRole: 'EMPLOYEE',
        }),
      }),
    );
    expect(response.body.attendance?.employee?.pinCode).toBeUndefined();
    expect(response.body.attendance?.employee?.pinCodeHash).toBeUndefined();
    expectNoPinSecretExposure(response.body);
  });

  it('/api/v1/attendance/me/today (GET) returns enabled smart security policy when configured', async () => {
    const restoreEnv = enableAttendanceSecurityForTest({
      ATTENDANCE_TRUSTED_RADIUS_METERS: '10',
      ATTENDANCE_WARNING_RADIUS_METERS: '20',
      ATTENDANCE_ALLOWED_RADIUS_METERS: '10',
    });

    try {
      const session = await login(
        'ibrahim.coulibaly@konatech.local',
        'KonatechEmployee123!',
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/attendance/me/today')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body.securityPolicy).toEqual({
        enabled: true,
        locationConfigured: true,
        trustedRadiusMeters: 10,
        warningRadiusMeters: 20,
        allowedRadiusMeters: 10,
        maxAccuracyMeters: 200,
        companyLatitude: 5.359952,
        companyLongitude: -4.008256,
      });
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/security-policy (GET) returns enabled smart security policy when configured', async () => {
    const restoreEnv = enableAttendanceSecurityForTest({
      ATTENDANCE_TRUSTED_RADIUS_METERS: '10',
      ATTENDANCE_WARNING_RADIUS_METERS: '20',
      ATTENDANCE_ALLOWED_RADIUS_METERS: '10',
    });

    try {
      const session = await login(
        'ibrahim.coulibaly@konatech.local',
        'KonatechEmployee123!',
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/attendance/me/security-policy')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        enabled: true,
        locationConfigured: true,
        trustedRadiusMeters: 10,
        warningRadiusMeters: 20,
        allowedRadiusMeters: 10,
        maxAccuracyMeters: 200,
        companyLatitude: 5.359952,
        companyLongitude: -4.008256,
      });
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-out (POST) rejects checkout before checkin', async () => {
    const session = await login(
      'aminata.keita@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-13T17:00:00.000Z',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'Cannot check out before a check-in has been recorded.',
    );
  });

  it('/api/v1/attendance/me/check-in (POST) records an incomplete attendance', async () => {
    const session = await login(
      'aminata.keita@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-14T08:00:00.000Z',
        notes: 'Opened finance follow-up.',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        employeeId: expect.any(String),
        clockInAt: '2026-04-14T08:00:00.000Z',
        clockOutAt: null,
        status: 'INCOMPLETE',
        minutesLate: 0,
        notes: 'Opened finance follow-up.',
      }),
    );
  });

  it('/api/v1/attendance/me/check-in (POST) rejects duplicate consecutive check-ins', async () => {
    const session = await login(
      'aminata.keita@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-14T08:05:00.000Z',
      })
      .expect(409);

    expect(response.body.message).toBe(
      'A check-in has already been recorded for this attendance day.',
    );
  });

  it('/api/v1/attendance/me/check-out (POST) completes an attendance record', async () => {
    const session = await login(
      'aminata.keita@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-14T17:10:00.000Z',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        clockInAt: '2026-04-14T08:00:00.000Z',
        clockOutAt: '2026-04-14T17:10:00.000Z',
        status: 'PRESENT',
        minutesLate: 0,
      }),
    );
  });

  it('/api/v1/attendance/me/check-out (POST) rejects duplicate consecutive check-outs', async () => {
    const session = await login(
      'aminata.keita@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-14T17:15:00.000Z',
      })
      .expect(409);

    expect(response.body.message).toBe(
      'A check-out has already been recorded for this attendance day.',
    );
  });

  it('/api/v1/attendance/me/check-in (POST) computes lateness from the assigned schedule', async () => {
    const session = await login(
      'ibrahim.coulibaly@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-18T09:19:00.000Z',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'LATE',
        minutesLate: 9,
        clockOutAt: null,
        scheduledExitTime: '2026-04-18T18:00:00.000Z',
        earlyExit: false,
        earlyExitMinutes: 0,
        lateExit: false,
        overtimeHours: 0,
        overtimeMinutes: 0,
        absenceCount: expect.any(Number),
      }),
    );
  });

  it('/api/v1/attendance/me/check-out (POST) blocks checkout when GPS is unavailable', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const session = await login(
        'ibrahim.coulibaly@konatech.local',
        'KonatechEmployee123!',
      );

      const rejectedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-out')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-18T17:00:00.000Z',
        })
        .expect(400);

      expect(rejectedResponse.body.message).toBe(
        'La geolocalisation est obligatoire pour pointer.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-out (POST) calculates overtime after scheduled exit', async () => {
    const session = await login(
      'fatoumata.konate@konatech.local',
      'KonatechEmployee123!',
    );

    const checkInResponse = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-21T09:00:00.000Z',
      })
      .expect(201);

    expect(checkInResponse.body).toEqual(
      expect.objectContaining({
        clockInAt: '2026-04-21T09:00:00.000Z',
        scheduledExitTime: '2026-04-21T18:00:00.000Z',
        absenceCount: expect.any(Number),
      }),
    );

    const checkOutResponse = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-21T19:30:00.000Z',
      })
      .expect(201);

    expect(checkOutResponse.body).toEqual(
      expect.objectContaining({
        clockOutAt: '2026-04-21T19:30:00.000Z',
        outsideScheduleWork: false,
        scheduledExitTime: '2026-04-21T18:00:00.000Z',
        earlyExit: false,
        earlyExitMinutes: 0,
        lateExit: true,
        overtimeHours: 1.5,
        overtimeMinutes: 90,
        absenceCount: expect.any(Number),
      }),
    );
  });

  it('/api/v1/attendance/me/check-in (POST) keeps outside scheduled workdays allowed while GPS remains mandatory', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const adminSession = await login(
        'awa.traore@konatech.local',
        'KonatechAdmin123!',
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/employees/${managedEmployeeId}/schedule`)
        .set('Authorization', `Bearer ${adminSession.accessToken}`)
        .send({
          scheduleId: officeScheduleId,
        })
        .expect(200);

      const session = await login(
        'moussa.sissoko@konatech.local',
        'KonatechEmployee123!',
      );

      const rejectedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-19T09:00:00.000Z',
        })
        .expect(400);

      expect(rejectedResponse.body.message).toBe(
        'La geolocalisation est obligatoire pour pointer.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-out (POST) converts outside scheduled workdays into overtime only', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const adminSession = await login(
        'awa.traore@konatech.local',
        'KonatechAdmin123!',
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/employees/${managedEmployeeId}/schedule`)
        .set('Authorization', `Bearer ${adminSession.accessToken}`)
        .send({
          scheduleId: officeScheduleId,
        })
        .expect(200);

      const session = await login(
        'moussa.sissoko@konatech.local',
        'KonatechEmployee123!',
      );

      const checkInResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-18T09:00:00.000Z',
          security: {
            latitude: 5.36005,
            longitude: -4.0082,
            accuracyMeters: 8,
          },
        })
        .expect(201);

      expect(checkInResponse.body).toEqual(
        expect.objectContaining({
          clockInAt: '2026-04-18T09:00:00.000Z',
          outsideScheduleWork: false,
          scheduledExitTime: null,
          minutesLate: 0,
          status: 'INCOMPLETE',
          checkInVerificationMethod: 'GPS',
          checkInVerificationLevel: 'OK',
          checkInVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        }),
      );

      const checkOutResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-out')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-18T14:00:00.000Z',
          security: {
            latitude: 5.36005,
            longitude: -4.0082,
            accuracyMeters: 9,
          },
        })
        .expect(201);

      expect(checkOutResponse.body).toEqual(
        expect.objectContaining({
          clockOutAt: '2026-04-18T14:00:00.000Z',
          outsideScheduleWork: true,
          scheduledExitTime: null,
          earlyExit: false,
          earlyExitMinutes: 0,
          lateExit: false,
          overtimeHours: 5,
          overtimeMinutes: 300,
          minutesLate: 0,
          status: 'PRESENT',
          checkOutVerificationMethod: 'GPS',
          checkOutVerificationLevel: 'OK',
          checkOutVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        }),
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-out (POST) marks checkout before scheduled exit as early departure', async () => {
    const session = await login(
      'fatoumata.konate@konatech.local',
      'KonatechEmployee123!',
    );

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-25T09:00:00.000Z',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-25T17:30:00.000Z',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        clockOutAt: '2026-04-25T17:30:00.000Z',
        outsideScheduleWork: false,
        scheduledExitTime: '2026-04-25T18:00:00.000Z',
        earlyExit: true,
        earlyExitMinutes: 30,
        lateExit: false,
        overtimeHours: 0,
        overtimeMinutes: 0,
      }),
    );
  });

  it('/api/v1/attendance/me/check-out (POST) keeps exact scheduled exit as normal checkout', async () => {
    const session = await login(
      'fatoumata.konate@konatech.local',
      'KonatechEmployee123!',
    );

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-26T09:00:00.000Z',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-26T18:00:00.000Z',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        clockOutAt: '2026-04-26T18:00:00.000Z',
        outsideScheduleWork: false,
        scheduledExitTime: '2026-04-26T18:00:00.000Z',
        earlyExit: false,
        earlyExitMinutes: 0,
        lateExit: false,
        overtimeHours: 0,
        overtimeMinutes: 0,
      }),
    );
  });

  it('/api/v1/attendance/me/check-in (POST) stores GPS metadata when inside the allowed radius', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const session = await login(
        'fatoumata.konate@konatech.local',
        'KonatechEmployee123!',
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-24T09:00:00.000Z',
          security: {
            latitude: 5.36005,
            longitude: -4.0082,
            accuracyMeters: 9,
          },
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          clockInAt: '2026-04-24T09:00:00.000Z',
          checkInLatitude: 5.36005,
          checkInLongitude: -4.0082,
          checkInAccuracyMeters: 9,
          checkInVerificationMethod: 'GPS',
          checkInVerificationLevel: 'OK',
          checkInVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        }),
      );
      expect(response.body.checkInDistanceMeters).toBeLessThanOrEqual(100);

      const checkOutResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-out')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-24T17:00:00.000Z',
          security: {
            latitude: 5.36005,
            longitude: -4.0082,
            accuracyMeters: 10,
          },
        })
        .expect(201);

      expect(checkOutResponse.body).toEqual(
        expect.objectContaining({
          clockOutAt: '2026-04-24T17:00:00.000Z',
          scheduledExitTime: '2026-04-24T18:00:00.000Z',
          earlyExit: true,
          earlyExitMinutes: 60,
          overtimeHours: 0,
          overtimeMinutes: 0,
          checkOutLatitude: 5.36005,
          checkOutLongitude: -4.0082,
          checkOutAccuracyMeters: 10,
          checkOutVerificationMethod: 'GPS',
          checkOutVerificationLevel: 'OK',
          checkOutVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        }),
      );
      expect(checkOutResponse.body.checkOutDistanceMeters).toBeLessThanOrEqual(
        100,
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-in (POST) uses ATTENDANCE_ALLOWED_RADIUS_METERS as the blocking GPS radius when no warning radius is configured', async () => {
    const restoreEnv = enableAttendanceSecurityForTest({
      ATTENDANCE_TRUSTED_RADIUS_METERS: null,
      ATTENDANCE_WARNING_RADIUS_METERS: null,
      ATTENDANCE_ALLOWED_RADIUS_METERS: '10',
    });

    try {
      const session = await login(
        'fatoumata.konate@konatech.local',
        'KonatechEmployee123!',
      );

      const acceptedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-27T09:00:00.000Z',
          security: {
            latitude: 5.359952,
            longitude: -4.008256,
            accuracyMeters: 4,
          },
        })
        .expect(201);

      expect(acceptedResponse.body).toEqual(
        expect.objectContaining({
          checkInVerificationMethod: 'GPS',
          checkInVerificationLevel: 'OK',
          checkInVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        }),
      );
      expect(acceptedResponse.body.checkInDistanceMeters).toBe(0);

      const rejectedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-28T09:00:00.000Z',
          security: {
            latitude: 5.3602,
            longitude: -4.008256,
            accuracyMeters: 8,
          },
        })
        .expect(400);

      expect(rejectedResponse.body.message).toBe(
        'Vous devez etre dans la zone autorisee pour pointer.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-out (POST) blocks checkout outside the allowed radius', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const session = await login(
        'fatoumata.konate@konatech.local',
        'KonatechEmployee123!',
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-23T09:00:00.000Z',
          security: {
            latitude: 5.36005,
            longitude: -4.0082,
            accuracyMeters: 9,
          },
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          clockInAt: '2026-04-23T09:00:00.000Z',
          checkInVerificationMethod: 'GPS',
          checkInVerificationLevel: 'OK',
          checkInVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        }),
      );
      expect(response.body.checkInDistanceMeters).toBeLessThanOrEqual(100);

      const rejectedCheckOutResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-out')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-23T17:00:00.000Z',
          security: {
            latitude: 5.5,
            longitude: -4.3,
            accuracyMeters: 14,
          },
        })
        .expect(400);

      expect(rejectedCheckOutResponse.body.message).toBe(
        'Vous devez etre dans la zone autorisee pour pointer.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-in (POST) blocks low-accuracy GPS coordinates even inside the allowed radius', async () => {
    const restoreEnv = enableAttendanceSecurityForTest({
      ATTENDANCE_MAX_ACCURACY_METERS: '30',
    });

    try {
      const session = await login(
        'fatoumata.konate@konatech.local',
        'KonatechEmployee123!',
      );

      const rejectedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-05-05T09:00:00.000Z',
          security: {
            latitude: 5.359952,
            longitude: -4.008256,
            accuracyMeters: 120,
          },
        })
        .expect(400);

      expect(rejectedResponse.body.message).toBe(
        'La precision GPS est insuffisante pour valider ce pointage.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-in (POST) blocks check-in when GPS is unavailable', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const session = await login(
        'fatoumata.konate@konatech.local',
        'KonatechEmployee123!',
      );

      const rejectedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-22T09:00:00.000Z',
        })
        .expect(400);

      expect(rejectedResponse.body.message).toBe(
        'La geolocalisation est obligatoire pour pointer.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/check-in (POST) blocks check-in outside the allowed radius', async () => {
    const restoreEnv = enableAttendanceSecurityForTest();

    try {
      const session = await login(
        'fatoumata.konate@konatech.local',
        'KonatechEmployee123!',
      );

      const rejectedResponse = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          occurredAt: '2026-04-22T09:00:00.000Z',
          security: {
            latitude: 5.5,
            longitude: -4.3,
            accuracyMeters: 15,
          },
        })
        .expect(400);

      expect(rejectedResponse.body.message).toBe(
        'Vous devez etre dans la zone autorisee pour pointer.',
      );
    } finally {
      restoreEnv();
    }
  });

  it('/api/v1/attendance/me/history (GET) returns the employee personal history', async () => {
    const session = await login(
      'aminata.keita@konatech.local',
      'KonatechEmployee123!',
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/me/history?month=2026-04')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '2026-04-14T00:00:00.000Z',
          status: 'PRESENT',
          clockInAt: '2026-04-14T08:00:00.000Z',
          clockOutAt: '2026-04-14T17:10:00.000Z',
        }),
      ]),
    );
  });

  it('/api/v1/attendance/me/history (GET) groups check-ins by UTC attendance month boundaries', async () => {
    const session = await login(
      'fatoumata.konate@konatech.local',
      'KonatechEmployee123!',
    );

    const checkInResponse = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({
        occurredAt: '2026-04-30T23:30:00.000Z',
      })
      .expect(201);

    expect(checkInResponse.body.date).toBe('2026-04-30T00:00:00.000Z');

    const aprilHistory = await request(app.getHttpServer())
      .get('/api/v1/attendance/me/history?month=2026-04')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const mayHistory = await request(app.getHttpServer())
      .get('/api/v1/attendance/me/history?month=2026-05')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(
      aprilHistory.body.some(
        (attendance: { date: string }) =>
          attendance.date === '2026-04-30T00:00:00.000Z',
      ),
    ).toBe(true);
    expect(
      mayHistory.body.some(
        (attendance: { date: string }) =>
          attendance.date === '2026-04-30T00:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('/api/v1/attendance/me/check-in (POST) stores the assigned schedule snapshot', async () => {
    const adminSession = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/employees/${managedEmployeeId}/schedule`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({
        scheduleId: officeScheduleId,
      })
      .expect(200);

    const employeeSession = await login(
      'moussa.sissoko@konatech.local',
      'KonatechEmployee123!',
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${employeeSession.accessToken}`)
      .send({
        occurredAt: '2026-04-29T08:05:00.000Z',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        scheduleIdSnapshot: officeScheduleId,
        scheduleNameSnapshot: 'Office Day Shift',
        scheduleStartTimeSnapshot: '08:00',
        scheduleEndTimeSnapshot: '17:00',
        scheduleWorkDaysSnapshot: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
        ],
        scheduleLatenessMarginSnapshot: 5,
      }),
    );

    const storedAttendance = await prisma.attendance.findUniqueOrThrow({
      where: {
        employeeId_date: {
          employeeId: managedEmployeeId,
          date: new Date('2026-04-29T00:00:00.000Z'),
        },
      },
      select: {
        scheduleIdSnapshot: true,
        scheduleNameSnapshot: true,
        scheduleStartTimeSnapshot: true,
        scheduleEndTimeSnapshot: true,
        scheduleWorkDaysSnapshot: true,
        scheduleLatenessMarginSnapshot: true,
        scheduleCapturedAt: true,
      },
    });

    expect(storedAttendance).toEqual(
      expect.objectContaining({
        scheduleIdSnapshot: officeScheduleId,
        scheduleNameSnapshot: 'Office Day Shift',
        scheduleStartTimeSnapshot: '08:00',
        scheduleEndTimeSnapshot: '17:00',
        scheduleWorkDaysSnapshot: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
        ],
        scheduleLatenessMarginSnapshot: 5,
        scheduleCapturedAt: new Date('2026-04-29T08:05:00.000Z'),
      }),
    );
  });

  it('schedule changes after check-in do not affect snapshot-based checkout, recalculation, CSV, or PDF labels', async () => {
    const adminSession = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/schedules/${officeScheduleId}`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({
        startTime: '09:00',
        endTime: '18:00',
        latenessMarginMinutes: 10,
      })
      .expect(200);

    const storedBeforeCheckOut = await prisma.attendance.findUniqueOrThrow({
      where: {
        employeeId_date: {
          employeeId: managedEmployeeId,
          date: new Date('2026-04-29T00:00:00.000Z'),
        },
      },
      select: {
        scheduleNameSnapshot: true,
        scheduleStartTimeSnapshot: true,
        scheduleEndTimeSnapshot: true,
        scheduleLatenessMarginSnapshot: true,
      },
    });

    expect(storedBeforeCheckOut).toEqual({
      scheduleNameSnapshot: 'Office Day Shift',
      scheduleStartTimeSnapshot: '08:00',
      scheduleEndTimeSnapshot: '17:00',
      scheduleLatenessMarginSnapshot: 5,
    });

    const employeeSession = await login(
      'moussa.sissoko@konatech.local',
      'KonatechEmployee123!',
    );
    const checkOutResponse = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-out')
      .set('Authorization', `Bearer ${employeeSession.accessToken}`)
      .send({
        occurredAt: '2026-04-29T17:30:00.000Z',
      })
      .expect(201);

    expect(checkOutResponse.body).toEqual(
      expect.objectContaining({
        scheduledExitTime: '2026-04-29T17:00:00.000Z',
        earlyExit: false,
        earlyExitMinutes: 0,
        lateExit: true,
        overtimeHours: 0.5,
        overtimeMinutes: 30,
      }),
    );

    const exportService = app.get(MonthlyAttendanceExportService);
    const csvExporter = app.get(MonthlyAttendanceCsvExporterService);
    const pdfRenderer = app.get(MonthlyAttendancePuppeteerPdfRendererService);
    const report = await exportService.buildMonthlyReport({
      month: 4,
      year: 2026,
      employeeId: managedEmployeeId,
    });

    expect(report.employeeReport?.assignedScheduleLabel).toContain(
      '08:00 - 17:00',
    );
    expect(report.employeeReport?.scheduledOvertimeHours).toBe('0,50 h');
    expect(report.employeeReport?.overtimeHours).toBe('5,50 h');

    const recalculatedAttendance = await prisma.attendance.findUniqueOrThrow({
      where: {
        employeeId_date: {
          employeeId: managedEmployeeId,
          date: new Date('2026-04-29T00:00:00.000Z'),
        },
      },
      select: {
        scheduledExitTime: true,
        overtimeHours: true,
        overtimeMinutes: true,
        earlyExit: true,
        earlyExitMinutes: true,
        lateExit: true,
      },
    });

    expect(recalculatedAttendance).toEqual({
      scheduledExitTime: new Date('2026-04-29T17:00:00.000Z'),
      overtimeHours: 0.5,
      overtimeMinutes: 30,
      earlyExit: false,
      earlyExitMinutes: 0,
      lateExit: true,
    });

    const csvFile = csvExporter.export(report);
    const csvContent =
      typeof csvFile.content === 'string'
        ? csvFile.content
        : csvFile.content.toString('utf8');

    expect(csvContent).toContain('Office Day Shift (08:00-17:00');

    const pdfHtml = (
      pdfRenderer as unknown as {
        buildDocument: (value: typeof report) => string;
      }
    ).buildDocument(report);

    expect(pdfHtml).toContain('08:00 - 17:00');
  });

  it('legacy attendances without snapshots still fall back to the current schedule', async () => {
    await prisma.attendance.create({
      data: {
        employeeId: managedEmployeeId,
        date: new Date('2026-05-01T00:00:00.000Z'),
        clockInAt: new Date('2026-05-01T09:00:00.000Z'),
        status: AttendanceStatus.INCOMPLETE,
        minutesLate: 0,
      },
    });

    const employeeSession = await login(
      'moussa.sissoko@konatech.local',
      'KonatechEmployee123!',
    );
    const response = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-out')
        .set('Authorization', `Bearer ${employeeSession.accessToken}`)
        .send({
        occurredAt: '2026-05-01T18:00:00.000Z',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        scheduleNameSnapshot: null,
        scheduleStartTimeSnapshot: null,
        scheduleEndTimeSnapshot: null,
        scheduledExitTime: '2026-05-01T18:00:00.000Z',
        earlyExit: false,
        lateExit: false,
        overtimeHours: 0,
        overtimeMinutes: 0,
      }),
    );
  });

  it('/api/v1/attendance/exports/monthly (GET) blocks employee role', async () => {
    const session = await login(
      'ibrahim.coulibaly@konatech.local',
      'KonatechEmployee123!',
    );

    await request(app.getHttpServer())
      .get('/api/v1/attendance/exports/monthly?month=4&year=2026')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
  });

  it('/api/v1/attendance/exports/monthly (GET) validates month and year', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/exports/monthly?month=13&year=1999')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'month must not be greater than 12',
        'year must not be less than 2000',
      ]),
    );
  });

  it('monthly recalculation preserves outside-schedule overtime and exports explicit labels', async () => {
    const exportService = app.get(MonthlyAttendanceExportService);
    const csvExporter = app.get(MonthlyAttendanceCsvExporterService);
    const report = await exportService.buildMonthlyReport({
      month: 4,
      year: 2026,
      employeeId: managedEmployeeId,
    });

    const weekendAttendance = await prisma.attendance.findUniqueOrThrow({
      where: {
        employeeId_date: {
          employeeId: managedEmployeeId,
          date: new Date('2026-04-18T00:00:00.000Z'),
        },
      },
      select: {
        outsideScheduleWork: true,
        overtimeMinutes: true,
        overtimeHours: true,
        earlyExit: true,
        earlyExitMinutes: true,
        lateExit: true,
        minutesLate: true,
        status: true,
      },
    });

    expect(weekendAttendance).toEqual({
      outsideScheduleWork: true,
      overtimeMinutes: 300,
      overtimeHours: 5,
      earlyExit: false,
      earlyExitMinutes: 0,
      lateExit: false,
      minutesLate: 0,
      status: 'PRESENT',
    });
    expect(report.employeeReport).toEqual(
      expect.objectContaining({
        presenceDays: 1,
        outsideScheduleWorkDays: 1,
        scheduledOvertimeHours: '0,50 h',
        outsideScheduleOvertimeHours: '5,00 h',
        overtimeHours: '5,50 h',
      }),
    );
    expect(report.employeeReport?.assignedScheduleLabel).toContain(
      '08:00 - 17:00',
    );

    const csvFile = csvExporter.export(report);
    const csvContent =
      typeof csvFile.content === 'string'
        ? csvFile.content
        : csvFile.content.toString('utf8');

    expect(csvContent).toContain('Outside Schedule Work Days');
    expect(csvContent).toContain('Scheduled Overtime Hours');
    expect(csvContent).toContain('Outside Schedule Overtime Hours');
  });

  it('monthly exports are strictly read-only and do not mutate attendance history', async () => {
    const exportService = app.get(MonthlyAttendanceExportService);
    const monthRangeStart = new Date('2026-04-01T00:00:00.000Z');
    const monthRangeEnd = new Date('2026-05-01T00:00:00.000Z');
    const before = await prisma.attendance.findMany({
      where: {
        date: {
          gte: monthRangeStart,
          lt: monthRangeEnd,
        },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
      select: {
        id: true,
        employeeId: true,
        date: true,
        status: true,
        clockInAt: true,
        clockOutAt: true,
        outsideScheduleWork: true,
        earlyExit: true,
        earlyExitMinutes: true,
        lateExit: true,
        overtimeHours: true,
        overtimeMinutes: true,
        absenceCount: true,
        scheduledExitTime: true,
        updatedAt: true,
      },
    });

    await exportService.buildMonthlyReport({
      month: 4,
      year: 2026,
    });

    const after = await prisma.attendance.findMany({
      where: {
        date: {
          gte: monthRangeStart,
          lt: monthRangeEnd,
        },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
      select: {
        id: true,
        employeeId: true,
        date: true,
        status: true,
        clockInAt: true,
        clockOutAt: true,
        outsideScheduleWork: true,
        earlyExit: true,
        earlyExitMinutes: true,
        lateExit: true,
        overtimeHours: true,
        overtimeMinutes: true,
        absenceCount: true,
        scheduledExitTime: true,
        updatedAt: true,
      },
    });

    expect(after).toEqual(before);
  });

  it('dashboard presence rate excludes outside-schedule workdays and tracks them separately', async () => {
    const dashboardService = app.get(DashboardService);
    const overview = await dashboardService.getOverview(
      new Date('2026-04-18T12:00:00.000Z'),
    );

    expect(overview.summary.presentToday).toBe(2);
    expect(overview.analytics.attendanceRate).toBe(50);
    expect(overview.analytics.absenceRate).toBe(50);
    expect(overview.analytics.outsideScheduleWorkDays).toBeGreaterThanOrEqual(1);
    expect(overview.analytics.outsideScheduleOvertimeHoursThisMonth).toBeGreaterThanOrEqual(5);
  });

  it('/api/v1/attendance/exports/monthly (GET) returns a CSV export for admin', async () => {
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/exports/monthly?month=4&year=2026')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toContain(
      'attendance-export-2026-04.csv',
    );
    expect(response.text).toContain(
      'Full Name,Employee Identifier,Department,Assigned Schedule,Working Days,Scheduled Presence Days,Total Worked Days,Outside Schedule Work Days,Entries,Exits,Late Days,Absent Days,Absence Count,Incomplete Attendance Days,Total Worked Hours,Depart anticipe (jours),Depart anticipe (min),Scheduled Overtime Hours,Outside Schedule Overtime Hours,Heures supplementaires',
    );
    expect(response.text).toContain(
      'Aminata Keita,EMP-2026-005,Finance,No schedule assigned,',
    );
    expectNoKnownPinValues(response.text);
  });

  it('/api/v1/attendance/exports/monthly (GET) returns a PDF export for admin', async () => {
    const exportService = app.get(MonthlyAttendanceExportService);
    const pdfRenderer = app.get(MonthlyAttendancePuppeteerPdfRendererService);
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/exports/monthly?month=4&year=2026&format=pdf')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain(
      'rapport-presence-equipe-avril-2026.pdf',
    );
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(response.body.length).toBeGreaterThan(2_000);
    const report = await exportService.buildMonthlyReport({
      month: 4,
      year: 2026,
    });
    const pdfHtml = (
      pdfRenderer as unknown as {
        buildDocument: (value: typeof report) => string;
      }
    ).buildDocument(report);

    expectNoKnownPinValues(pdfHtml);
    expectNoKnownPinValues(JSON.stringify(report));
  });

  it('/api/v1/attendance/exports/monthly (GET) returns a detailed French PDF for one employee', async () => {
    const exportService = app.get(MonthlyAttendanceExportService);
    const pdfRenderer = app.get(MonthlyAttendancePuppeteerPdfRendererService);
    const session = await login(
      'awa.traore@konatech.local',
      'KonatechAdmin123!',
    );
    const employeesResponse = await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const employee = employeesResponse.body.find(
      (item: { email: string }) => item.email === 'awa.traore@konatech.local',
    );

    expect(employee).toBeDefined();

    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/attendance/exports/monthly?month=4&year=2026&format=pdf&employeeId=${employee.id}`,
      )
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain(
      'rapport-presence-awa-traore-avril-2026.pdf',
    );
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(response.body.length).toBeGreaterThan(2_000);
    const report = await exportService.buildMonthlyReport({
      month: 4,
      year: 2026,
      employeeId: employee.id,
    });
    const pdfHtml = (
      pdfRenderer as unknown as {
        buildDocument: (value: typeof report) => string;
      }
    ).buildDocument(report);

    expectNoKnownPinValues(pdfHtml);
    expectNoKnownPinValues(JSON.stringify(report));
  });
});
