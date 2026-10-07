import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { hashPassword } from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Invitation and Membership onboarding (e2e)', () => {
  const password = 'InvitationOnboarding123!';
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
      await prisma.invitation.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
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
    const organization = await prisma.organization.create({
      data: {
        name: `Invitation Organization ${sequence}`,
        slug: `invitation-organization-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });
    organizationIds.push(organization.id);
    return organization;
  }

  async function createUser(options?: { status?: UserStatus }) {
    sequence += 1;
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `invitation-user-${sequence}@example.test`,
        passwordHash,
        status: options?.status,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function addMembership(
    organizationId: string,
    role: MembershipRole,
    providedUser?: Awaited<ReturnType<typeof createUser>>,
    status: MembershipStatus = MembershipStatus.ACTIVE,
  ) {
    const user = providedUser ?? (await createUser());
    const membership = await prisma.membership.create({
      data: { organizationId, userId: user.id, role, status },
    });
    return { membership, user };
  }

  async function createTenant(role: MembershipRole = MembershipRole.ADMIN) {
    const organization = await createOrganization();
    const actor = await addMembership(organization.id, role);
    if (role !== MembershipRole.ADMIN) {
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

  async function createInvitation(token: string, email?: string) {
    sequence += 1;
    const invitedEmail = email ?? `invited-${sequence}@example.test`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(token))
      .send({ email: invitedEmail })
      .expect('Cache-Control', 'no-store')
      .expect(201);
    return response.body as {
      invitation: { id: string; email: string; expiresAt: string };
      invitationToken: string;
    };
  }

  it.each([MembershipRole.ADMIN])(
    'allows %s without Employee to create, list and read tenant invitations',
    async (role) => {
      const fixture = await createTenant(role);
      const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');
      const created = await createInvitation(
        fixture.token,
        `  ROLE-${role}@EXAMPLE.TEST  `,
      );

      expect(created.invitation.email).toBe(
        `role-${role.toLowerCase()}@example.test`,
      );
      expect(created.invitationToken).toHaveLength(43);
      expect(auditSpy).toHaveBeenLastCalledWith({
        actor: {
          actorType: 'USER',
          actorId: fixture.user.id,
          organizationId: fixture.organization.id,
          role,
          employeeId: null,
        },
        action: 'invitation.create',
        resource: 'invitation',
        resourceId: created.invitation.id,
      });
      expect(JSON.stringify(auditSpy.mock.lastCall)).not.toContain(
        created.invitationToken,
      );
      expect(JSON.stringify(auditSpy.mock.lastCall)).not.toContain(
        created.invitation.email,
      );

      const list = await request(app.getHttpServer())
        .get('/api/v1/organizations/current/invitations')
        .set(authorized(fixture.token))
        .expect(200);
      const read = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/current/invitations/${created.invitation.id}`,
        )
        .set(authorized(fixture.token))
        .expect(200);

      expect(list.body).toContainEqual(read.body);
      for (const representation of [list.body[0], read.body]) {
        expect(representation).not.toHaveProperty('tokenHash');
        expect(representation).not.toHaveProperty('organizationId');
        expect(representation).not.toHaveProperty('invitationToken');
      }
      expect(
        await prisma.employee.count({
          where: { organizationId: fixture.organization.id },
        }),
      ).toBe(0);
      auditSpy.mockRestore();
    },
  );

  it.each([MembershipRole.EMPLOYEE])(
    'denies invitation administration to %s',
    async (role) => {
      const fixture = await createTenant(role);

      await request(app.getHttpServer())
        .post('/api/v1/organizations/current/invitations')
        .set(authorized(fixture.token))
        .send({ email: `forbidden-${sequence}@example.test`, role: 'ADMIN' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/organizations/current/invitations')
        .set(authorized(fixture.token))
        .expect(403);
      await request(app.getHttpServer())
        .patch('/api/v1/organizations/current/invitations/unknown/revoke')
        .set(authorized(fixture.token))
        .expect(403);
    },
  );

  it('keeps listing, reads and revocation tenant-scoped with generic 404 errors', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const invitationB = await createInvitation(tenantB.token);

    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(tenantA.token))
      .send({
        email: `cross-tenant-${sequence}@example.test`,
        role: 'ADMIN',
        organizationId: tenantB.organization.id,
      })
      .expect(400);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/invitations')
      .set(authorized(tenantA.token))
      .expect(200);
    expect(
      listA.body.map((invitation: { id: string }) => invitation.id),
    ).not.toContain(invitationB.invitation.id);

    await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/current/invitations/${invitationB.invitation.id}`,
      )
      .set(authorized(tenantA.token))
      .expect(404);
    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/invitations/${invitationB.invitation.id}/revoke`,
      )
      .set(authorized(tenantA.token))
      .expect(404);

    expect(
      await prisma.invitation.findUnique({
        where: { id: invitationB.invitation.id },
      }),
    ).toMatchObject({ revokedAt: null, acceptedAt: null });
  });

  it('rejects body tenant spoofing and ignores query organizationId', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();

    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(tenantA.token))
      .send({
        email: `spoof-${sequence}@example.test`,
        organizationId: tenantB.organization.id,
      })
      .expect(400);

    const created = await createInvitation(tenantA.token);
    const list = await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/current/invitations?organizationId=${tenantB.organization.id}`,
      )
      .set(authorized(tenantA.token))
      .expect(200);
    expect(list.body.map((item: { id: string }) => item.id)).toContain(
      created.invitation.id,
    );
  });

  it('rejects role, user and tenant-control fields in creation and acceptance DTOs', async () => {
    const fixture = await createTenant();
    const email = `role-injection-${sequence}@example.test`;

    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(fixture.token))
      .send({
        email,
        role: MembershipRole.ADMIN,
        userId: fixture.user.id,
        organizationId: fixture.organization.id,
      })
      .expect(400);
    expect(
      await prisma.invitation.count({
        where: { organizationId: fixture.organization.id, email },
      }),
    ).toBe(0);

    const invitation = await createInvitation(fixture.token, email);
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({
        token: invitation.invitationToken,
        password,
        role: MembershipRole.ADMIN,
        organizationId: fixture.organization.id,
      })
      .expect(400);
    expect(
      await prisma.invitation.findUnique({
        where: { id: invitation.invitation.id },
      }),
    ).toMatchObject({ acceptedAt: null });
  });

  it('stores only the token hash and never exposes it through list/read responses', async () => {
    const fixture = await createTenant();
    const created = await createInvitation(fixture.token);
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: created.invitation.id },
      select: { tokenHash: true },
    });

    expect(stored.tokenHash).not.toBe(created.invitationToken);
    expect(stored.tokenHash).toBe(
      createHash('sha256').update(created.invitationToken).digest('hex'),
    );

    const list = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/invitations')
      .set(authorized(fixture.token))
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain(created.invitationToken);
    expect(JSON.stringify(list.body)).not.toContain(stored.tokenHash);
  });

  it('accepts a valid invitation, creates User and EMPLOYEE without Employee, then permits login', async () => {
    const fixture = await createTenant();
    const created = await createInvitation(fixture.token);
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    const response = await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: created.invitationToken, password })
      .expect('Cache-Control', 'no-store')
      .expect(201);

    expect(response.body).toMatchObject({
      user: { normalizedEmail: created.invitation.email },
      membership: {
        role: MembershipRole.EMPLOYEE,
        status: MembershipStatus.ACTIVE,
      },
      organization: {
        id: fixture.organization.id,
        slug: fixture.organization.slug,
      },
    });
    expect(response.body).not.toHaveProperty('invitationToken');
    expect(response.body.membership).not.toHaveProperty('membershipVersion');
    userIds.push(response.body.user.id);
    expect(
      await prisma.employee.count({ where: { userId: response.body.user.id } }),
    ).toBe(0);
    expect(
      await prisma.invitation.findUnique({
        where: { id: created.invitation.id },
      }),
    ).toMatchObject({ acceptedAt: expect.any(Date) });
    expect(auditSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          actorType: 'USER',
          actorId: response.body.user.id,
          organizationId: fixture.organization.id,
          role: MembershipRole.EMPLOYEE,
          employeeId: null,
        }),
        action: 'invitation.accept',
      }),
    );

    const login = await authService.login({
      email: created.invitation.email,
      password,
    });
    expect(login).toMatchObject({
      membership: { role: MembershipRole.EMPLOYEE },
    });
    auditSpy.mockRestore();
  });

  it('links an existing same-tenant Employee to the invited account without creating another Employee', async () => {
    const fixture = await createTenant();
    const email = `employee-link-${sequence}@example.test`;
    const employee = await prisma.employee.create({
      data: {
        organizationId: fixture.organization.id,
        employeeIdentifier: `INVITATION-LINK-${sequence}`,
        firstName: 'Employee',
        lastName: 'Link',
        email,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
      },
    });
    const invitation = await createInvitation(fixture.token, email);

    const response = await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitation.invitationToken, password })
      .expect(201);
    userIds.push(response.body.user.id);

    expect(
      await prisma.employee.findUnique({
        where: { id: employee.id },
        select: { userId: true, organizationId: true },
      }),
    ).toEqual({
      userId: response.body.user.id,
      organizationId: fixture.organization.id,
    });
    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(1);

    const login = await authService.login({ email, password });
    expect(login).toMatchObject({ employeeId: employee.id });
  });

  it('does not choose between ambiguous case-variant Employee emails', async () => {
    const fixture = await createTenant();
    const email = `ambiguous-link-${sequence}@example.test`;
    await prisma.employee.createMany({
      data: [
        {
          organizationId: fixture.organization.id,
          employeeIdentifier: `INVITATION-AMBIGUOUS-A-${sequence}`,
          firstName: 'Employee',
          lastName: 'One',
          email,
          role: 'Employee',
          accessRole: AccessRole.EMPLOYEE,
          passwordHash,
        },
        {
          organizationId: fixture.organization.id,
          employeeIdentifier: `INVITATION-AMBIGUOUS-B-${sequence}`,
          firstName: 'Employee',
          lastName: 'Two',
          email: email.toUpperCase(),
          role: 'Employee',
          accessRole: AccessRole.EMPLOYEE,
          passwordHash,
        },
      ],
    });
    const invitation = await createInvitation(fixture.token, email);

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitation.invitationToken, password })
      .expect(409);

    expect(
      await prisma.invitation.findUnique({
        where: { id: invitation.invitation.id },
        select: { acceptedAt: true },
      }),
    ).toEqual({ acceptedAt: null });
    expect(
      await prisma.membership.count({
        where: {
          organizationId: fixture.organization.id,
          user: { normalizedEmail: email },
        },
      }),
    ).toBe(0);
  });

  it('adds an existing global User to a second organization after password proof', async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const existing = await createUser();
    await addMembership(
      tenantB.organization.id,
      MembershipRole.EMPLOYEE,
      existing,
    );
    const invitation = await createInvitation(
      tenantA.token,
      existing.normalizedEmail,
    );

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitation.invitationToken, password })
      .expect(201);

    const memberships = await prisma.membership.findMany({
      where: { userId: existing.id },
      orderBy: { organizationId: 'asc' },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.map(({ organizationId }) => organizationId)).toEqual(
      expect.arrayContaining([
        tenantA.organization.id,
        tenantB.organization.id,
      ]),
    );
  });

  it('reactivates a concurrently-created suspended EMPLOYEE Membership as EMPLOYEE', async () => {
    const fixture = await createTenant();
    const user = await createUser();
    const invitation = await createInvitation(
      fixture.token,
      user.normalizedEmail,
    );
    const suspended = await addMembership(
      fixture.organization.id,
      MembershipRole.EMPLOYEE,
      user,
      MembershipStatus.SUSPENDED,
    );

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitation.invitationToken, password })
      .expect(201);

    expect(
      await prisma.membership.findUnique({
        where: { id: suspended.membership.id },
      }),
    ).toMatchObject({
      role: MembershipRole.EMPLOYEE,
      status: MembershipStatus.ACTIVE,
      membershipVersion: suspended.membership.membershipVersion + 1,
    });
  });

  it('rejects invalid, expired, revoked and reused tokens without creating Memberships', async () => {
    const fixture = await createTenant();

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: randomBytes(32).toString('base64url'), password })
      .expect(400);

    const expired = await createInvitation(fixture.token);
    await prisma.invitation.update({
      where: { id: expired.invitation.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: expired.invitationToken, password })
      .expect(400);
    const replacement = await createInvitation(
      fixture.token,
      expired.invitation.email,
    );
    expect(replacement.invitation.id).not.toBe(expired.invitation.id);

    const revoked = await createInvitation(fixture.token);
    await request(app.getHttpServer())
      .patch(
        `/api/v1/organizations/current/invitations/${revoked.invitation.id}/revoke`,
      )
      .set(authorized(fixture.token))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: revoked.invitationToken, password })
      .expect(400);

    const used = await createInvitation(fixture.token);
    const accepted = await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: used.invitationToken, password })
      .expect(201);
    userIds.push(accepted.body.user.id);
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: used.invitationToken, password })
      .expect(400);
  });

  it('does not consume an invitation when an existing User supplies a wrong password', async () => {
    const fixture = await createTenant();
    const user = await createUser();
    const invitation = await createInvitation(
      fixture.token,
      user.normalizedEmail,
    );

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({
        token: invitation.invitationToken,
        password: 'WrongPassword123!',
      })
      .expect(401);

    expect(
      await prisma.invitation.findUnique({
        where: { id: invitation.invitation.id },
      }),
    ).toMatchObject({ acceptedAt: null, revokedAt: null });
    expect(
      await prisma.membership.count({
        where: {
          organizationId: fixture.organization.id,
          userId: user.id,
        },
      }),
    ).toBe(0);
  });

  it('prevents duplicate pending invitations and invitations for existing Memberships', async () => {
    const fixture = await createTenant();
    const email = `duplicate-${sequence}@example.test`;
    await createInvitation(fixture.token, email);
    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(fixture.token))
      .send({ email })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(fixture.token))
      .send({ email: fixture.user.normalizedEmail })
      .expect(409);
  });

  it('serializes concurrent acceptance so the token creates one User and Membership', async () => {
    const fixture = await createTenant();
    const invitation = await createInvitation(fixture.token);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: invitation.invitationToken, password }),
      request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: invitation.invitationToken, password }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
    const user = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: invitation.invitation.email },
    });
    userIds.push(user.id);
    expect(
      await prisma.membership.count({
        where: {
          organizationId: fixture.organization.id,
          userId: user.id,
        },
      }),
    ).toBe(1);
  });

  it('serializes concurrent acceptance and revocation into one terminal outcome', async () => {
    const fixture = await createTenant();
    const invitation = await createInvitation(fixture.token);

    const [acceptance, revocation] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({ token: invitation.invitationToken, password }),
      request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/current/invitations/${invitation.invitation.id}/revoke`,
        )
        .set(authorized(fixture.token)),
    ]);

    expect([
      [201, 409],
      [400, 200],
    ]).toContainEqual([acceptance.status, revocation.status]);

    const persisted = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.invitation.id },
    });
    expect(Boolean(persisted.acceptedAt)).not.toBe(
      Boolean(persisted.revokedAt),
    );

    const user = await prisma.user.findUnique({
      where: { normalizedEmail: invitation.invitation.email },
    });
    if (acceptance.status === 201) {
      expect(user).not.toBeNull();
      userIds.push(user!.id);
      expect(
        await prisma.membership.count({
          where: {
            organizationId: fixture.organization.id,
            userId: user!.id,
          },
        }),
      ).toBe(1);
    } else {
      expect(user).toBeNull();
    }
  });

  it('rejects disabled existing Users and leaves the invitation pending', async () => {
    const fixture = await createTenant();
    const user = await createUser({ status: UserStatus.DISABLED });
    const invitation = await createInvitation(
      fixture.token,
      user.normalizedEmail,
    );

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitation.invitationToken, password })
      .expect(401);
    expect(
      await prisma.invitation.findUnique({
        where: { id: invitation.invitation.id },
      }),
    ).toMatchObject({ acceptedAt: null });
  });

  it('keeps Legacy independent and denies all invitation administration', async () => {
    sequence += 1;
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `INVITATION-LEGACY-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Administrator',
        email: `invitation-legacy-${sequence}@example.test`,
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
      .get('/api/v1/organizations/current/invitations')
      .set(authorized(login.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set(authorized(login.accessToken))
      .send({ email: `legacy-forbidden-${sequence}@example.test` })
      .expect(401);
    expect(
      await prisma.employee.findUnique({
        where: { id: employee.id },
        select: { organizationId: true, userId: true },
      }),
    ).toEqual({ organizationId: null, userId: null });
  });
});
