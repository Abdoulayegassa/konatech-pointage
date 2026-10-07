import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MembershipRole, PrismaClient, SubscriptionPlan, SubscriptionStatus, V1OperationalScopeStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

describe('Employee site lifecycle HTTP authorization', () => {
  let app: INestApplication; let prisma: PrismaClient; let hash: string; let n = 0;
  const password = 'EmployeeSiteHttp123!';
  beforeAll(async () => {
    await prepareTestDatabase(); prisma = new PrismaClient(); hash = await hashPassword(password);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  }, 120_000);
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });
  async function tenant(role: MembershipRole = MembershipRole.ADMIN) {
    n += 1; const org = await prisma.organization.create({ data: { name: `Employee HTTP ${n}`, slug: `employee-http-${n}`, timezone: 'UTC' } });
    await prisma.organizationSubscription.update({ where: { organizationId: org.id }, data: { plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE, endsAt: new Date(Date.now()+86400000), graceEndsAt: new Date(Date.now()+86400000) } });
    const user = await prisma.user.create({ data: { normalizedEmail: `employee-http-${n}@test.local`, passwordHash: hash } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role } });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.normalizedEmail, password }).expect(201);
    const [a,b] = await Promise.all(['A','B'].map((name, i) => prisma.attendanceSite.create({ data: { organizationId: org.id, name, latitude: i+1, longitude: i+1, allowedRadiusMeters: 100 } })));
    const [aSchedule, bSchedule] = await Promise.all([
      prisma.schedule.create({ data: { organizationId: org.id, siteId: a.id, name: `A ${n}`, startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
      prisma.schedule.create({ data: { organizationId: org.id, siteId: b.id, name: `B ${n}`, startTime: '08:00', endTime: '17:00', workDays: [], v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } }),
    ]);
    return { org, token: login.body.accessToken as string, a, b, aSchedule, bSchedule };
  }
  const payload = (siteId: string, email: string, scheduleId?: string) => ({ firstName: 'HTTP', lastName: 'Employee', email, role: 'Employee', password: 'EmployeePassword123!', pinCode: String(4500 + n), siteId, scheduleId });

  it('allows ADMIN lifecycle operations and denies EMPLOYEE', async () => {
    const admin = await tenant(); const employee = await tenant(MembershipRole.EMPLOYEE);
    const created = await request(app.getHttpServer()).post('/api/v1/employees').set('Authorization', `Bearer ${admin.token}`).send(payload(admin.a.id, 'admin-create@test.local')).expect(201);
    await request(app.getHttpServer()).get(`/api/v1/employees?siteId=${admin.a.id}`).set('Authorization', `Bearer ${admin.token}`).expect(200).expect(({ body }) => expect(body.map((x: {id:string}) => x.id)).toContain(created.body.id));
    await request(app.getHttpServer()).patch(`/api/v1/employees/${created.body.id}/site`).set('Authorization', `Bearer ${admin.token}`).send({ siteId: admin.b.id, scheduleId: admin.bSchedule.id, effectiveFrom: new Date().toISOString().slice(0,10) }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/employees').set('Authorization', `Bearer ${employee.token}`).send(payload(employee.a.id, 'employee-denied@test.local')).expect(403);
  });

  it('rejects inactive and cross-tenant transfer sites through HTTP', async () => {
    const one = await tenant(); const two = await tenant();
    const created = await request(app.getHttpServer()).post('/api/v1/employees').set('Authorization', `Bearer ${one.token}`).send(payload(one.a.id, 'isolation@test.local')).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/employees/${created.body.id}/site`).set('Authorization', `Bearer ${one.token}`).send({ siteId: two.a.id, scheduleId: two.aSchedule.id, effectiveFrom: new Date().toISOString().slice(0,10) }).expect(404);
    await prisma.attendanceSite.update({ where: { id: one.b.id }, data: { isActive: false } });
    await request(app.getHttpServer()).patch(`/api/v1/employees/${created.body.id}/site`).set('Authorization', `Bearer ${one.token}`).send({ siteId: one.b.id, scheduleId: one.bSchedule.id, effectiveFrom: new Date().toISOString().slice(0,10) }).expect(404);
  });

  it('serializes concurrent authenticated transfers into one valid current assignment', async () => {
    const tenantData = await tenant();
    const created = await request(app.getHttpServer()).post('/api/v1/employees').set('Authorization', `Bearer ${tenantData.token}`).send(payload(tenantData.a.id, 'concurrent@test.local', tenantData.aSchedule.id)).expect(201);
    const effectiveFrom = new Date().toISOString().slice(0, 10);
    const responses = await Promise.all([
      request(app.getHttpServer()).patch(`/api/v1/employees/${created.body.id}/site`).set('Authorization', `Bearer ${tenantData.token}`).send({ siteId: tenantData.b.id, scheduleId: tenantData.bSchedule.id, effectiveFrom }),
      request(app.getHttpServer()).patch(`/api/v1/employees/${created.body.id}/site`).set('Authorization', `Bearer ${tenantData.token}`).send({ siteId: tenantData.b.id, scheduleId: tenantData.bSchedule.id, effectiveFrom }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const record = await prisma.employee.findUniqueOrThrow({ where: { id: created.body.id }, include: { siteAssignments: true, scheduleAssignments: true } });
    expect(record.primarySiteId).toBe(tenantData.b.id);
    expect(record.scheduleId).toBe(tenantData.bSchedule.id);
    expect(record.siteAssignments.filter((assignment) => assignment.effectiveTo === null)).toHaveLength(1);
    expect(record.siteAssignments[0].siteId).toBe(tenantData.b.id);
    expect(record.scheduleAssignments).toEqual([
      expect.objectContaining({
        siteId: tenantData.b.id,
        scheduleId: tenantData.bSchedule.id,
        employeeSiteAssignmentId: record.siteAssignments[0].id,
        effectiveTo: null,
      }),
    ]);
  });

  it('enforces Starter site quota through the authenticated site lifecycle endpoint', async () => {
    const starter = await tenant();
    await prisma.organizationSubscription.update({ where: { organizationId: starter.org.id }, data: { plan: SubscriptionPlan.STARTER } });
    // tenant() already creates two sites; deactivate one so the existing limit is not pre-exceeded.
    await prisma.attendanceSite.update({ where: { id: starter.b.id }, data: { isActive: false } });
    await request(app.getHttpServer()).post('/api/v1/attendance-sites').set('Authorization', `Bearer ${starter.token}`).send({ name: 'Starter overflow', latitude: 8, longitude: 8, allowedRadiusMeters: 100 }).expect(409);
  });

  it('keeps historical attendance immutable across a future HTTP transfer and lazily activates the due site', async () => {
    const tenantData = await tenant();
    const created = await request(app.getHttpServer()).post('/api/v1/employees').set('Authorization', `Bearer ${tenantData.token}`).send(payload(tenantData.a.id, 'future-http@test.local')).expect(201);
    const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const effectiveFrom = tomorrow.toISOString().slice(0, 10);
    const historical = await prisma.attendance.create({ data: { employeeId: created.body.id, organizationId: tenantData.org.id, attendanceSiteId: tenantData.a.id, date: new Date() } });
    await request(app.getHttpServer()).patch(`/api/v1/employees/${created.body.id}/site`).set('Authorization', `Bearer ${tenantData.token}`).send({ siteId: tenantData.b.id, scheduleId: tenantData.bSchedule.id, effectiveFrom }).expect(200);
    let record = await prisma.employee.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(record.primarySiteId).toBe(tenantData.a.id);
    // Advance only assignment effective dates in the disposable fixture; GET is
    // the real HTTP path that performs lazy primary-site resolution.
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await prisma.employeeSiteAssignment.updateMany({ where: { employeeId: created.body.id, siteId: tenantData.a.id }, data: { effectiveFrom: yesterday } });
    await prisma.employeeSiteAssignment.updateMany({ where: { employeeId: created.body.id, siteId: tenantData.a.id }, data: { effectiveTo: today } });
    await prisma.employeeSiteAssignment.updateMany({ where: { employeeId: created.body.id, siteId: tenantData.b.id }, data: { effectiveFrom: today } });
    await request(app.getHttpServer()).get(`/api/v1/employees/${created.body.id}`).set('Authorization', `Bearer ${tenantData.token}`).expect(200);
    record = await prisma.employee.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(record.primarySiteId).toBe(tenantData.b.id);
    expect((await prisma.attendance.findUniqueOrThrow({ where: { id: historical.id } })).attendanceSiteId).toBe(tenantData.a.id);
  });
});
