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

const employeeWithScheduleAndPinSelect = {
  ...employeeWithScheduleSelect,
  pinCode: true,
  pinCodeHash: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const employees = await this.prisma.employee.findMany({
      select: employeeWithScheduleAndPinSelect,
      orderBy: [
        { createdAt: 'desc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    return employees.map((employee) => this.mapEmployeeResponse(employee));
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
      },
      select: employeeWithScheduleAndPinSelect,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    return this.mapEmployeeResponse(employee);
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    const pinSecret = await this.resolvePinSecret(
      createEmployeeDto.accessRole ?? AccessRole.EMPLOYEE,
      createEmployeeDto.pinCode,
      true,
      undefined,
    );

    if (createEmployeeDto.scheduleId) {
      await this.ensureScheduleExists(createEmployeeDto.scheduleId);
    }

    const passwordHash = await hashPassword(createEmployeeDto.password);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const employee = await this.prisma.$transaction(async (transaction) => {
          const employeeIdentifier =
            await this.generateEmployeeIdentifier(transaction);

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
              ...(createEmployeeDto.scheduleId
                ? {
                    schedule: {
                      connect: {
                        id: createEmployeeDto.scheduleId,
                      },
                    },
                  }
                : {}),
            },
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

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    const existingEmployee = await this.ensureEmployeeExists(id);

    if (typeof updateEmployeeDto.scheduleId === 'string') {
      await this.ensureScheduleExists(updateEmployeeDto.scheduleId);
    }

    const data = await this.buildEmployeeUpdateData(
      id,
      existingEmployee,
      updateEmployeeDto,
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

  updateStatus(id: string, payload: UpdateEmployeeStatusDto) {
    return this.updateEmployeeFields(id, {
      isActive: payload.isActive,
    });
  }

  assignRole(id: string, payload: AssignEmployeeRoleDto) {
    return this.updateEmployeeFields(id, {
      role: payload.role,
    });
  }

  assignDepartment(id: string, payload: AssignEmployeeDepartmentDto) {
    return this.updateEmployeeFields(id, {
      department: payload.department ?? null,
    });
  }

  async assignSchedule(id: string, payload: AssignEmployeeScheduleDto) {
    if (payload.scheduleId) {
      await this.ensureScheduleExists(payload.scheduleId);
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
    });
  }

  private async updateEmployeeFields(
    id: string,
    data: Prisma.EmployeeUpdateInput,
  ) {
    await this.ensureEmployeeExists(id);

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

  private async ensureEmployeeExists(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        id,
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

  private async ensureScheduleExists(scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: {
        id: scheduleId,
      },
      select: {
        id: true,
      },
    });

    if (!schedule) {
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
  ) {
    const year = referenceDate.getUTCFullYear();
    const prefix = `EMP-${year}-`;
    const existingEmployees = await transaction.employee.findMany({
      where: {
        employeeIdentifier: {
          startsWith: prefix,
        },
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

      await this.ensurePinCodeAvailable(normalizedPinCode, excludedEmployeeId);

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
  ) {
    const employees = await this.prisma.employee.findMany({
      where: {
        accessRole: AccessRole.EMPLOYEE,
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
}
