import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('CalendarController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  async function loginAdmin() {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'awa.traore@konatech.local',
        password: 'KonatechAdmin123!',
      })
      .expect(201);

    return response.body.accessToken as string;
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

  it('creates, lists, updates, classifies, and deletes calendar holidays', async () => {
    const token = await loginAdmin();
    const publicHolidayDate = '2026-04-14T00:00:00.000Z';
    const companyHolidayDate = '2026-04-15T00:00:00.000Z';

    const publicHoliday = await request(app.getHttpServer())
      .post('/api/v1/calendar/holidays')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tabaski',
        date: publicHolidayDate,
        description: 'Jour ferie public RH.',
        type: 'PUBLIC_HOLIDAY',
      })
      .expect(201);

    expect(publicHoliday.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Tabaski',
        date: publicHolidayDate,
        type: 'PUBLIC_HOLIDAY',
        isActive: true,
      }),
    );

    const companyHoliday = await request(app.getHttpServer())
      .post('/api/v1/calendar/holidays')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Jour Konatech',
        date: companyHolidayDate,
        description: 'Fermeture interne.',
        type: 'COMPANY_HOLIDAY',
      })
      .expect(201);

    expect(companyHoliday.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Jour Konatech',
        date: companyHolidayDate,
        type: 'COMPANY_HOLIDAY',
        isActive: true,
      }),
    );

    const updatedHoliday = await request(app.getHttpServer())
      .patch(`/api/v1/calendar/holidays/${publicHoliday.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tabaski 2026',
        description: 'Jour ferie public actualise.',
      })
      .expect(200);

    expect(updatedHoliday.body).toEqual(
      expect.objectContaining({
        id: publicHoliday.body.id,
        name: 'Tabaski 2026',
        type: 'PUBLIC_HOLIDAY',
      }),
    );

    const monthResponse = await request(app.getHttpServer())
      .get('/api/v1/calendar/month?month=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(monthResponse.body).toEqual(
      expect.objectContaining({
        month: '2026-04',
        monthLabel: expect.any(String),
        summary: expect.objectContaining({
          workingDays: expect.any(Number),
          weekends: expect.any(Number),
          publicHolidays: 1,
          companyHolidays: 1,
        }),
        days: expect.any(Array),
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: publicHoliday.body.id,
            type: 'PUBLIC_HOLIDAY',
            employeeId: null,
          }),
          expect.objectContaining({
            id: companyHoliday.body.id,
            type: 'COMPANY_HOLIDAY',
            employeeId: null,
          }),
        ]),
      }),
    );

    const publicHolidayDay = monthResponse.body.days.find(
      (day: { date: string }) => day.date === publicHolidayDate,
    );
    const companyHolidayDay = monthResponse.body.days.find(
      (day: { date: string }) => day.date === companyHolidayDate,
    );
    const weekendDay = monthResponse.body.days.find(
      (day: { date: string }) => day.date === '2026-04-04T00:00:00.000Z',
    );

    expect(publicHolidayDay).toEqual(
      expect.objectContaining({
        type: 'PUBLIC_HOLIDAY',
        isNonWorkingDay: true,
        label: 'Tabaski 2026',
      }),
    );
    expect(companyHolidayDay).toEqual(
      expect.objectContaining({
        type: 'COMPANY_HOLIDAY',
        isNonWorkingDay: true,
        label: 'Jour Konatech',
      }),
    );
    expect(weekendDay).toEqual(
      expect.objectContaining({
        type: 'WEEKEND',
        isNonWorkingDay: true,
      }),
    );

    const holidayList = await request(app.getHttpServer())
      .get('/api/v1/calendar/holidays?month=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(holidayList.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: publicHoliday.body.id,
          name: 'Tabaski 2026',
          type: 'PUBLIC_HOLIDAY',
        }),
        expect.objectContaining({
          id: companyHoliday.body.id,
          name: 'Jour Konatech',
          type: 'COMPANY_HOLIDAY',
        }),
      ]),
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/calendar/holidays/${companyHoliday.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get('/api/v1/calendar/month?month=2026-04')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(afterDelete.body.summary.publicHolidays).toBe(1);
    expect(afterDelete.body.summary.companyHolidays).toBe(0);
    expect(
      afterDelete.body.entries.some(
        (entry: { id: string }) => entry.id === companyHoliday.body.id,
      ),
    ).toBe(false);
  });
});
