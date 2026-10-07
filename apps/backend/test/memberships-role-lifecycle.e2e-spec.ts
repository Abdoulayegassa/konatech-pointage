import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { hashPassword } from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Membership management and role lifecycle (e2e)', () => {
  const password = 'MembershipLifecycle123!';
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const legacyEmployeeIds: string[] = [];
  let app: INestApplication;
  let auditLogService: AuditLogService;
  let authService: AuthService;
  let passwordHash: string;
  let prisma: PrismaClient;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    passwordHash = await hashPassword(password);
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
      }),
    );
    await app.init();
    authService = app.get(AuthService);
    auditLogService = app.get(AuditLogService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.employee.deleteMany({
        where: {
          OR: [
            { organizationId: { in: organizationIds } },
            { id: { in: legacyEmployeeIds } },
          ],
        },
      });
      await prisma.membership.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.subscriptionEvent.deleteMany({
        where: { subscriptionId: { in: organizationIds } },
      });
      await prisma.organizationSubscription.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createOrganization() {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const organization = await prisma.organization.create({
      data: {
        name: `Membership Organization ${suffix}`,
        slug: `membership-organization-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createUser() {
    sequence += 1;
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `membership-user-${sequence}@example.test`,
        passwordHash,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function addMembership(
    organizationId: string,
    role: MembershipRole,
    providedUser?: Awaited<ReturnType<typeof createUser>>,
  ) {
    const user = providedUser ?? (await createUser());
    const membership = await prisma.membership.create({
      data: { organizationId, userId: user.id, role },
    });
    return { membership, user };
  }

  async function createTenant(
    actorRole: MembershipRole = MembershipRole.ADMIN,
  ) {
    const organization = await createOrganization();
    const actor = await addMembership(organization.id, actorRole);
    if (actorRole !== MembershipRole.ADMIN) {
      await addMembership(organization.id, MembershipRole.ADMIN);
    }
    return {
      ...actor,
      organization,
      token: tokenFor(actor.user, actor.membership),
    };
  }

  function tokenFor(
    user: { id: string; userVersion: number },
    membership: {
      id: string;
      organizationId: string;
      membershipVersion: number;
    },
  ) {
    return authService.createAccountToken({
      userId: user.id,
      membershipId: membership.id,
      organizationId: membership.organizationId,
      userVersion: user.userVersion,
      membershipVersion: membership.membershipVersion,
    });
  }

  function authorized(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('lets ADMIN list/read only safe Membership fields in their tenant', async () => {
    for (const role of [MembershipRole.ADMIN]) {
      const fixture = await createTenant(role);
      const target = await addMembership(
        fixture.organization.id,
        MembershipRole.EMPLOYEE,
      );

      const list = await request(app.getHttpServer())
        .get('/api/v1/organizations/current/members')
        .set(authorized(fixture.token))
        .expect(200);

      expect(
        list.body.map((membership: { id: string }) => membership.id),
      ).toEqual(
        expect.arrayContaining([fixture.membership.id, target.membership.id]),
      );

      const read = await request(app.getHttpServer())
        .get(`/api/v1/organizations/current/members/${target.membership.id}`)
        .set(authorized(fixture.token))
        .expect(200);
      expect(read.body).toMatchObject({
        id: target.membership.id,
        userId: target.user.id,
        role: MembershipRole.EMPLOYEE,
        status: MembershipStatus.ACTIVE,
        user: {
          id: target.user.id,
          normalizedEmail: target.user.normalizedEmail,
        },
      });
      expect(read.body).not.toHaveProperty('organizationId');
      expect(read.body).not.toHaveProperty('membershipVersion');
      expect(read.body.user).not.toHaveProperty('passwordHash');
      expect(read.body.user).not.toHaveProperty('userVersion');
    }
  });

  it.each([MembershipRole.EMPLOYEE])(
    'denies Membership listing and reads to %s',
    async (role) => {
      const fixture = await createTenant(role);

      await request(app.getHttpServer())
        .get('/api/v1/organizations/current/members')
        .set(authorized(fixture.token))
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/current/members/${fixture.membership.id}`)
        .set(authorized(fixture.token))
        .expect(403);
    },
  );

  it('allows an ADMIN without Employee to change an EMPLOYEE role, audits the User actor and invalidates the old token', async () => {
    const fixture = await createTenant();
    const target = await addMembership(
      fixture.organization.id,
      MembershipRole.EMPLOYEE,
    );
    const oldTargetToken = tokenFor(target.user, target.membership);
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    const response = await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/role`,
      )
      .set(authorized(fixture.token))
      .send({ role: MembershipRole.ADMIN })
      .expect(200);

    expect(response.body).toMatchObject({
      id: target.membership.id,
      role: MembershipRole.ADMIN,
    });
    const persisted = await prisma.membership.findUniqueOrThrow({
      where: { id: target.membership.id },
    });
    expect(persisted.membershipVersion).toBe(
      target.membership.membershipVersion + 1,
    );
    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
    expect(auditSpy).toHaveBeenLastCalledWith({
      actor: {
        actorType: 'USER',
        actorId: fixture.user.id,
        organizationId: fixture.organization.id,
        role: MembershipRole.ADMIN,
        employeeId: null,
      },
      action: 'membership.role.update',
      resource: 'membership',
      resourceId: target.membership.id,
      metadata: {
        targetUserId: target.user.id,
        previousRole: MembershipRole.EMPLOYEE,
        newRole: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(oldTargetToken))
      .expect(401);

    const freshLogin = await authService.login({
      email: target.user.normalizedEmail,
      password,
    });
    expect(freshLogin).not.toHaveProperty('organizationSelectionRequired');
    if ('organizationSelectionRequired' in freshLogin) {
      throw new Error('Expected a single-organization login.');
    }
    expect(freshLogin).toMatchObject({
      membership: { role: MembershipRole.ADMIN },
    });
    auditSpy.mockRestore();
  });

  it.each([MembershipRole.EMPLOYEE])(
    'denies role and status mutations to %s without mutation',
    async (role) => {
      const fixture = await createTenant(role);
      const target = await addMembership(
        fixture.organization.id,
        MembershipRole.EMPLOYEE,
      );

      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/members/${target.membership.id}/role`,
        )
        .set(authorized(fixture.token))
        .send({ role: MembershipRole.ADMIN })
        .expect(403);
      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/members/${target.membership.id}/status`,
        )
        .set(authorized(fixture.token))
        .send({ status: MembershipStatus.SUSPENDED })
        .expect(403);

      expect(
        await prisma.membership.findUnique({
          where: { id: target.membership.id },
        }),
      ).toMatchObject({
        role: MembershipRole.EMPLOYEE,
        status: MembershipStatus.ACTIVE,
        membershipVersion: target.membership.membershipVersion,
      });
    },
  );

  it('allows ADMIN without Employee to manage EMPLOYEE Memberships and records a User actor', async () => {
    const fixture = await createTenant(MembershipRole.ADMIN);
    const target = await addMembership(
      fixture.organization.id,
      MembershipRole.EMPLOYEE,
    );
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/role`,
      )
      .set(authorized(fixture.token))
      .send({ role: MembershipRole.ADMIN })
      .expect(200);
    expect(auditSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actor: {
          actorType: 'USER',
          actorId: fixture.user.id,
          organizationId: fixture.organization.id,
          role: MembershipRole.ADMIN,
          employeeId: null,
        },
        action: 'membership.role.update',
        resourceId: target.membership.id,
      }),
    );

    for (const status of [
      MembershipStatus.SUSPENDED,
      MembershipStatus.ACTIVE,
      MembershipStatus.REVOKED,
    ]) {
      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/members/${target.membership.id}/status`,
        )
        .set(authorized(fixture.token))
        .send({ status })
        .expect(200);
    }

    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
    auditSpy.mockRestore();
  });

  it('allows ADMIN to change an EMPLOYEE Membership to ADMIN', async () => {
    const fixture = await createTenant();
    const target = await addMembership(
      fixture.organization.id,
      MembershipRole.EMPLOYEE,
    );

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/role`,
      )
      .set(authorized(fixture.token))
      .send({ role: MembershipRole.ADMIN })
      .expect(200);

    expect(
      await prisma.membership.findUnique({
        where: { id: target.membership.id },
      }),
    ).toMatchObject({
      role: MembershipRole.ADMIN,
      membershipVersion: target.membership.membershipVersion + 1,
    });
  });

  it('returns generic 404 for cross-tenant Membership targets and never mutates them', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const original = tenantB.membership;

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/current/members/${original.id}`)
      .set(authorized(tenantA.token))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/current/members/${original.id}/role`)
      .set(authorized(tenantA.token))
      .send({ role: MembershipRole.ADMIN })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/current/members/${original.id}/status`)
      .set(authorized(tenantA.token))
      .send({ status: MembershipStatus.SUSPENDED })
      .expect(404);

    expect(
      await prisma.membership.findUnique({ where: { id: original.id } }),
    ).toMatchObject({
      role: original.role,
      status: original.status,
      membershipVersion: original.membershipVersion,
    });
  });

  it('scopes query spoofing to the authenticated tenant and rejects body/path organizationId', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const targetA = await addMembership(
      tenantA.organization.id,
      MembershipRole.EMPLOYEE,
    );

    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/current/members?organizationId=${tenantB.organization.id}`,
      )
      .set(authorized(tenantA.token))
      .expect(200);
    expect(
      list.body.map((membership: { id: string }) => membership.id),
    ).toEqual(
      expect.arrayContaining([tenantA.membership.id, targetA.membership.id]),
    );
    expect(
      list.body.map((membership: { id: string }) => membership.id),
    ).not.toContain(tenantB.membership.id);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${targetA.membership.id}/role`,
      )
      .set(authorized(tenantA.token))
      .send({
        role: MembershipRole.EMPLOYEE,
        organizationId: tenantB.organization.id,
      })
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/${tenantB.organization.id}/memberships/${targetA.membership.id}`,
      )
      .set(authorized(tenantA.token))
      .expect(404);

    expect(
      await prisma.membership.findUnique({
        where: { id: targetA.membership.id },
      }),
    ).toMatchObject({ role: MembershipRole.EMPLOYEE });
  });

  it.each([
    ['demote', 'role', MembershipRole.EMPLOYEE],
    ['suspend', 'status', MembershipStatus.SUSPENDED],
    ['revoke', 'status', MembershipStatus.REVOKED],
  ] as const)(
    'protects the last active ADMIN from %s',
    async (_label, kind, value) => {
      const fixture = await createTenant();
      const path = `/api/v1/organizations/current/members/${fixture.membership.id}/${kind}`;

      await request(app.getHttpServer())
        .patch(path)
        .set(authorized(fixture.token))
        .send({ [kind]: value })
        .expect(409);

      expect(
        await prisma.membership.findUnique({
          where: { id: fixture.membership.id },
        }),
      ).toMatchObject({
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
        membershipVersion: fixture.membership.membershipVersion,
      });
    },
  );

  it('serializes concurrent ADMIN demotions and retains one active ADMIN', async () => {
    const fixture = await createTenant();
    const second = await addMembership(
      fixture.organization.id,
      MembershipRole.ADMIN,
    );
    const secondToken = tokenFor(second.user, second.membership);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/members/${fixture.membership.id}/role`,
        )
        .set(authorized(fixture.token))
        .send({ role: MembershipRole.EMPLOYEE }),
      request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/members/${second.membership.id}/role`,
        )
        .set(authorized(secondToken))
        .send({ role: MembershipRole.EMPLOYEE }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.membership.count({
        where: {
          organizationId: fixture.organization.id,
          role: MembershipRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ).toBe(1);
  });

  it('supports suspension/reactivation, treats revocation as terminal and invalidates sessions', async () => {
    const fixture = await createTenant();
    const target = await addMembership(
      fixture.organization.id,
      MembershipRole.EMPLOYEE,
    );
    const targetToken = tokenFor(target.user, target.membership);
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/status`,
      )
      .set(authorized(fixture.token))
      .send({ status: MembershipStatus.SUSPENDED })
      .expect(200);
    expect(auditSpy).toHaveBeenLastCalledWith({
      actor: {
        actorType: 'USER',
        actorId: fixture.user.id,
        organizationId: fixture.organization.id,
        role: MembershipRole.ADMIN,
        employeeId: null,
      },
      action: 'membership.status.update',
      resource: 'membership',
      resourceId: target.membership.id,
      metadata: {
        targetUserId: target.user.id,
        role: MembershipRole.EMPLOYEE,
        previousStatus: MembershipStatus.ACTIVE,
        newStatus: MembershipStatus.SUSPENDED,
      },
    });
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(targetToken))
      .expect(401);
    await expect(
      authService.login({ email: target.user.normalizedEmail, password }),
    ).rejects.toMatchObject({ status: 401 });

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/status`,
      )
      .set(authorized(fixture.token))
      .send({ status: MembershipStatus.ACTIVE })
      .expect(200);
    const reactivatedLogin = await authService.login({
      email: target.user.normalizedEmail,
      password,
    });
    expect(reactivatedLogin).not.toHaveProperty(
      'organizationSelectionRequired',
    );
    if (!('accessToken' in reactivatedLogin)) {
      throw new Error('Expected a reactivated account token.');
    }

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/status`,
      )
      .set(authorized(fixture.token))
      .send({ status: MembershipStatus.REVOKED })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(reactivatedLogin.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/status`,
      )
      .set(authorized(fixture.token))
      .send({ status: MembershipStatus.ACTIVE })
      .expect(409);
    auditSpy.mockRestore();
  });

  it('allows one ADMIN to change another ADMIN state while preserving the invariant', async () => {
    for (const change of [
      { kind: 'role', value: MembershipRole.EMPLOYEE },
      { kind: 'status', value: MembershipStatus.SUSPENDED },
      { kind: 'status', value: MembershipStatus.REVOKED },
    ] as const) {
      const fixture = await createTenant();
      const second = await addMembership(
        fixture.organization.id,
        MembershipRole.ADMIN,
      );

      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/members/${second.membership.id}/${change.kind}`,
        )
        .set(authorized(fixture.token))
        .send({ [change.kind]: change.value })
        .expect(200);

      expect(
        await prisma.membership.count({
          where: {
            organizationId: fixture.organization.id,
            role: MembershipRole.ADMIN,
            status: MembershipStatus.ACTIVE,
          },
        }),
      ).toBe(1);
    }
  });

  it('does not create or delete Employees during Membership mutations', async () => {
    const fixture = await createTenant();
    const target = await addMembership(
      fixture.organization.id,
      MembershipRole.EMPLOYEE,
    );
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `EMPLOYEE-EMP-${sequence}`,
        firstName: 'Membership',
        lastName: 'Employee',
        email: target.user.normalizedEmail,
        role: 'Operations',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        organizationId: fixture.organization.id,
        userId: target.user.id,
      },
    });

    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/role`,
      )
      .set(authorized(fixture.token))
      .send({ role: MembershipRole.ADMIN })
      .expect(200);
    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/members/${target.membership.id}/status`,
      )
      .set(authorized(fixture.token))
      .send({ status: MembershipStatus.SUSPENDED })
      .expect(200);

    expect(
      await prisma.employee.findUnique({ where: { id: employee.id } }),
    ).toMatchObject({
      id: employee.id,
      userId: target.user.id,
      organizationId: fixture.organization.id,
    });
    expect(
      await prisma.employee.count({ where: { userId: fixture.user.id } }),
    ).toBe(0);
  });

  it('keeps roles independent for the same User in multiple organizations', async () => {
    const organizationA = await createOrganization();
    const organizationB = await createOrganization();
    await addMembership(organizationA.id, MembershipRole.ADMIN);
    await addMembership(organizationB.id, MembershipRole.ADMIN);
    const sharedUser = await createUser();
    const membershipA = await addMembership(
      organizationA.id,
      MembershipRole.ADMIN,
      sharedUser,
    );
    const membershipB = await addMembership(
      organizationB.id,
      MembershipRole.EMPLOYEE,
      sharedUser,
    );

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(tokenFor(sharedUser, membershipA.membership)))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(tokenFor(sharedUser, membershipB.membership)))
      .expect(403);

    await prisma.membership.update({
      where: { id: membershipA.membership.id },
      data: {
        role: MembershipRole.EMPLOYEE,
        membershipVersion: { increment: 1 },
      },
    });
    await prisma.membership.update({
      where: { id: membershipB.membership.id },
      data: { role: MembershipRole.ADMIN, membershipVersion: { increment: 1 } },
    });
    const refreshedA = await prisma.membership.findUniqueOrThrow({
      where: { id: membershipA.membership.id },
    });
    const refreshedB = await prisma.membership.findUniqueOrThrow({
      where: { id: membershipB.membership.id },
    });

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(tokenFor(sharedUser, refreshedA)))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(tokenFor(sharedUser, refreshedB)))
      .expect(200);
  });

  it('uses Membership.role, never Employee business/access roles, as SaaS authority', async () => {
    const organization = await createOrganization();
    const admin = await addMembership(organization.id, MembershipRole.ADMIN);
    const employeeMember = await addMembership(organization.id, MembershipRole.EMPLOYEE);
    await prisma.employee.createMany({
      data: [
        {
          employeeIdentifier: `EMP-AUTH-ADMIN-${sequence}`,
          firstName: 'Admin',
          lastName: 'Employee',
          email: admin.user.normalizedEmail,
          role: 'Intern',
          accessRole: AccessRole.EMPLOYEE,
          passwordHash,
          organizationId: organization.id,
          userId: admin.user.id,
        },
        {
          employeeIdentifier: `EMP-AUTH-EMPLOYEE-${sequence}`,
          firstName: 'Employee',
          lastName: 'Employee',
          email: employeeMember.user.normalizedEmail,
          role: 'Chief Executive Officer',
          accessRole: AccessRole.ADMIN,
          passwordHash,
          organizationId: organization.id,
          userId: employeeMember.user.id,
        },
      ],
    });

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(tokenFor(admin.user, admin.membership)))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(tokenFor(employeeMember.user, employeeMember.membership)))
      .expect(403);
  });

  it('keeps Legacy independent and denies Membership administration', async () => {
    sequence += 1;
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `MEMBERSHIP-LEGACY-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Administrator',
        email: `membership-legacy-${sequence}@example.test`,
        role: 'Administrator',
        accessRole: AccessRole.ADMIN,
        passwordHash,
        organizationId: null,
        userId: null,
      },
    });
    legacyEmployeeIds.push(employee.id);
    const login = await authService.login({ email: employee.email, password });
    if ('organizationSelectionRequired' in login) {
      throw new Error('Expected a Legacy token.');
    }

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/members')
      .set(authorized(login.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/members/unknown/role')
      .set(authorized(login.accessToken))
      .send({ role: MembershipRole.ADMIN })
      .expect(401);
    expect(
      await prisma.employee.findUnique({
        where: { id: employee.id },
        select: { organizationId: true, userId: true },
      }),
    ).toEqual({ organizationId: null, userId: null });
  });
});
