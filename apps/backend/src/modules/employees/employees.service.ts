import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeWithScheduleSelect } from '../../common/prisma/selects';
import {
  hashPassword,
  hashPinCode,
  verifyPinCode,
} from '../../common/security/password.util';
import {
  INVALID_EMPLOYEE_PIN_MESSAGE,
  isValidEmployeePinCode,
} from '../../common/validation/pin-code.validation';
import { AssignEmployeeDepartmentDto } from './dto/assign-employee-department.dto';
import { AssignEmployeeRoleDto } from './dto/assign-employee-role.dto';
import { AssignEmployeeScheduleDto } from './dto/assign-employee-schedule.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';

const employeeWithScheduleAndPinSelect = {
  ...employeeWithScheduleSelect,
  pinCode: true,
  pinCodeHash: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const employees = await this.prisma.employee.findMany({
      where: organizationId ? { organizationId } : undefined,
      select: employeeWithScheduleAndPinSelect,
      orderBy: [
        { createdAt: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    return employees.map((employee) => this.mapEmployeeResponse(employee));
  }

  async findOne(id: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      select: employeeWithScheduleAndPinSelect,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return this.mapEmployeeResponse(employee);
  }

  async create(
    createEmployeeDto: CreateEmployeeDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const pinSecret = await this.resolvePinSecret(
      createEmployeeDto.accessRole ?? AccessRole.EMPLOYEE,
      createEmployeeDto.pinCode,
      true,
      undefined,
      undefined,
      organizationId,
    );

    if (createEmployeeDto.scheduleId) {
      await this.ensureScheduleExists(createEmployeeDto.scheduleId, organizationId);
    }

    const passwordHash = await hashPassword(createEmployeeDto.password);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const employee = await this.prisma.$transaction(async (transaction) => {
          const employeeIdentifier =
            await this.generateEmployeeIdentifier(transaction, new Date(), organizationId);

          return transaction.employee.create({
            data: {
              employeeIdentifier,
              pinCode: pinSecret.pinCode,
              pinCodeHash: pinSecret.pinCodeHash,
              firstName: createEmployeeDto.firstName,
              lastName: createEmployeeDto.lastName,
              email: createEmployeeDto.email,
              role: createEmployeeDto.role,
              accessRole: createEmployeeDto.accessRole ?? AccessRole.EMPLOYEE,
              passwordHash,
              department: createEmployeeDto.department ?? null,
              isActive: createEmployeeDto.isActive ?? true,
              ...(organizationId ? { organizationId } : {}),
              scheduleId: createEmployeeDto.scheduleId ?? null,
            } as Prisma.EmployeeUncheckedCreateInput,
            select: employeeWithScheduleAndPinSelect,
          });
        });

        return this.mapEmployeeResponse(employee);
      } catch (error) {
        if (this.isEmployeeIdentifierConflict(error) && attempt < 2) {
          continue;
        }

        this.handlePersistenceError(error);
      }
    }

    throw new ConflictException("Impossible de creer l'employe.");
  }

  async update(
    id: string,
    updateEmployeeDto: UpdateEmployeeDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const existingEmployee = await this.ensureEmployeeExists(id, organizationId);

    if (typeof updateEmployeeDto.scheduleId === 'string') {
      await this.ensureScheduleExists(updateEmployeeDto.scheduleId, organizationId);
    }

    const data = await this.buildEmployeeUpdateData(
      id,
      existingEmployee,
      updateEmployeeDto,
      organizationId,
    );

    try {
      const employee = await this.prisma.employee.update({
        where: { id },
        data,
        select: employeeWithScheduleAndPinSelect,
      });

      return this.mapEmployeeResponse(employee);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  updateStatus(id: string, payload: UpdateEmployeeStatusDto, authentication?: AuthenticationContext) {
    return this.updateEmployeeFields(id, {
      isActive: payload.isActive,
    }, this.tenantId(authentication));
  }

  assignRole(id: string, payload: AssignEmployeeRoleDto, authentication?: AuthenticationContext) {
    return this.updateEmployeeFields(id, {
      role: payload.role,
    }, this.tenantId(authentication));
  }

  assignDepartment(id: string, payload: AssignEmployeeDepartmentDto, authentication?: AuthenticationContext) {
    return this.updateEmployeeFields(id, {
      department: payload.department ?? null,
    }, this.tenantId(authentication));
  }

  async assignSchedule(id: string, payload: AssignEmployeeScheduleDto, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    if (payload.scheduleId) {
      await this.ensureScheduleExists(payload.scheduleId, organizationId);
    }

    return this.updateEmployeeFields(id, {
      ...(payload.scheduleId
        ? {
            schedule: {
              connect: {
                id: payload.scheduleId,
              },
            },
          }
        : {
            schedule: {
              disconnect: true,
            },
          }),
    }, organizationId);
  }

  private async updateEmployeeFields(
    id: string,
    data: Prisma.EmployeeUpdateInput,
    organizationId?: string,
  ) {
    await this.ensureEmployeeExists(id, organizationId);

    try {
      const employee = await this.prisma.employee.update({
        where: {
          id,
        },
        data,
        select: employeeWithScheduleAndPinSelect,
      });

      return this.mapEmployeeResponse(employee);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  private async buildEmployeeUpdateData(
    id: string,
    existingEmployee: {
      accessRole: AccessRole;
      pinCode: string | null;
      pinCodeHash: string | null;
    },
    updateEmployeeDto: UpdateEmployeeDto,
    organizationId?: string,
  ) {
    const nextAccessRole =
      updateEmployeeDto.accessRole ?? existingEmployee.accessRole;
    const pinSecret = await this.resolvePinSecret(
      nextAccessRole,
      updateEmployeeDto.pinCode,
      false,
      {
        pinCode: existingEmployee.pinCode,
        pinCodeHash: existingEmployee.pinCodeHash,
      },
      id,
      organizationId,
    );

    const data: Prisma.EmployeeUpdateInput = {
      pinCode: pinSecret.pinCode,
      pinCodeHash: pinSecret.pinCodeHash,
      firstName: updateEmployeeDto.firstName,
      lastName: updateEmployeeDto.lastName,
      email: updateEmployeeDto.email,
      role: updateEmployeeDto.role,
      accessRole: updateEmployeeDto.accessRole,
      department: updateEmployeeDto.department,
      isActive: updateEmployeeDto.isActive,
      ...(updateEmployeeDto.password
        ? {
            passwordHash: await hashPassword(updateEmployeeDto.password),
          }
        : {}),
      ...(typeof updateEmployeeDto.scheduleId === 'string'
        ? {
            schedule: {
              connect: {
                id: updateEmployeeDto.scheduleId,
              },
            },
          }
        : updateEmployeeDto.scheduleId === null
          ? {
              schedule: {
                disconnect: true,
              },
            }
          : {}),
    };

    return data;
  }

  private async ensureEmployeeExists(id: string, organizationId?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        accessRole: true,
        pinCode: true,
        pinCodeHash: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  private async ensureScheduleExists(scheduleId: string, organizationId?: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!schedule || (organizationId && schedule.organizationId !== organizationId)) {
      throw new NotFoundException('Assigned schedule not found.');
    }
  }

  private handlePersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        if (
          Array.isArray(error.meta?.target) &&
          error.meta.target.includes('pinCode')
        ) {
          throw new ConflictException('Ce code PIN est deja utilise.');
        }

        if (
          Array.isArray(error.meta?.target) &&
          error.meta.target.includes('employeeIdentifier')
        ) {
          throw new ConflictException(
            'Impossible de generer un identifiant employe unique.',
          );
        }

        throw new ConflictException(
          'An employee with the same email already exists.',
        );
      }

      if (error.code === 'P2003') {
        throw new NotFoundException('Assigned schedule not found.');
      }
    }

    throw error;
  }

  private isEmployeeIdentifierConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('employeeIdentifier')
    );
  }

  private async generateEmployeeIdentifier(
    transaction: Prisma.TransactionClient,
    referenceDate = new Date(),
    organizationId?: string,
  ) {
    const year = referenceDate.getUTCFullYear();
    const prefix = `EMP-${year}-`;
    const existingEmployees = await transaction.employee.findMany({
      where: {
        employeeIdentifier: {
          startsWith: prefix,
        },
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        employeeIdentifier: true,
      },
    });
    const latestSequence = existingEmployees.reduce((maxSequence, employee) => {
      const parsedSequence = Number.parseInt(
        employee.employeeIdentifier.slice(prefix.length),
        10,
      );

      return Number.isFinite(parsedSequence)
        ? Math.max(maxSequence, parsedSequence)
        : maxSequence;
    }, 0);
    const nextSequence = latestSequence + 1;

    return `${prefix}${String(nextSequence).padStart(3, '0')}`;
  }

  private mapEmployeeResponse(
    employee: Prisma.EmployeeGetPayload<{
      select: typeof employeeWithScheduleAndPinSelect;
    }>,
  ) {
    const { pinCode: _pinCode, pinCodeHash: _pinCodeHash, ...rest } = employee;

    return {
      ...rest,
      pinConfigured: Boolean(employee.pinCodeHash || employee.pinCode),
    };
  }

  private async resolvePinSecret(
    accessRole: AccessRole,
    nextPinCode: string | null | undefined,
    requirePinForEmployee: boolean,
    currentPinSecret:
      | {
          pinCode: string | null;
          pinCodeHash: string | null;
        }
      | undefined = {
      pinCode: null,
      pinCodeHash: null,
    },
    excludedEmployeeId?: string,
    organizationId?: string,
  ) {
    const effectiveCurrentPinSecret = currentPinSecret ?? {
      pinCode: null,
      pinCodeHash: null,
    };

    if (accessRole === AccessRole.ADMIN) {
      return {
        pinCode: null,
        pinCodeHash: null,
      };
    }

    if (typeof nextPinCode === 'string') {
      const normalizedPinCode = nextPinCode.trim();

      if (!normalizedPinCode) {
        if (requirePinForEmployee) {
          throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
        }

        if (
          !effectiveCurrentPinSecret.pinCode &&
          !effectiveCurrentPinSecret.pinCodeHash
        ) {
          throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
        }

        return {
          pinCode: effectiveCurrentPinSecret.pinCodeHash
            ? null
            : effectiveCurrentPinSecret.pinCode,
          pinCodeHash: effectiveCurrentPinSecret.pinCodeHash,
        };
      }

      if (!isValidEmployeePinCode(normalizedPinCode)) {
        throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
      }

      await this.ensurePinCodeAvailable(
        normalizedPinCode,
        excludedEmployeeId,
        organizationId,
      );

      return {
        pinCode: null,
        pinCodeHash: await hashPinCode(normalizedPinCode),
      };
    }

    if (nextPinCode === null) {
      if (requirePinForEmployee) {
        throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
      }

      if (
        !effectiveCurrentPinSecret.pinCode &&
        !effectiveCurrentPinSecret.pinCodeHash
      ) {
        throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
      }

      return {
        pinCode: effectiveCurrentPinSecret.pinCodeHash
          ? null
          : effectiveCurrentPinSecret.pinCode,
        pinCodeHash: effectiveCurrentPinSecret.pinCodeHash,
      };
    }

    if (
      requirePinForEmployee &&
      !effectiveCurrentPinSecret.pinCode &&
      !effectiveCurrentPinSecret.pinCodeHash
    ) {
      throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
    }

    if (
      !requirePinForEmployee &&
      !effectiveCurrentPinSecret.pinCode &&
      !effectiveCurrentPinSecret.pinCodeHash
    ) {
      throw new BadRequestException(INVALID_EMPLOYEE_PIN_MESSAGE);
    }

    return {
      pinCode: effectiveCurrentPinSecret.pinCodeHash
        ? null
        : effectiveCurrentPinSecret.pinCode,
      pinCodeHash: effectiveCurrentPinSecret.pinCodeHash,
    };
  }

  private async ensurePinCodeAvailable(
    normalizedPinCode: string,
    excludedEmployeeId?: string,
    organizationId?: string,
  ) {
    const employees = await this.prisma.employee.findMany({
      where: {
        accessRole: AccessRole.EMPLOYEE,
        ...(organizationId ? { organizationId } : {}),
        ...(excludedEmployeeId
          ? {
              id: {
                not: excludedEmployeeId,
              },
            }
          : {}),
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
        pinCode: true,
        pinCodeHash: true,
      },
    });

    for (const employee of employees) {
      if (employee.pinCode === normalizedPinCode) {
        throw new ConflictException('Ce code PIN est deja utilise.');
      }

      if (
        employee.pinCodeHash &&
        (await verifyPinCode(normalizedPinCode, employee.pinCodeHash))
      ) {
        throw new ConflictException('Ce code PIN est deja utilise.');
      }
    }
  }

  private tenantId(authentication?: AuthenticationContext) {
    if (!authentication || authentication.generation === 'legacy') {
      return undefined;
    }

    if (
      authentication.purpose !== 'account' ||
      !authentication.organizationId
    ) {
      throw new BadRequestException('A valid organization context is required.');
    }

    return authentication.organizationId;
  }
}
