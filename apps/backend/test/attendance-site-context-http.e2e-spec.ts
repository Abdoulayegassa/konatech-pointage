import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AccessRole, MembershipRole, PrismaClient, SubscriptionPlan, SubscriptionStatus, V1OperationalScopeStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword, hashPinCode } from '../src/common/security/password.util';
import { verifyJwtToken } from '../src/common/security/jwt.util';
import { prepareTestDatabase } from './test-database';

describe('HTTP attendance site context', () => {
  let app: INestApplication; let prisma: PrismaClient; let seq = 0;
  const password = 'AttendanceHttp123!';
  beforeAll(async () => { await prepareTestDatabase(); prisma = new PrismaClient(); const m = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = m.createNestApplication(); app.setGlobalPrefix('api/v1'); app.useGlobalPipes(new ValidationPipe({ whitelist:true, forbidNonWhitelisted:true, transform:true })); await app.init(); }, 120_000);
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });
  async function createAttendanceHttpFixture(scope: V1OperationalScopeStatus = V1OperationalScopeStatus.OPERATIONAL) {
    seq++; const suffix = `${seq}`; const hash = await hashPassword(password); const pin = String(5100+seq);
    const organization = await prisma.organization.create({ data: { name:`Attendance ${suffix}`, slug:`attendance-http-${suffix}`, timezone:'UTC' } });
    await prisma.organizationSubscription.update({ where:{organizationId:organization.id}, data:{plan:SubscriptionPlan.PRO,status:SubscriptionStatus.ACTIVE,endsAt:new Date(Date.now()+86400000),graceEndsAt:new Date(Date.now()+86400000)} });
    const admin = await prisma.user.create({ data:{normalizedEmail:`admin-${suffix}@test.local`,passwordHash:hash} });
    const user = await prisma.user.create({ data:{normalizedEmail:`employee-${suffix}@test.local`,passwordHash:hash} });
    await prisma.membership.createMany({ data:[{organizationId:organization.id,userId:admin.id,role:MembershipRole.ADMIN},{organizationId:organization.id,userId:user.id,role:MembershipRole.EMPLOYEE}] });
    const [a,b] = await Promise.all(['A','B'].map((name,i)=>prisma.attendanceSite.create({data:{organizationId:organization.id,name,latitude:i+1,longitude:i+1,allowedRadiusMeters:100}})));
    const employee = await prisma.employee.create({data:{employeeIdentifier:`ATT-${suffix}`,firstName:'Attendance',lastName:suffix,email:`profile-${suffix}@test.local`,role:'Employee',accessRole:AccessRole.EMPLOYEE,passwordHash:hash,pinCodeHash:await hashPinCode(pin),userId:user.id,organizationId:organization.id,primarySiteId:a.id,v1ScopeStatus:scope}});
    const today = new Date(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
    const siteAssignment = await prisma.employeeSiteAssignment.create({data:{organizationId:organization.id,employeeId:employee.id,siteId:a.id,effectiveFrom:today}});
    const [scheduleA,scheduleB] = await Promise.all([a,b].map((site) => prisma.schedule.create({data:{organizationId:organization.id,siteId:site.id,name:`Schedule ${site.name} ${suffix}`,startTime:'08:00',endTime:'17:00',workDays:['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'],v1ScopeStatus:scope}})));
    if (scope === V1OperationalScopeStatus.OPERATIONAL) await prisma.employeeScheduleAssignment.create({data:{organizationId:organization.id,employeeId:employee.id,siteId:a.id,scheduleId:scheduleA.id,employeeSiteAssignmentId:siteAssignment.id,effectiveFrom:today,v1ScopeStatus:scope}});
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({email:admin.normalizedEmail,password}).expect(201);
    const entry = await request(app.getHttpServer()).post('/api/v1/auth/attendance-entry/login').send({pinCode:pin,sitePublicId:a.publicId});
    return {organization,adminToken:login.body.accessToken as string,employee,employeeToken:entry.body.accessToken as string,pin,a,b,scheduleB};
  }
  const binding=(token:string)=>{const p=verifyJwtToken(token,process.env.JWT_SECRET!); if(p.purpose!=='attendance_entry') throw new Error('bad token'); return p.sessionBinding;};
  const offlineContext=async(token:string)=> (await request(app.getHttpServer()).get('/api/v1/attendance/me/offline-context').set('Authorization',`Bearer ${token}`).expect(200)).body.contextToken as string;
  it('enforces effective site, tenant scope, QR binding, roles and review scope over HTTP', async () => {
    const f=await createAttendanceHttpFixture();
    await request(app.getHttpServer()).post('/api/v1/attendance/check-in').set('Authorization',`Bearer ${f.adminToken}`).send({employeeId:f.employee.id,siteId:f.a.id}).expect(201);
    await request(app.getHttpServer()).post('/api/v1/attendance/check-in').set('Authorization',`Bearer ${f.adminToken}`).send({employeeId:f.employee.id,siteId:f.b.id}).expect(403);
    await request(app.getHttpServer()).post('/api/v1/attendance/check-in').set('Authorization',`Bearer ${f.employeeToken}`).send({employeeId:f.employee.id,siteId:f.a.id}).expect(403);
    const other=await createAttendanceHttpFixture();
    await request(app.getHttpServer()).post('/api/v1/attendance/check-in').set('Authorization',`Bearer ${f.adminToken}`).send({employeeId:f.employee.id,siteId:other.a.id}).expect(404);
    await request(app.getHttpServer()).post('/api/v1/auth/attendance-entry/login').send({pinCode:f.pin,sitePublicId:f.b.publicId}).expect(401);
    const review=await createAttendanceHttpFixture(V1OperationalScopeStatus.REVIEW_REQUIRED);
    await request(app.getHttpServer()).post('/api/v1/auth/attendance-entry/login').send({pinCode:review.pin,sitePublicId:review.a.publicId}).expect(401);
  });
  it('keeps offline site context idempotent and historical attendance immutable through a transfer', async () => {
    const f=await createAttendanceHttpFixture(); const payload={sessionBinding:binding(f.employeeToken),contextToken:await offlineContext(f.employeeToken),clientRequestId:'00000000-0000-4000-8000-000000000123',action:'check-in',capturedAt:new Date().toISOString(),siteId:f.a.id};
    const first=await request(app.getHttpServer()).post('/api/v1/attendance/me/sync').set('Authorization',`Bearer ${f.employeeToken}`).send(payload).expect(201);
    await request(app.getHttpServer()).post('/api/v1/attendance/me/sync').set('Authorization',`Bearer ${f.employeeToken}`).send(payload).expect(201).expect(({body})=>expect(body.idempotent).toBe(true));
    const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    await request(app.getHttpServer()).patch(`/api/v1/employees/${f.employee.id}/site`).set('Authorization',`Bearer ${f.adminToken}`).send({siteId:f.b.id,scheduleId:f.scheduleB.id,effectiveFrom:tomorrow.toISOString().slice(0,10)}).expect(200);
    expect((await prisma.attendance.findUniqueOrThrow({where:{id:first.body.attendance.id}})).attendanceSiteId).toBe(f.a.id);
  });
});
