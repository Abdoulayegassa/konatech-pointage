import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessRole,
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
};

type AttendanceEntryLoginEmployee = PublicEmployee & {
  pinCode: string | null;
  pinCodeHash: string | null;
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

    return this.buildLoginResponse(employee, this.getJwtExpiresIn());
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
      },
    });

    for (const employee of employees) {
      if (
        employee.pinCodeHash &&
        (await verifyPinCode(normalizedPinCode, employee.pinCodeHash))
      ) {
        return this.buildLoginResponse(
          employee,
          this.getAttendanceEntryJwtExpiresIn(),
        );
      }

      if (!employee.pinCodeHash && employee.pinCode === normalizedPinCode) {
        const migratedEmployee = await this.migrateLegacyPinCode(
          employee,
          normalizedPinCode,
        );

        return this.buildLoginResponse(
          migratedEmployee,
          this.getAttendanceEntryJwtExpiresIn(),
        );
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
        expectedPurpose === 'attendance_entry'
          ? 'attendance_entry'
          : 'account',
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
      Array.isArray(memberships) ? memberships : memberships ? [memberships] : []
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
        ({ organization }) =>
          organization.status === OrganizationStatus.ACTIVE,
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

  private buildLoginResponse(
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
      ...user
    } = employee as LoginEmployee & AttendanceEntryLoginEmployee;

    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      user,
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
