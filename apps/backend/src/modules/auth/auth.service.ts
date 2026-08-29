import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PublicEmployee,
  publicEmployeeSelect,
} from '../../common/prisma/selects';
import {
  AccountJwtPayload,
  AttendanceEntryJwtPayload,
  isAccountJwtPayload,
  isLegacyJwtPayload,
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
  ) {}

  async login(loginDto: LoginDto) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        email: loginDto.email,
      },
      select: {
        ...publicEmployeeSelect,
        passwordHash: true,
        userId: true,
        organizationId: true,
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

    if (employee.userId) {
      if (!employee.organizationId) {
        throw new UnauthorizedException('Invalid SaaS account linkage.');
      }

      return this.loginSaasEmployee(employee);
    }

    return this.buildLegacyLoginResponse(employee, this.getJwtExpiresIn());
  }

  async loginForAttendanceEntry(
    attendanceEntryLoginDto: AttendanceEntryLoginDto,
  ) {
    const normalizedPinCode = attendanceEntryLoginDto.pinCode.trim();

    const employees = await this.prisma.employee.findMany({
      where: {
        accessRole: AccessRole.EMPLOYEE,
        isActive: true,
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
      },
    });

    for (const employee of employees) {
      if (
        employee.pinCodeHash &&
        (await verifyPinCode(normalizedPinCode, employee.pinCodeHash))
      ) {
        return this.buildAttendanceEntryLoginResponse(employee);
      }

      if (!employee.pinCodeHash && employee.pinCode === normalizedPinCode) {
        const migratedEmployee = await this.migrateLegacyPinCode(
          employee,
          normalizedPinCode,
        );

        return this.buildAttendanceEntryLoginResponse(migratedEmployee);
      }
    }

    throw new UnauthorizedException(
      ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
    );
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
      },
      employee,
    };
  }

  async getAvailableOrganizations(userId: string) {
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
        organization: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    return memberships
      .filter(
        ({ organization }) => organization.status === OrganizationStatus.ACTIVE,
      )
      .map(({ organization, role }) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role,
      }));
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
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userVersion: true },
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
      },
      this.getJwtSecret(),
      this.getJwtExpiresIn(),
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
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
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
      },
      employee,
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
      select: { id: true, name: true, slug: true, status: true },
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

  private buildAccountCompatibilityUser(
    authenticated: Awaited<
      ReturnType<AuthService['authenticateSaasAccountPayload']>
    >,
  ): PublicEmployee {
    const isAdmin =
      authenticated.membership.role === MembershipRole.OWNER ||
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
      scheduleId: null,
      createdAt: authenticated.user.createdAt,
      updatedAt: authenticated.user.updatedAt,
    };
  }

  private async authenticateAttendanceEntry(
    payload: AttendanceEntryJwtPayload,
  ): Promise<AuthenticationResult> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: {
        ...publicEmployeeSelect,
        organizationId: true,
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

    const attendanceSite = await this.prisma.attendanceSite.findUnique({
      where: { id: payload.attendanceSiteId },
      select: { organizationId: true, isActive: true },
    });

    if (
      !attendanceSite ||
      !attendanceSite.isActive ||
      attendanceSite.organizationId !== payload.organizationId
    ) {
      throw new UnauthorizedException('Attendance site is no longer active.');
    }

    const { organizationId: _organizationId, ...publicEmployee } = employee;

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
      },
      employee: publicEmployee,
    };
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
    } = employee as LoginEmployee & AttendanceEntryLoginEmployee;

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      user,
    };
  }

  private async loginSaasEmployee(employee: LoginEmployee) {
    const context = await this.resolveOrganizationContext(employee.userId!);

    if (
      context.context.organizationId !== employee.organizationId ||
      context.employee?.id !== employee.id ||
      !context.employee.isActive
    ) {
      throw new UnauthorizedException('Organization access denied.');
    }

    const session = await this.selectOrganization(
      employee.userId!,
      employee.organizationId!,
    );

    return {
      ...session,
      user: context.employee,
    };
  }

  private async buildAttendanceEntryLoginResponse(
    employee: AttendanceEntryLoginEmployee,
  ) {
    if (!employee.userId) {
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

    const context = await this.resolveOrganizationContext(
      employee.userId,
      employee.organizationId,
    );

    if (context.employee?.id !== employee.id || !context.employee.isActive) {
      throw new UnauthorizedException(
        ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
      );
    }

    const activeSites = await this.prisma.attendanceSite.findMany({
      where: {
        organizationId: employee.organizationId,
        isActive: true,
      },
      select: { id: true },
      take: 2,
    });

    if (activeSites.length !== 1) {
      throw new UnauthorizedException(
        ATTENDANCE_ENTRY_INVALID_CREDENTIALS_MESSAGE,
      );
    }

    return {
      accessToken: this.createAttendanceEntryToken({
        employeeId: employee.id,
        organizationId: employee.organizationId,
        attendanceSiteId: activeSites[0].id,
      }),
      tokenType: 'Bearer' as const,
      expiresIn: this.getAttendanceEntryJwtExpiresIn(),
      user: context.employee,
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
