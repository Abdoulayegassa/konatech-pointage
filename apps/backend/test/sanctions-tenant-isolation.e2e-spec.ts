import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
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
  let tenantAAttendanceId: string;
  let tenantBAttendanceId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    service = new SanctionsService(prisma as unknown as PrismaService);

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
      prisma.sanctionRule.update({
        where: { id: '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001' },
        data: {
          organizationId: organizationAId,
          code: 'MINOR_LATENESS_DEFAULT',
        },
      }),
      prisma.sanctionRule.update({
        where: { id: '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002' },
        data: {
          organizationId: organizationAId,
          code: 'MAJOR_LATENESS_DEFAULT',
        },
      }),
    ]);

    const [tenantBMinorRule] = await Promise.all([
      prisma.sanctionRule.create({
        data: {
          organizationId: organizationBId,
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

    const [employeeA, employeeB] = await prisma.employee.findMany({
      take: 2,
      orderBy: { employeeIdentifier: 'asc' },
    });
    await Promise.all([
      prisma.employee.update({
        where: { id: employeeA.id },
        data: { organizationId: organizationAId },
      }),
      prisma.employee.update({
        where: { id: employeeB.id },
        data: { organizationId: organizationBId },
      }),
    ]);
    const [attendanceA, attendanceB] = await Promise.all([
      prisma.attendance.create({
        data: {
          employeeId: employeeA.id,
          organizationId: organizationAId,
          date: new Date('2027-01-10T00:00:00.000Z'),
          minutesLate: 10,
        },
      }),
      prisma.attendance.create({
        data: {
          employeeId: employeeB.id,
          organizationId: organizationBId,
          date: new Date('2027-01-10T00:00:00.000Z'),
          minutesLate: 10,
        },
      }),
    ]);
    tenantAAttendanceId = attendanceA.id;
    tenantBAttendanceId = attendanceB.id;
  });

  afterAll(async () => {
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

  it('preserves legacy global sanction behavior', async () => {
    const rules = await service.getRules(legacyContext);

    expect(rules.map((rule) => rule.code)).toEqual(
      expect.arrayContaining([
        'MINOR_LATENESS_DEFAULT',
        'MAJOR_LATENESS_DEFAULT',
        'TENANT_B_MINOR',
      ]),
    );
  });
});
