import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AccessRole, MembershipRole, PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

describe('Site schedule management (HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sequence = 0;
  const password = 'SiteSchedule123!';

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 120_000);

  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  async function fixture() {
    sequence += 1;
    const organization = await prisma.organization.create({ data: { name: `Site Schedule ${sequence}`, slug: `site-schedule-${sequence}`, timezone: 'UTC' } });
    await prisma.organizationSubscription.update({ where: { organizationId: organization.id }, data: {
      plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE,
      endsAt: new Date(Date.now() + 86_400_000), graceEndsAt: new Date(Date.now() + 86_400_000),
    } });
    const passwordHash = await hashPassword(password);
    const tokens: Record<string, string> = {};
    for (const role of [MembershipRole.ADMIN, MembershipRole.EMPLOYEE]) {
      const user = await prisma.user.create({ data: { normalizedEmail: `site-schedule-${sequence}-${role.toLowerCase()}@test.local`, passwordHash } });
      await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role } });
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.normalizedEmail, password }).expect(201);
      tokens[role] = login.body.accessToken as string;
    }
    const [siteA, siteB] = await Promise.all(['A', 'B'].map((name) => prisma.attendanceSite.create({ data: {
      organizationId: organization.id, name, latitude: 5, longitude: -4, allowedRadiusMeters: 100,
    } })));
    const foreignOrganization = await prisma.organization.create({ data: { name: `Foreign Schedule ${sequence}`, slug: `foreign-schedule-${sequence}`, timezone: 'UTC' } });
    const foreignSite = await prisma.attendanceSite.create({ data: {
      organizationId: foreignOrganization.id, name: 'Foreign', latitude: 5, longitude: -4, allowedRadiusMeters: 100,
    } });
    const [scheduleA, scheduleB] = await Promise.all([siteA, siteB].map((site) => prisma.schedule.create({ data: {
      organizationId: organization.id, siteId: site.id, name: `Schedule ${site.name} ${sequence}`,
      startTime: '08:00', endTime: '17:00', workDays: ['MONDAY'], v1ScopeStatus: 'OPERATIONAL',
    } })));
    const foreignSchedule = await prisma.schedule.create({ data: {
      organizationId: foreignOrganization.id, siteId: foreignSite.id, name: `Foreign ${sequence}`,
      startTime: '08:00', endTime: '17:00', workDays: ['MONDAY'], v1ScopeStatus: 'OPERATIONAL',
    } });
    const employee = await prisma.employee.create({ data: {
      employeeIdentifier: `SS-${sequence}`, firstName: 'Site', lastName: 'Employee', email: `site-profile-${sequence}@test.local`,
      role: 'Employee', accessRole: AccessRole.EMPLOYEE, passwordHash, organizationId: organization.id,
      primarySiteId: siteA.id, scheduleId: scheduleA.id, v1ScopeStatus: 'OPERATIONAL',
    } });
    const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
    const siteAssignment = await prisma.employeeSiteAssignment.create({ data: { organizationId: organization.id, employeeId: employee.id, siteId: siteA.id, effectiveFrom } });
    await prisma.employeeScheduleAssignment.create({ data: {
      organizationId: organization.id, employeeId: employee.id, siteId: siteA.id, scheduleId: scheduleA.id,
      employeeSiteAssignmentId: siteAssignment.id, effectiveFrom, v1ScopeStatus: 'OPERATIONAL',
    } });
    return { organization, siteA, siteB, foreignSite, scheduleA, scheduleB, foreignSchedule, employee, tokens };
  }

  const sitePath = (siteId: string, suffix = '') => `/api/v1/attendance-sites/${siteId}/schedules${suffix}`;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const schedulePayload = (name: string) => ({ name, startTime: '09:00', endTime: '18:00', workDays: ['MONDAY', 'TUESDAY'] });

  it('creates, edits, and activates/deactivates a schedule through its site context', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    const created = await request(app.getHttpServer()).post(sitePath(data.siteA.id)).set(admin).send(schedulePayload(`Created ${sequence}`)).expect(201);
    expect(created.body).toMatchObject({ siteId: data.siteA.id, name: `Created ${sequence}` });
    const persisted = await prisma.schedule.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(persisted).toMatchObject({ organizationId: data.organization.id, siteId: data.siteA.id });
    const listed = await request(app.getHttpServer()).get(`/api/v1/attendance-sites/${data.siteA.id}/schedules`).set(admin).expect(200);
    expect(listed.body.items.map((schedule: { id: string }) => schedule.id)).toContain(created.body.id);
    const updated = await request(app.getHttpServer()).patch(sitePath(data.siteA.id, `/${created.body.id}`)).set(admin).send({ name: `Updated ${sequence}` }).expect(200);
    expect(updated.body).toMatchObject({ siteId: data.siteA.id, name: `Updated ${sequence}` });
    await request(app.getHttpServer()).patch(sitePath(data.siteA.id, `/${created.body.id}/status`)).set(admin).send({ isActive: false }).expect(200);
    await request(app.getHttpServer()).patch(sitePath(data.siteA.id, `/${created.body.id}/status`)).set(admin).send({ isActive: true }).expect(200);
  });

  it('rejects foreign tenant sites, foreign site schedules, inactive sites, and employees', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    await request(app.getHttpServer()).post(sitePath(data.foreignSite.id)).set(admin).send(schedulePayload(`No ${sequence}`)).expect(404);
    await request(app.getHttpServer()).patch(sitePath(data.siteA.id, `/${data.scheduleB.id}`)).set(admin).send({ name: 'Wrong site' }).expect(404);
    await request(app.getHttpServer()).patch(sitePath(data.siteA.id, `/${data.foreignSchedule.id}`)).set(admin).send({ name: 'Wrong tenant' }).expect(404);
    await prisma.attendanceSite.update({ where: { id: data.siteA.id }, data: { isActive: false } });
    await request(app.getHttpServer()).post(sitePath(data.siteA.id)).set(admin).send(schedulePayload(`Inactive ${sequence}`)).expect(404);
    await request(app.getHttpServer()).patch(sitePath(data.siteA.id, `/${data.scheduleA.id}/status`)).set(admin).send({ isActive: false }).expect(404);
    await request(app.getHttpServer()).post(sitePath(data.siteB.id)).set(auth(data.tokens.EMPLOYEE)).send(schedulePayload(`Employee ${sequence}`)).expect(403);
  });

  it('allows an employee assignment to the current site schedule and rejects a schedule from another site', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    const second = await request(app.getHttpServer()).post(sitePath(data.siteA.id)).set(admin).send(schedulePayload(`Second ${sequence}`)).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/employees/${data.employee.id}/schedule`).set(admin).send({ scheduleId: second.body.id }).expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/employees/${data.employee.id}/schedule`).set(admin).send({ scheduleId: data.scheduleB.id }).expect(404);
    await request(app.getHttpServer()).patch(`/api/v1/employees/${data.employee.id}/schedule`).set(auth(data.tokens.EMPLOYEE)).send({ scheduleId: data.scheduleA.id }).expect(403);
    await prisma.attendanceSite.update({ where: { id: data.siteA.id }, data: { isActive: false } });
    await request(app.getHttpServer()).patch(`/api/v1/employees/${data.employee.id}/schedule`).set(admin).send({ scheduleId: data.scheduleA.id }).expect(404);
  });
});
