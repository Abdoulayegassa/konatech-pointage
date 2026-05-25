import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PublicEmployee,
  publicEmployeeSelect,
} from '../../common/prisma/selects';
import { signJwtToken, verifyJwtToken } from '../../common/security/jwt.util';
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
    let payload: { sub: string };

    try {
      payload = verifyJwtToken(token, this.getJwtSecret());
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: {
        id: payload.sub,
      },
      select: publicEmployeeSelect,
    });

    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('User is no longer active.');
    }

    return employee;
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
