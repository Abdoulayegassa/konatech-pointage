import {
  ConflictException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PublicEmployee,
  publicEmployeeSelect,
} from '../../common/prisma/selects';
import {
  AccountJwtPayload,
  AttendanceEntryJwtPayload,
  isAccountJwtPayload,
  isPlatformJwtPayload,
  isLegacyJwtPayload,
  isOrganizationSelectionJwtPayload,
  OrganizationSelectionJwtPayload,
  signJwtToken,
  verifyJwtToken,
} from '../../common/security/jwt.util';
import {
  hashPinCode,
  verifyPassword,
  verifyPinCode,
} from '../../common/security/password.util';
import {
  ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
  DEFAULT_ATTENDANCE_ENTRY_JWT_EXPIRES_IN,
} from './constants/attendance-entry.constants';
import { AttendanceEntryLoginDto } from './dto/attendance-entry-login.dto';
import { AttendanceSitesService } from '../attendance-sites/attendance-sites.service';
import { LoginDto } from './dto/login.dto';
import {
  AuthenticationResult,
  ExpectedAuthenticationPurpose,
} from './interfaces/authentication-context.interface';

type LoginEmployee = PublicEmployee & {
  passwordHash: string;
  userId: string | null;
  organizationId: string | null;
};

type AttendanceEntryLoginEmployee = PublicEmployee & {
  pinCode: string | null;
  pinCodeHash: string | null;
  userId: string | null;
  organizationId: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly attendanceSites?: AttendanceSitesService,
  ) {}

  async login(loginDto: LoginDto) {
    const normalizedEmail = this.normalizeEmail(loginDto.email);
    const user = await this.prisma.user.findUnique({
      where: {
        normalizedEmail,
      },
      select: {
        id: true,
        normalizedEmail: true,
        passwordHash: true,
        status: true,
        userVersion: true,
        platformAdmin: { select: { id: true, isActive: true, version: true } },
      },
    });

    if (user) {
      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Invalid credentials.');
      }

      const passwordValid = await verifyPassword(
        loginDto.password,
        user.passwordHash,
      );

      if (!passwordValid) {
        throw new UnauthorizedException('Invalid credentials.');
      }

      if (user.platformAdmin?.isActive) {
        return {
          accessToken: signJwtToken(
            {
              sub: user.id,
              purpose: 'platform',
              platformAdminId: user.platformAdmin.id,
              userVersion: user.userVersion,
              platformAdminVersion: user.platformAdmin.version,
            },
            this.getJwtSecret(),
            this.getJwtExpiresIn(),
          ),
          tokenType: 'Bearer' as const,
          expiresIn: this.getJwtExpiresIn(),
          platformAdmin: true as const,
        } as never;
      }

      const organizations = await this.getAvailableMembershipOrganizations(
        user.id,
      );

      if (organizations.length === 0) {
        throw new UnauthorizedException('Invalid credentials.');
      }

      if (organizations.length > 1) {
        return {
          organizationSelectionRequired: true as const,
          organizationSelectionChallenge:
            this.createOrganizationSelectionChallenge({
              userId: user.id,
              userVersion: user.userVersion,
              candidates: organizations.map((organization) => ({
                organizationId: organization.id,
                membershipId: organization.membershipId,
                membershipVersion: organization.membershipVersion,
              })),
            }),
          organizations: organizations.map(({ id, name, slug }) => ({
            id,
            name,
            slug,
          })),
        };
      }

      return this.selectOrganization(user.id, organizations[0].id);
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        email: normalizedEmail,
        organizationId: null,
        userId: null,
      },
      select: {
        ...publicEmployeeSelect,
        passwordHash: true,
        userId: true,
        organizationId: true,
        v1ScopeStatus: true,
      },
    });

    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordValid = await verifyPassword(
      loginDto.password,
      employee.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return this.buildLegacyLoginResponse(employee, this.getJwtExpiresIn());
  }

  async loginForAttendanceEntry(
    attendanceEntryLoginDto: AttendanceEntryLoginDto,
  ) {
    const normalizedPinCode = attendanceEntryLoginDto.pinCode.trim();
    const attendanceSite = attendanceEntryLoginDto.sitePublicId
      ? await this.requireAttendanceSites().resolvePublicActiveSite(
          attendanceEntryLoginDto.sitePublicId,
        )
      : null;

    const employees = await this.prisma.employee.findMany({
      where: {
        accessRole: AccessRole.EMPLOYEE,
        isActive: true,
        ...(attendanceSite
          ? { organizationId: attendanceSite.organizationId }
          : { organizationId: null, userId: null }),
        OR: [
          {
            pinCodeHash: {
              not: null,
            },
          },
          {
            pinCode: {
              not: null,
            },
          },
        ],
      },
      select: {
        ...publicEmployeeSelect,
        pinCode: true,
        pinCodeHash: true,
        userId: true,
        organizationId: true,
        v1ScopeStatus: true,
      },
    });

    const matches: typeof employees = [];
    for (const employee of employees) {
      const matchesHash =
        employee.pinCodeHash &&
        (await verifyPinCode(normalizedPinCode, employee.pinCodeHash));
      const matchesLegacyPin =
        !employee.pinCodeHash && employee.pinCode === normalizedPinCode;

      if (matchesHash || matchesLegacyPin) {
        matches.push(employee);
      }
    }

    if (matches.length !== 1) {
      throw new UnauthorizedException(
        ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
      );
    }

    const employee = matches[0];
    if (attendanceSite && employee.organizationId) {
      const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
      const assignment = await this.prisma.employeeSiteAssignment.findFirst({
        where: { organizationId: employee.organizationId, employeeId: employee.id, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }] },
        select: { siteId: true },
      });
      if (employee.v1ScopeStatus !== V1OperationalScopeStatus.OPERATIONAL || assignment?.siteId !== attendanceSite.id) {
        throw new UnauthorizedException(ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE);
      }
    }
    await this.assertAttendanceEmployeeAccountAccess(
      employee,
      ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
    );

    if (!employee.pinCodeHash) {
      const migratedEmployee = await this.migrateLegacyPinCode(
        employee,
        normalizedPinCode,
      );
      return this.buildAttendanceEntryLoginResponse(
        migratedEmployee,
        attendanceSite?.id,
      );
    }

    return this.buildAttendanceEntryLoginResponse(employee, attendanceSite?.id);
  }

  async getAuthenticatedUserFromToken(token: string) {
    const authentication = await this.getAuthenticationFromToken(token);

    if (!authentication.employee) {
      throw new UnauthorizedException(
        'This account is not linked to an employee profile.',
      );
    }

    return authentication.employee;
  }

  async getAuthenticationFromToken(
    token: string,
    expectedPurpose: ExpectedAuthenticationPurpose = 'any',
  ): Promise<AuthenticationResult> {
    let payload: ReturnType<typeof verifyJwtToken>;

    try {
      payload = verifyJwtToken(token, this.getJwtSecret());
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    this.assertExpectedPurpose(payload, expectedPurpose);

    if (isLegacyJwtPayload(payload)) {
      return this.authenticateLegacyEmployee(
        payload.sub,
        expectedPurpose === 'attendance_entry' ? 'attendance_entry' : 'account',
      );
    }

    if (isAccountJwtPayload(payload)) {
      return this.authenticateSaasAccount(payload);
    }

    if (isPlatformJwtPayload(payload)) {
      return this.authenticatePlatformAdmin(payload);
    }

    if (isOrganizationSelectionJwtPayload(payload)) {
      throw new UnauthorizedException(
        'Organization-selection challenges cannot authenticate requests.',
      );
    }

    if (payload.purpose === 'offline_attendance_context') {
      throw new UnauthorizedException(
        'Offline attendance contexts cannot authenticate requests.',
      );
    }

    return this.authenticateAttendanceEntry(payload);
  }

  async resolveOrganizationContext(
    userId: string,
    requestedOrganizationId?: string,
  ): Promise<AuthenticationResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is no longer active.');
    }

    const organizationId = requestedOrganizationId?.trim() || undefined;
    const memberships = organizationId
      ? await this.prisma.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: user.id,
            },
          },
          select: {
            id: true,
            userId: true,
            organizationId: true,
            role: true,
            status: true,
          },
        })
      : await this.prisma.membership.findMany({
          where: { userId: user.id, status: MembershipStatus.ACTIVE },
          select: {
            id: true,
            userId: true,
            organizationId: true,
            role: true,
            status: true,
          },
        });
    const candidates = (
      Array.isArray(memberships)
        ? memberships
        : memberships
          ? [memberships]
          : []
    ).filter(
      (membership) =>
        membership.userId === user.id &&
        membership.status === MembershipStatus.ACTIVE,
    );
    const activeCandidates = (
      await Promise.all(
        candidates.map(async (membership) => {
          const organization = await this.prisma.organization.findUnique({
            where: { id: membership.organizationId },
            select: { id: true, status: true },
          });

          return organization?.status === OrganizationStatus.ACTIVE
            ? { membership, organization }
            : null;
        }),
      )
    ).filter(
      (
        candidate,
      ): candidate is {
        membership: (typeof candidates)[number];
        organization: { id: string; status: OrganizationStatus };
      } => candidate !== null,
    );

    if (activeCandidates.length === 0) {
      throw new UnauthorizedException('No active organization membership.');
    }

    if (!organizationId && activeCandidates.length > 1) {
      throw new ConflictException(
        'An explicit organization selection is required.',
      );
    }

    const selected = activeCandidates[0];
    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: selected.organization.id,
      },
      select: publicEmployeeSelect,
    });

    return {
      context: {
        generation: 'saas',
        purpose: 'account',
        userId: user.id,
        membershipId: selected.membership.id,
        organizationId: selected.organization.id,
        membershipRole: selected.membership.role,
        employeeId: employee?.id ?? null,
        attendanceSiteId: null,
        sessionBinding: null,
      },
      employee,
    };
  }

  async getAvailableOrganizations(userId: string) {
    const organizations =
      await this.getAvailableMembershipOrganizations(userId);

    return organizations.map(({ id, name, slug, role }) => ({
      id,
      name,
      slug,
      role,
    }));
  }

  private async getAvailableMembershipOrganizations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is no longer active.');
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
      select: {
        id: true,
        role: true,
        membershipVersion: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            timezone: true,
            status: true,
          },
        },
      },
    });

    return memberships
      .filter(
        ({ organization }) => organization.status === OrganizationStatus.ACTIVE,
      )
      .map(({ id: membershipId, organization, role, membershipVersion }) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        timezone: organization.timezone,
        role,
        membershipId,
        membershipVersion,
      }));
  }

  async completeInitialOrganizationSelection(
    challenge: string,
    selectedOrganizationId: string,
  ) {
    let payload: OrganizationSelectionJwtPayload;

    try {
      const verified = verifyJwtToken(challenge, this.getJwtSecret());
      if (!isOrganizationSelectionJwtPayload(verified)) {
        throw new Error('Unexpected token purpose.');
      }
      payload = verified;
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired organization-selection challenge.',
      );
    }

    const candidate = payload.candidates.find(
      ({ organizationId }) => organizationId === selectedOrganizationId,
    );
    if (!candidate) {
      throw new UnauthorizedException('Organization access denied.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        normalizedEmail: true,
        status: true,
        userVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.userVersion !== payload.userVersion
    ) {
      throw new UnauthorizedException('Account is no longer active.');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: candidate.membershipId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        status: true,
        membershipVersion: true,
      },
    });
    if (
      !membership ||
      membership.userId !== user.id ||
      membership.organizationId !== candidate.organizationId ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.membershipVersion !== candidate.membershipVersion
    ) {
      throw new UnauthorizedException('Membership is no longer active.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: candidate.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        status: true,
      },
    });
    if (
      !organization ||
      organization.id !== membership.organizationId ||
      organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Organization is no longer active.');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id, organizationId: organization.id },
      select: publicEmployeeSelect,
    });

    return {
      accessToken: this.createAccountToken({
        userId: user.id,
        membershipId: membership.id,
        organizationId: organization.id,
        userVersion: user.userVersion,
        membershipVersion: membership.membershipVersion,
      }),
      tokenType: 'Bearer' as const,
      expiresIn: this.getJwtExpiresIn(),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        timezone: organization.timezone,
      },
      membership: { id: membership.id, role: membership.role },
      employeeId: employee?.id ?? null,
      user:
        employee ?? this.buildAccountCompatibilityUser({ user, membership }),
    };
  }

  async selectOrganization(userId: string, organizationId: string) {
    const context = await this.resolveOrganizationContext(
      userId,
      organizationId,
    );
    const membership = await this.prisma.membership.findUnique({
      where: { id: context.context.membershipId! },
      select: {
        membershipVersion: true,
        organization: {
          select: { id: true, name: true, slug: true, timezone: true },
        },
      },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        normalizedEmail: true,
        userVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!membership || !user) {
      throw new UnauthorizedException('Organization access denied.');
    }

    return {
      accessToken: this.createAccountToken({
        userId,
        membershipId: context.context.membershipId!,
        organizationId: context.context.organizationId!,
        userVersion: user.userVersion,
        membershipVersion: membership.membershipVersion,
      }),
      tokenType: 'Bearer' as const,
      expiresIn: this.getJwtExpiresIn(),
      organization: membership.organization,
      membership: {
        id: context.context.membershipId!,
        role: context.context.membershipRole,
      },
      employeeId: context.context.employeeId,
      user:
        context.employee ??
        this.buildAccountCompatibilityUser({
          user,
          membership: { role: context.context.membershipRole! },
        }),
    };
  }

  async getCurrentIdentity(authentication: AuthenticationResult['context']) {
    if (authentication.generation === 'legacy') {
      if (!authentication.employeeId) {
        throw new UnauthorizedException('User is no longer active.');
      }

      const employee = await this.prisma.employee.findUnique({
        where: { id: authentication.employeeId },
        select: publicEmployeeSelect,
      });

      if (!employee || !employee.isActive) {
        throw new UnauthorizedException('User is no longer active.');
      }

      return employee;
    }

    if (authentication.purpose === 'attendance_entry') {
      if (!authentication.employeeId || !authentication.sessionBinding) {
        throw new UnauthorizedException('User is no longer active.');
      }

      const employee = await this.prisma.employee.findUnique({
        where: { id: authentication.employeeId },
        select: publicEmployeeSelect,
      });

      if (!employee || !employee.isActive) {
        throw new UnauthorizedException('User is no longer active.');
      }

      return { ...employee, offlineSessionBinding: authentication.sessionBinding };
    }

    if (
      authentication.purpose !== 'account' ||
      !authentication.userId ||
      !authentication.membershipId ||
      !authentication.organizationId
    ) {
      throw new UnauthorizedException(
        'An active SaaS account context is required.',
      );
    }

    const authenticated = await this.authenticateSaasAccountPayload({
      sub: authentication.userId,
      membershipId: authentication.membershipId,
      organizationId: authentication.organizationId,
    });

    return {
      ...(authenticated.employee ??
        this.buildAccountCompatibilityUser(authenticated)),
      employee: authenticated.employee,
      account: authenticated.user,
      membership: authenticated.membership,
      organization: authenticated.organization,
      offlineSessionBinding: authentication.sessionBinding ?? null,
    };
  }

  createAccountToken(input: {
    userId: string;
    membershipId: string;
    organizationId: string;
    userVersion: number;
    membershipVersion: number;
  }) {
    return signJwtToken(
      {
        sub: input.userId,
        membershipId: input.membershipId,
        organizationId: input.organizationId,
        purpose: 'account',
        userVersion: input.userVersion,
        membershipVersion: input.membershipVersion,
        sessionBinding: randomUUID(),
      },
      this.getJwtSecret(),
      this.getJwtExpiresIn(),
    );
  }

  private createOrganizationSelectionChallenge(input: {
    userId: string;
    userVersion: number;
    candidates: OrganizationSelectionJwtPayload['candidates'];
  }) {
    return signJwtToken(
      {
        sub: input.userId,
        purpose: 'organization_selection',
        userVersion: input.userVersion,
        candidates: input.candidates,
      },
      this.getJwtSecret(),
      this.getOrganizationSelectionJwtExpiresIn(),
    );
  }

  createAttendanceEntryToken(input: {
    employeeId: string;
    organizationId: string;
    attendanceSiteId: string;
  }) {
    return signJwtToken(
      {
        sub: input.employeeId,
        organizationId: input.organizationId,
        attendanceSiteId: input.attendanceSiteId,
        sessionBinding: randomUUID(),
        purpose: 'attendance_entry',
      },
      this.getJwtSecret(),
      this.getAttendanceEntryJwtExpiresIn(),
    );
  }

  private async authenticateLegacyEmployee(
    employeeId: string,
    purpose: 'account' | 'attendance_entry',
  ): Promise<AuthenticationResult> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: null,
        userId: null,
      },
      select: publicEmployeeSelect,
    });

    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('User is no longer active.');
    }

    return {
      context: {
        generation: 'legacy',
        purpose,
        userId: null,
        membershipId: null,
        organizationId: null,
        membershipRole: null,
        employeeId: employee.id,
        attendanceSiteId: null,
      },
      employee,
    };
  }

  private async authenticateSaasAccount(
    payload: AccountJwtPayload,
  ): Promise<AuthenticationResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true, userVersion: true },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.userVersion !== payload.userVersion
    ) {
      throw new UnauthorizedException('Account is no longer active.');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: payload.membershipId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        status: true,
        membershipVersion: true,
      },
    });

    if (
      !membership ||
      membership.userId !== user.id ||
      membership.organizationId !== payload.organizationId ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.membershipVersion !== payload.membershipVersion
    ) {
      throw new UnauthorizedException('Membership is no longer active.');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: payload.organizationId },
      select: { id: true, status: true },
    });

    if (
      !organization ||
      organization.id !== membership.organizationId ||
      organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Organization is no longer active.');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: organization.id,
      },
      select: publicEmployeeSelect,
    });

    return {
      context: {
        generation: 'saas',
        purpose: 'account',
        userId: user.id,
        membershipId: membership.id,
        organizationId: organization.id,
        membershipRole: membership.role,
        employeeId: employee?.id ?? null,
        attendanceSiteId: null,
        sessionBinding: payload.sessionBinding,
        platformAdminId: null,
      },
      employee,
    };
  }

  private async authenticatePlatformAdmin(
    payload: import('../../common/security/jwt.util').PlatformJwtPayload,
  ): Promise<AuthenticationResult> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.platformAdminId },
      select: {
        id: true,
        userId: true,
        isActive: true,
        version: true,
        user: { select: { status: true, userVersion: true } },
      },
    });
    if (
      !admin ||
      !admin.isActive ||
      admin.userId !== payload.sub ||
      admin.version !== payload.platformAdminVersion ||
      admin.user.status !== UserStatus.ACTIVE ||
      admin.user.userVersion !== payload.userVersion
    )
      throw new UnauthorizedException(
        'Platform administrator is no longer active.',
      );
    return {
      context: {
        generation: 'saas',
        purpose: 'platform',
        userId: admin.userId,
        membershipId: null,
        organizationId: null,
        membershipRole: null,
        employeeId: null,
        attendanceSiteId: null,
        sessionBinding: null,
        platformAdminId: admin.id,
      },
      employee: null,
    };
  }

  private async authenticateSaasAccountPayload(input: {
    sub: string;
    membershipId: string;
    organizationId: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.sub },
      select: {
        id: true,
        normalizedEmail: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const membership = await this.prisma.membership.findUnique({
      where: { id: input.membershipId },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        status: true,
      },
    });
    const organization = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is no longer active.');
    }

    if (
      !membership ||
      membership.userId !== user.id ||
      membership.organizationId !== input.organizationId ||
      membership.status !== MembershipStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Membership is no longer active.');
    }

    if (!organization || organization.status !== OrganizationStatus.ACTIVE) {
      throw new UnauthorizedException('Organization is no longer active.');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        userId: user.id,
        organizationId: organization.id,
        isActive: true,
      },
      select: publicEmployeeSelect,
    });

    return { user, membership, organization, employee };
  }

  private buildAccountCompatibilityUser(authenticated: {
    user: {
      id: string;
      normalizedEmail: string;
      createdAt: Date;
      updatedAt: Date;
    };
    membership: { role: MembershipRole };
  }): PublicEmployee {
    const isAdmin =
      authenticated.membership.role === MembershipRole.ADMIN;

    return {
      id: authenticated.user.id,
      employeeIdentifier: '',
      firstName: authenticated.user.normalizedEmail.split('@')[0] || 'Compte',
      lastName: '',
      email: authenticated.user.normalizedEmail,
      role: authenticated.membership.role,
      accessRole: isAdmin ? AccessRole.ADMIN : AccessRole.EMPLOYEE,
      department: null,
      isActive: true,
      primarySiteId: null,
      primarySite: null,
      scheduleId: null,
      createdAt: authenticated.user.createdAt,
      updatedAt: authenticated.user.updatedAt,
    };
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private requireAttendanceSites() {
    if (!this.attendanceSites) {
      throw new ServiceUnavailableException(
        'Attendance site resolution is unavailable.',
      );
    }
    return this.attendanceSites;
  }

  private async authenticateAttendanceEntry(
    payload: AttendanceEntryJwtPayload,
  ): Promise<AuthenticationResult> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: payload.sub,
        organizationId: payload.organizationId,
        organization: {
          is: { status: OrganizationStatus.ACTIVE },
        },
      },
      select: {
        ...publicEmployeeSelect,
        organizationId: true,
        userId: true,
      },
    });

    if (
      !employee ||
      !employee.isActive ||
      employee.accessRole !== AccessRole.EMPLOYEE ||
      employee.organizationId !== payload.organizationId
    ) {
      throw new UnauthorizedException('User is no longer active.');
    }

    await this.assertAttendanceEmployeeAccountAccess(
      employee,
      'User is no longer active.',
    );

    const attendanceSite = await this.prisma.attendanceSite.findFirst({
      where: {
        id: payload.attendanceSiteId,
        organizationId: payload.organizationId,
      },
      select: { organizationId: true, isActive: true },
    });

    if (
      !attendanceSite ||
      attendanceSite.organizationId !== payload.organizationId
    ) {
      throw new UnauthorizedException('Attendance site is no longer active.');
    }

    const {
      organizationId: _organizationId,
      userId: _userId,
      ...publicEmployee
    } = employee;

    return {
      context: {
        generation: 'saas',
        purpose: 'attendance_entry',
        userId: null,
        membershipId: null,
        organizationId: payload.organizationId,
        membershipRole: null,
        employeeId: employee.id,
        attendanceSiteId: payload.attendanceSiteId,
        sessionBinding: payload.sessionBinding,
      },
      employee: publicEmployee,
    };
  }

  private async assertAttendanceEmployeeAccountAccess(
    employee: { userId: string | null; organizationId: string | null },
    unauthorizedMessage: string,
  ) {
    if (!employee.userId) {
      return;
    }

    if (!employee.organizationId) {
      throw new UnauthorizedException(unauthorizedMessage);
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: employee.organizationId,
          userId: employee.userId,
        },
      },
      select: {
        status: true,
        user: { select: { status: true } },
      },
    });

    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      membership.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(unauthorizedMessage);
    }
  }

  private assertExpectedPurpose(
    payload: ReturnType<typeof verifyJwtToken>,
    expectedPurpose: ExpectedAuthenticationPurpose,
  ) {
    if (expectedPurpose === 'any' || isLegacyJwtPayload(payload)) {
      return;
    }

    if (payload.purpose !== expectedPurpose) {
      throw new UnauthorizedException(
        'Token purpose is not allowed for this resource.',
      );
    }
  }

  private getJwtSecret() {
    return this.configService.getOrThrow<string>('JWT_SECRET');
  }

  private getJwtExpiresIn() {
    return this.configService.get<string>('JWT_EXPIRES_IN') ?? '1d';
  }

  private getAttendanceEntryJwtExpiresIn() {
    return (
      this.configService.get<string>('ATTENDANCE_ENTRY_JWT_EXPIRES_IN') ??
      DEFAULT_ATTENDANCE_ENTRY_JWT_EXPIRES_IN
    );
  }

  private getOrganizationSelectionJwtExpiresIn() {
    return (
      this.configService.get<string>('ORGANIZATION_SELECTION_JWT_EXPIRES_IN') ??
      '5m'
    );
  }

  private buildLegacyLoginResponse(
    employee: LoginEmployee | AttendanceEntryLoginEmployee | PublicEmployee,
    expiresIn: string,
  ) {
    const accessToken = signJwtToken(
      {
        sub: employee.id,
        email: employee.email,
      },
      this.getJwtSecret(),
      expiresIn,
    );

    const {
      passwordHash: _passwordHash,
      pinCode: _pinCode,
      pinCodeHash: _pinCodeHash,
      userId: _userId,
      organizationId: _organizationId,
      ...user
    } = employee as AttendanceEntryLoginEmployee & { passwordHash?: string };

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      user,
    };
  }

  private async buildAttendanceEntryLoginResponse(
    employee: AttendanceEntryLoginEmployee,
    attendanceSiteId?: string,
  ) {
    if (!employee.organizationId && !employee.userId) {
      return this.buildLegacyLoginResponse(
        employee,
        this.getAttendanceEntryJwtExpiresIn(),
      );
    }

    if (!employee.organizationId) {
      throw new UnauthorizedException(
        ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
      );
    }

    let authenticatedEmployee: PublicEmployee;
    if (employee.userId) {
      const context = await this.resolveOrganizationContext(
        employee.userId,
        employee.organizationId,
      );

      if (context.employee?.id !== employee.id || !context.employee.isActive) {
        throw new UnauthorizedException(
          ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
        );
      }
      authenticatedEmployee = context.employee;
    } else {
      const {
        pinCode: _pinCode,
        pinCodeHash: _pinCodeHash,
        userId: _userId,
        organizationId: _organizationId,
        ...publicEmployee
      } = employee;
      authenticatedEmployee = publicEmployee;
    }

    if (!attendanceSiteId) {
      throw new UnauthorizedException(
        ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
      );
    }

    return {
      accessToken: this.createAttendanceEntryToken({
        employeeId: employee.id,
        organizationId: employee.organizationId,
        attendanceSiteId,
      }),
      tokenType: 'Bearer' as const,
      expiresIn: this.getAttendanceEntryJwtExpiresIn(),
      user: authenticatedEmployee,
    };
  }

  private async migrateLegacyPinCode(
    employee: AttendanceEntryLoginEmployee,
    normalizedPinCode: string,
  ) {
    const pinCodeHash = await hashPinCode(normalizedPinCode);

    await this.prisma.employee.updateMany({
      where: {
        id: employee.id,
        pinCodeHash: null,
        pinCode: normalizedPinCode,
      },
      data: {
        pinCodeHash,
        pinCode: null,
      },
    });

    return {
      ...employee,
      pinCode: null,
      pinCodeHash,
    };
  }
}
