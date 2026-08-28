import { createHmac } from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
} from '@prisma/client';
import {
  SignableJwtPayload,
  signJwtToken,
  verifyJwtToken,
} from '../src/common/security/jwt.util';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../src/modules/auth/interfaces/organization-context.helpers';

const secret = 'auth-foundation-test-secret-at-least-32-characters';

function employee(
  overrides: Partial<{
    id: string;
    accessRole: AccessRole;
    isActive: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? 'employee-1',
    employeeIdentifier: 'EMP-2026-001',
    firstName: 'Awa',
    lastName: 'Traore',
    email: 'awa@example.com',
    role: 'Direction',
    accessRole: overrides.accessRole ?? AccessRole.ADMIN,
    department: null,
    isActive: overrides.isActive ?? true,
    scheduleId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function createPrismaMock() {
  return {
    employee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    membership: { findUnique: jest.fn(), findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    attendanceSite: { findUnique: jest.fn() },
  };
}

function createService(prisma = createPrismaMock()) {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return secret;
      throw new Error(`Unexpected config key ${key}`);
    }),
    get: jest.fn((key: string) => {
      if (key === 'JWT_EXPIRES_IN') return '1d';
      if (key === 'ATTENDANCE_ENTRY_JWT_EXPIRES_IN') return '15m';
      return undefined;
    }),
  };

  return {
    prisma,
    service: new AuthService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    ),
  };
}

function legacyToken(overrides: Record<string, unknown> = {}) {
  return signJwtToken(
    {
      sub: 'employee-1',
      email: 'awa@example.com',
      ...overrides,
    } as unknown as SignableJwtPayload,
    secret,
    '1h',
  );
}

function accountToken(overrides: Record<string, unknown> = {}) {
  return signJwtToken(
    {
      sub: 'user-1',
      membershipId: 'membership-1',
      organizationId: 'organization-1',
      purpose: 'account',
      userVersion: 1,
      membershipVersion: 1,
      ...overrides,
    } as unknown as SignableJwtPayload,
    secret,
    '1h',
  );
}

function attendanceEntryToken(overrides: Record<string, unknown> = {}) {
  return signJwtToken(
    {
      sub: 'employee-1',
      organizationId: 'organization-1',
      attendanceSiteId: 'site-1',
      purpose: 'attendance_entry',
      ...overrides,
    } as unknown as SignableJwtPayload,
    secret,
    '15m',
  );
}

function forgeToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode(payload);
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

function prepareValidAccount(prisma: ReturnType<typeof createPrismaMock>) {
  prisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    status: UserStatus.ACTIVE,
    userVersion: 1,
  });
  prisma.membership.findUnique.mockResolvedValue({
    id: 'membership-1',
    userId: 'user-1',
    organizationId: 'organization-1',
    role: MembershipRole.OWNER,
    status: MembershipStatus.ACTIVE,
    membershipVersion: 1,
  });
  prisma.organization.findUnique.mockResolvedValue({
    id: 'organization-1',
    status: OrganizationStatus.ACTIVE,
  });
  prisma.employee.findFirst.mockResolvedValue(employee());
}

function roleExecutionContext(request: Record<string, unknown>) {
  return {
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createRolesGuard(requiredRole: AccessRole) {
  const reflector = {
    getAllAndOverride: jest.fn(() => [requiredRole]),
  };

  return new RolesGuard(reflector as unknown as Reflector);
}

describe('Phase 1C.2 authentication foundation', () => {
  describe('JWT validation', () => {
    it('accepts valid legacy, account and attendance-entry payloads', () => {
      expect(verifyJwtToken(legacyToken(), secret)).toMatchObject({
        sub: 'employee-1',
        email: 'awa@example.com',
      });
      expect(verifyJwtToken(accountToken(), secret)).toMatchObject({
        purpose: 'account',
        membershipId: 'membership-1',
      });
      expect(verifyJwtToken(attendanceEntryToken(), secret)).toMatchObject({
        purpose: 'attendance_entry',
        attendanceSiteId: 'site-1',
      });
    });

    it.each([
      ['sub', { sub: 42 }],
      ['organizationId', { organizationId: 42 }],
      ['membershipId', { membershipId: 42 }],
      ['userVersion', { userVersion: '1' }],
      ['membershipVersion', { membershipVersion: 1.5 }],
    ])('rejects an invalid %s claim', (_claim, override) => {
      expect(() => verifyJwtToken(accountToken(override), secret)).toThrow();
    });

    it('rejects malformed expiration and malformed purpose', () => {
      const now = Math.floor(Date.now() / 1000);

      expect(() =>
        verifyJwtToken(
          forgeToken({ sub: 'user-1', iat: now, exp: 'later', purpose: 'account' }),
          secret,
        ),
      ).toThrow();
      expect(() =>
        verifyJwtToken(
          forgeToken({ sub: 'user-1', iat: now, exp: now + 60, purpose: 'admin' }),
          secret,
        ),
      ).toThrow('Invalid JWT purpose.');
    });

    it('rejects expired tokens and invalid signatures', () => {
      expect(() => verifyJwtToken(legacyToken(), `${secret}-wrong`)).toThrow(
        'Invalid JWT signature.',
      );
      expect(() =>
        verifyJwtToken(
          forgeToken({
            sub: 'employee-1',
            email: 'awa@example.com',
            iat: 1,
            exp: 2,
          }),
          secret,
        ),
      ).toThrow('JWT token has expired.');
    });
  });

  describe('legacy authentication', () => {
    it.each([AccessRole.ADMIN, AccessRole.EMPLOYEE])(
      'preserves the legacy %s role',
      async (accessRole) => {
        const { prisma, service } = createService();
        prisma.employee.findUnique.mockResolvedValue(employee({ accessRole }));

        const result = await service.getAuthenticationFromToken(legacyToken());

        expect(result.employee?.accessRole).toBe(accessRole);
        expect(result.context).toMatchObject({
          generation: 'legacy',
          employeeId: 'employee-1',
          purpose: 'account',
        });
      },
    );

    it.each([null, employee({ isActive: false })])(
      'rejects a missing or inactive Employee',
      async (record) => {
        const { prisma, service } = createService();
        prisma.employee.findUnique.mockResolvedValue(record);

        await expect(
          service.getAuthenticationFromToken(legacyToken()),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      },
    );

    it('rejects an invalid legacy token', async () => {
      const { service } = createService();

      await expect(
        service.getAuthenticationFromToken(`${legacyToken()}broken`),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('SaaS account authentication', () => {
    it('validates User, Membership and Organization and resolves Employee.userId', async () => {
      const { prisma, service } = createService();
      prepareValidAccount(prisma);

      const result = await service.getAuthenticationFromToken(accountToken());

      expect(prisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', organizationId: 'organization-1' },
        }),
      );
      expect(result.context).toEqual({
        generation: 'saas',
        purpose: 'account',
        userId: 'user-1',
        membershipId: 'membership-1',
        organizationId: 'organization-1',
        membershipRole: MembershipRole.OWNER,
        employeeId: 'employee-1',
        attendanceSiteId: null,
      });
    });

    it('supports a User without an Employee profile', async () => {
      const { prisma, service } = createService();
      prepareValidAccount(prisma);
      prisma.employee.findFirst.mockResolvedValue(null);

      const result = await service.getAuthenticationFromToken(accountToken());

      expect(result.employee).toBeNull();
      expect(result.context.employeeId).toBeNull();
    });

    it.each([
      ['disabled User', () => ({ user: { status: UserStatus.DISABLED } })],
      ['user version mismatch', () => ({ user: { userVersion: 2 } })],
      ['suspended Membership', () => ({ membership: { status: MembershipStatus.SUSPENDED } })],
      ['membership version mismatch', () => ({ membership: { membershipVersion: 2 } })],
      ['Membership for another User', () => ({ membership: { userId: 'user-2' } })],
      ['Membership for another Organization', () => ({ membership: { organizationId: 'organization-2' } })],
      ['inactive Organization', () => ({ organization: { status: OrganizationStatus.SUSPENDED } })],
    ])('rejects %s', async (_label, buildOverride) => {
      const { prisma, service } = createService();
      prepareValidAccount(prisma);
      const override = buildOverride();

      if ('user' in override) {
        prisma.user.findUnique.mockResolvedValue({
          id: 'user-1', status: UserStatus.ACTIVE, userVersion: 1, ...override.user,
        });
      }
      if ('membership' in override) {
        prisma.membership.findUnique.mockResolvedValue({
          id: 'membership-1', userId: 'user-1', organizationId: 'organization-1',
          role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE,
          membershipVersion: 1, ...override.membership,
        });
      }
      if ('organization' in override) {
        prisma.organization.findUnique.mockResolvedValue(
          Object.assign(
            { id: 'organization-1', status: OrganizationStatus.ACTIVE },
            override.organization,
          ),
        );
      }

      await expect(
        service.getAuthenticationFromToken(accountToken()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects organizationId mismatch from the token', async () => {
      const { prisma, service } = createService();
      prepareValidAccount(prisma);

      await expect(
        service.getAuthenticationFromToken(
          accountToken({ organizationId: 'organization-2' }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('purpose isolation', () => {
    it('rejects account tokens in attendance-entry context', async () => {
      const { service } = createService();
      await expect(
        service.getAuthenticationFromToken(accountToken(), 'attendance_entry'),
      ).rejects.toThrow('Token purpose is not allowed');
    });

    it('rejects attendance-entry tokens in account context', async () => {
      const { service } = createService();
      await expect(
        service.getAuthenticationFromToken(attendanceEntryToken(), 'account'),
      ).rejects.toThrow('Token purpose is not allowed');
    });

    it('keeps purpose-less legacy tokens compatible with either context', async () => {
      const { prisma, service } = createService();
      prisma.employee.findUnique.mockResolvedValue(employee({ accessRole: AccessRole.EMPLOYEE }));

      await expect(
        service.getAuthenticationFromToken(legacyToken(), 'account'),
      ).resolves.toHaveProperty('context.purpose', 'account');
      await expect(
        service.getAuthenticationFromToken(legacyToken(), 'attendance_entry'),
      ).resolves.toHaveProperty('context.purpose', 'attendance_entry');
    });
  });

  describe('RBAC compatibility', () => {
    it('keeps legacy ADMIN allowed and legacy EMPLOYEE denied on ADMIN routes', () => {
      const guard = createRolesGuard(AccessRole.ADMIN);

      expect(
        guard.canActivate(roleExecutionContext({ user: employee() })),
      ).toBe(true);
      expect(() =>
        guard.canActivate(
          roleExecutionContext({
            user: employee({ accessRole: AccessRole.EMPLOYEE }),
          }),
        ),
      ).toThrow('Insufficient permissions');
    });

    it.each([MembershipRole.OWNER, MembershipRole.ADMIN])(
      'allows SaaS %s Membership on legacy ADMIN routes',
      (membershipRole) => {
        const guard = createRolesGuard(AccessRole.ADMIN);
        const authentication: AuthenticationContext = {
          generation: 'saas',
          purpose: 'account',
          userId: 'user-1',
          membershipId: 'membership-1',
          organizationId: 'organization-1',
          membershipRole,
          employeeId: null,
          attendanceSiteId: null,
        };

        expect(
          guard.canActivate(roleExecutionContext({ authentication })),
        ).toBe(true);
      },
    );

    it('denies attendance-entry purpose on account-authorized routes', () => {
      const guard = createRolesGuard(AccessRole.EMPLOYEE);
      const authentication: AuthenticationContext = {
        generation: 'saas',
        purpose: 'attendance_entry',
        userId: null,
        membershipId: null,
        organizationId: 'organization-1',
        membershipRole: null,
        employeeId: 'employee-1',
        attendanceSiteId: 'site-1',
      };

      expect(() =>
        guard.canActivate(roleExecutionContext({ authentication })),
      ).toThrow('cannot access account resources');
    });
  });

  describe('organization context resolution', () => {
    const activeMembership = (organizationId: string, id: string) => ({
      id,
      userId: 'user-1',
      organizationId,
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    });

    it('discovers only active organizations for the authenticated user', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', status: UserStatus.ACTIVE });
      prisma.membership.findMany.mockResolvedValue([
        {
          id: 'membership-a', role: MembershipRole.OWNER,
          organization: { id: 'organization-a', name: 'A', slug: 'a', status: OrganizationStatus.ACTIVE },
        },
        {
          id: 'membership-suspended', role: MembershipRole.ADMIN,
          organization: { id: 'organization-c', name: 'C', slug: 'c', status: OrganizationStatus.SUSPENDED },
        },
      ]);

      await expect(service.getAvailableOrganizations('user-1')).resolves.toEqual([
        { id: 'organization-a', name: 'A', slug: 'a', role: MembershipRole.OWNER },
      ]);
    });

    it('issues a validated account token for an explicitly selected organization', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user-1', status: UserStatus.ACTIVE })
        .mockResolvedValueOnce({ userVersion: 1 });
      prisma.membership.findUnique
        .mockResolvedValueOnce(activeMembership('organization-a', 'membership-a'))
        .mockResolvedValueOnce({
          membershipVersion: 3,
          organization: { id: 'organization-a', name: 'A', slug: 'a' },
        });
      prisma.organization.findUnique.mockResolvedValue({
        id: 'organization-a', status: OrganizationStatus.ACTIVE,
      });
      prisma.employee.findFirst.mockResolvedValue(null);

      const result = await service.selectOrganization('user-1', 'organization-a');
      expect(result).toMatchObject({
        tokenType: 'Bearer',
        organization: { id: 'organization-a' },
        membership: { id: 'membership-a', role: MembershipRole.ADMIN },
        employeeId: null,
      });
      expect(verifyJwtToken(result.accessToken, secret)).toMatchObject({
        sub: 'user-1', membershipId: 'membership-a',
        organizationId: 'organization-a', purpose: 'account',
        userVersion: 1, membershipVersion: 3,
      });
    });

    it('resolves one active organization and supports an owner without Employee', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });
      prisma.membership.findMany.mockResolvedValue([
        activeMembership('organization-a', 'membership-a'),
      ]);
      prisma.organization.findUnique.mockResolvedValue({
        id: 'organization-a',
        status: OrganizationStatus.ACTIVE,
      });
      prisma.employee.findFirst.mockResolvedValue(null);

      const result = await service.resolveOrganizationContext('user-1');

      expect(result.context).toMatchObject({
        userId: 'user-1',
        membershipId: 'membership-a',
        organizationId: 'organization-a',
        employeeId: null,
        membershipRole: MembershipRole.ADMIN,
      });
    });

    it('requires explicit selection when multiple organizations are active', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });
      prisma.membership.findMany.mockResolvedValue([
        activeMembership('organization-a', 'membership-a'),
        activeMembership('organization-b', 'membership-b'),
      ]);
      prisma.organization.findUnique.mockResolvedValue({
        id: 'organization-a',
        status: OrganizationStatus.ACTIVE,
      });

      await expect(
        service.resolveOrganizationContext('user-1'),
      ).rejects.toThrow('explicit organization selection');
    });

    it('accepts an explicitly selected organization only through the authenticated membership', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });
      prisma.membership.findUnique.mockResolvedValue(
        activeMembership('organization-b', 'membership-b'),
      );
      prisma.organization.findUnique.mockResolvedValue({
        id: 'organization-b',
        status: OrganizationStatus.ACTIVE,
      });
      prisma.employee.findFirst.mockResolvedValue(
        employee({ id: 'employee-b' }),
      );

      const result = await service.resolveOrganizationContext(
        'user-1',
        'organization-b',
      );

      expect(prisma.membership.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_userId: {
              organizationId: 'organization-b',
              userId: 'user-1',
            },
          },
        }),
      );
      expect(result.context.organizationId).toBe('organization-b');
      expect(result.context.employeeId).toBe('employee-b');
    });

    it.each([
      ['zero memberships', []],
      ['suspended membership', [{ ...activeMembership('organization-a', 'membership-a'), status: MembershipStatus.SUSPENDED }]],
      ['revoked membership', [{ ...activeMembership('organization-a', 'membership-a'), status: MembershipStatus.REVOKED }]],
    ])('rejects %s', async (_label, memberships) => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });
      prisma.membership.findMany.mockResolvedValue(memberships);

      await expect(
        service.resolveOrganizationContext('user-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects suspended organizations and mismatched requested memberships', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });
      prisma.membership.findUnique.mockResolvedValue(
        activeMembership('organization-a', 'membership-a'),
      );
      prisma.organization.findUnique.mockResolvedValue({
        id: 'organization-a',
        status: OrganizationStatus.SUSPENDED,
      });

      await expect(
        service.resolveOrganizationContext('user-1', 'organization-b'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('narrows only SaaS account contexts to OrganizationContext', () => {
      const valid: AuthenticationContext = {
        generation: 'saas',
        purpose: 'account',
        userId: 'user-1',
        membershipId: 'membership-a',
        organizationId: 'organization-a',
        membershipRole: MembershipRole.OWNER,
        employeeId: null,
        attendanceSiteId: null,
      };
      const legacy: AuthenticationContext = {
        ...valid,
        generation: 'legacy',
        userId: null,
        membershipId: null,
        organizationId: null,
        membershipRole: null,
        employeeId: 'employee-1',
      };
      const attendance: AuthenticationContext = {
        ...legacy,
        generation: 'saas',
        purpose: 'attendance_entry',
        organizationId: 'organization-a',
        attendanceSiteId: 'site-a',
      };

      expect(requireOrganizationContext(valid).organizationId).toBe(
        'organization-a',
      );
      expect(() => requireOrganizationContext(legacy)).toThrow();
      expect(() => requireOrganizationContext(attendance)).toThrow();
    });
  });
});
