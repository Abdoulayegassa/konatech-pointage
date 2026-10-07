import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  PrismaClient,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { SanctionStatus } from '../src/modules/sanctions/sanction-engine.types';
import { SanctionsService } from '../src/modules/sanctions/sanctions.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

const context = (organizationId: string | null): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'user-a',
  membershipId: 'membership-a',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

const legacyContext: AuthenticationContext = {
  generation: 'legacy',
  purpose: 'account',
  userId: null,
  membershipId: null,
  organizationId: null,
  membershipRole: null,
  employeeId: 'legacy-employee',
  attendanceSiteId: null,
};

describe('Sanction rule tenant isolation (e2e)', () => {
  let prisma: PrismaClient;
  let service: SanctionsService;
  let organizationAId: string;
  let organizationBId: string;
  let tenantBRuleId: string;
  let tenantAEmployeeId: string;
  let tenantBEmployeeId: string;
  let tenantAAttendanceId: string;
  let tenantBAttendanceId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    service = new SanctionsService(
      prisma as unknown as PrismaService,
      new CalendarService(prisma as unknown as PrismaService),
    );

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Sanctions Tenant A',
          slug: 'sanctions-tenant-a',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Sanctions Tenant B',
          slug: 'sanctions-tenant-b',
          timezone: 'Etc/UTC',
        },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    await Promise.all([
      prisma.sanctionRule.create({
        data: {
          organizationId: organizationAId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          code: 'MINOR_LATENESS_DEFAULT',
          type: 'MINOR_LATENESS',
          name: 'Tenant A minor lateness',
          active: true,
          latenessMinMinutes: 0,
          latenessMinInclusive: false,
          latenessMaxMinutes: 15,
          latenessMaxInclusive: false,
          monthlyTolerance: 1,
          amountFcfa: 2_000,
          priority: 10,
          appliedReason: 'Tenant A minor sanction.',
        },
      }),
      prisma.sanctionRule.create({
        data: {
          organizationId: organizationAId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          code: 'MAJOR_LATENESS_DEFAULT',
          type: 'MAJOR_LATENESS',
          name: 'Tenant A major lateness',
          active: true,
          latenessMinMinutes: 15,
          latenessMinInclusive: true,
          latenessMaxMinutes: null,
          monthlyTolerance: 0,
          amountFcfa: 5_000,
          priority: 20,
          appliedReason: 'Tenant A major sanction.',
        },
      }),
    ]);

    const [tenantBMinorRule] = await Promise.all([
      prisma.sanctionRule.create({
        data: {
          organizationId: organizationBId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          code: 'TENANT_B_MINOR',
          type: 'MINOR_LATENESS',
          name: 'Tenant B minor lateness',
          active: true,
          latenessMinMinutes: 0,
          latenessMinInclusive: false,
          latenessMaxMinutes: 15,
          latenessMaxInclusive: false,
          monthlyTolerance: 0,
          amountFcfa: 9_000,
          priority: 1,
          appliedReason: 'Tenant B sanction.',
        },
      }),
      prisma.sanctionRule.create({
        data: {
          organizationId: organizationBId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          code: 'TENANT_B_MAJOR',
          type: 'MAJOR_LATENESS',
          name: 'Tenant B major lateness',
          active: true,
          latenessMinMinutes: 15,
          latenessMinInclusive: true,
          latenessMaxMinutes: null,
          monthlyTolerance: 0,
          amountFcfa: 12_000,
          priority: 2,
          appliedReason: 'Tenant B major sanction.',
        },
      }),
    ]);
    tenantBRuleId = tenantBMinorRule.id;

    const [employeeA, employeeB] = await Promise.all([
      prisma.employee.create({
        data: {
          employeeIdentifier: 'SANCTIONS-TENANT-A-001',
          firstName: 'Sanctions',
          lastName: 'Tenant A',
          email: 'sanctions-employee-a@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationAId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.employee.create({
        data: {
          employeeIdentifier: 'SANCTIONS-TENANT-B-001',
          firstName: 'Sanctions',
          lastName: 'Tenant B',
          email: 'sanctions-employee-b@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationBId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
    ]);
    const [attendanceA, attendanceB] = await Promise.all([
      prisma.attendance.create({
        data: {
          employeeId: employeeA.id,
          organizationId: organizationAId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          date: new Date('2027-01-11T00:00:00.000Z'),
          minutesLate: 10,
        },
      }),
      prisma.attendance.create({
        data: {
          employeeId: employeeB.id,
          organizationId: organizationBId,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          date: new Date('2027-01-11T00:00:00.000Z'),
          minutesLate: 10,
        },
      }),
    ]);
    tenantAEmployeeId = employeeA.id;
    tenantBEmployeeId = employeeB.id;
    tenantAAttendanceId = attendanceA.id;
    tenantBAttendanceId = attendanceB.id;
  });

  afterAll(async () => {
    if (prisma && organizationAId && organizationBId) {
      const organizationIds = [organizationAId, organizationBId];
      await prisma.attendance.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sanctionRule.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.attendanceSite.deleteMany({
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
    }
    await prisma?.$disconnect();
  });

  it('lists only rules from the authenticated organization', async () => {
    const rules = await service.getRules(context(organizationAId));

    expect(rules.map((rule) => rule.code)).toEqual(
      expect.arrayContaining([
        'MINOR_LATENESS_DEFAULT',
        'MAJOR_LATENESS_DEFAULT',
      ]),
    );
    expect(rules.map((rule) => rule.code)).not.toContain('TENANT_B_MINOR');
  });

  it('rejects retrieval of a rule from another organization', async () => {
    await expect(
      service.getRuleById(tenantBRuleId, context(organizationAId)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects update of a rule from another organization', async () => {
    await expect(
      service.updateRule(
        tenantBRuleId,
        { amountFcfa: 1 },
        context(organizationAId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      await prisma.sanctionRule.findUniqueOrThrow({
        where: { id: tenantBRuleId },
      }),
    ).toMatchObject({ amountFcfa: 9_000 });
  });

  it('rejects cross-tenant rule lookup by code', async () => {
    await expect(
      service.getRuleByCode('TENANT_B_MINOR', context(organizationAId)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forces creation into the authenticated organization', async () => {
    const rule = await service.createRule(
      {
        type: 'MINOR_LATENESS',
        code: 'TENANT_A_INACTIVE_CUSTOM',
        name: 'Tenant A inactive custom rule',
        active: false,
        latenessMinMinutes: 1,
        latenessMaxMinutes: 5,
        monthlyTolerance: 0,
        amountFcfa: 100,
        priority: 100,
        appliedReason: 'Inactive test rule.',
      },
      context(organizationAId),
    );
    const persisted = await prisma.sanctionRule.findUniqueOrThrow({
      where: { id: rule?.id },
    });

    expect(persisted.organizationId).toBe(organizationAId);
  });

  it('rejects client organizationId spoofing', async () => {
    await expect(
      service.createRule(
        {
          type: 'MINOR_LATENESS',
          code: 'SPOOFED_RULE',
          name: 'Spoofed rule',
          active: false,
          monthlyTolerance: 0,
          amountFcfa: 0,
          priority: 200,
          appliedReason: 'Must not persist.',
          organizationId: organizationBId,
        } as never,
        context(organizationAId),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['employeeId', 'scheduleId', 'siteId'])(
    'rejects a forged client %s in a sanction rule payload',
    async (field) => {
      await expect(
        service.createRule(
          {
            type: 'MINOR_LATENESS',
            code: `FORGED_${field.toUpperCase()}`,
            name: 'Forged reference rule',
            active: false,
            latenessMinMinutes: 1,
            latenessMaxMinutes: 5,
            monthlyTolerance: 0,
            amountFcfa: 0,
            priority: 201,
            appliedReason: 'Must not persist.',
            [field]: '00000000-0000-4000-8000-000000000001',
          } as never,
          context(organizationAId),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects a foreign employee filter instead of returning an ambiguous empty result', async () => {
    await expect(
      service.getMonthlySanctions(
        '2027-01',
        tenantBEmployeeId,
        context(organizationAId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.getMonthlySanctions(
        '2027-01',
        tenantAEmployeeId,
        context(organizationAId),
      ),
    ).resolves.toHaveLength(1);
  });

  it('rejects a SaaS request without organization context', async () => {
    await expect(service.getRules(context(null))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('keeps the historical default sanction rules usable and unchanged', async () => {
    const minor = await service.getRuleByCode(
      'MINOR_LATENESS_DEFAULT',
      context(organizationAId),
    );
    const major = await service.getRuleByCode(
      'MAJOR_LATENESS_DEFAULT',
      context(organizationAId),
    );

    expect(minor).toMatchObject({
      monthlyTolerance: 1,
      amount: 2_000,
      priority: 10,
      latenessMinMinutes: 0,
      latenessMaxMinutes: 15,
    });
    expect(major).toMatchObject({
      monthlyTolerance: 0,
      amount: 5_000,
      priority: 20,
      latenessMinMinutes: 15,
      latenessMaxMinutes: null,
    });
  });

  it('calculates sanctions with rules from the authenticated organization only', async () => {
    const result = await service.getAttendanceSanction(
      tenantAAttendanceId,
      context(organizationAId),
    );

    expect(result).toMatchObject({
      status: SanctionStatus.TOLERATED,
      amount: 0,
    });
    await expect(
      service.getAttendanceSanction(
        tenantBAttendanceId,
        context(organizationAId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('excludes review-required attendance from operational sanction results', async () => {
    const reviewAttendance = await prisma.attendance.create({
      data: {
        employeeId: tenantAEmployeeId,
        organizationId: organizationAId,
        date: new Date('2027-01-12T00:00:00.000Z'),
        minutesLate: 20,
        v1ScopeStatus: V1OperationalScopeStatus.REVIEW_REQUIRED,
      },
    });

    await expect(
      service.getAttendanceSanction(reviewAttendance.id, context(organizationAId)),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getMonthlySanctions('2027-01', tenantAEmployeeId, context(organizationAId)),
    ).resolves.toHaveLength(1);
  });

  it('fails closed for unsupported site-scoped rules', async () => {
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: organizationAId,
        name: 'Unsupported sanction rule site',
        latitude: 5.35,
        longitude: -4.01,
        allowedRadiusMeters: 100,
      },
    });
    await prisma.sanctionRule.create({
      data: {
        organizationId: organizationAId,
        siteId: site.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        code: 'UNSUPPORTED_SITE_SCOPE',
        type: 'MAJOR_LATENESS',
        name: 'Unsupported site scope',
        active: true,
        latenessMinMinutes: 15,
        monthlyTolerance: 0,
        amountFcfa: 100,
        priority: 1,
        appliedReason: 'Must remain excluded.',
      },
    });

    expect((await service.getRules(context(organizationAId))).map((rule) => rule.code)).not.toContain(
      'UNSUPPORTED_SITE_SCOPE',
    );
  });

  it('keeps Legacy database rules isolated from tenant rules', async () => {
    const rules = await service.getRules(legacyContext);

    expect(rules).toHaveLength(2);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'MINOR_LATENESS',
          monthlyTolerance: 1,
          amount: 2_000,
        }),
        expect.objectContaining({
          type: 'MAJOR_LATENESS',
          monthlyTolerance: 0,
          amount: 5_000,
        }),
      ]),
    );
    expect(rules.map((rule) => rule.code)).not.toContain('TENANT_B_MINOR');
  });
});
