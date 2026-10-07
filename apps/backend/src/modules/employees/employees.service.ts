import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeWithScheduleSelect } from '../../common/prisma/selects';
import {
  employeeOperationalWhere,
  operationalScopeCreateData,
  scheduleOperationalWhere,
} from '../../common/prisma/operational-scope';
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
import { TransferEmployeeSiteDto } from './dto/transfer-employee-site.dto';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { EntitlementsService } from '../subscriptions/entitlements.service';

const employeeWithScheduleAndPinSelect = {
  ...employeeWithScheduleSelect,
  pinCode: true,
  pinCodeHash: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async findAll(authentication?: AuthenticationContext, siteId?: string) {
    const organizationId = this.tenantId(authentication);
    if (organizationId) await this.synchronizeDuePrimarySites(organizationId);
    if (siteId && organizationId) {
      await this.ensureActiveSite(this.prisma, siteId, organizationId);
    }
    const employees = await this.prisma.employee.findMany({
      where: { ...this.employeeTenantWhere(organizationId), ...(siteId ? { primarySiteId: siteId } : {}) },
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
    if (organizationId) await this.synchronizeDuePrimarySites(organizationId, id);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        ...this.employeeTenantWhere(organizationId),
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
    if (organizationId && !createEmployeeDto.siteId) {
      throw new BadRequestException(
        'siteId is required when creating an employee in an organization.',
      );
    }
    const pinSecret = await this.resolvePinSecret(
      createEmployeeDto.accessRole ?? AccessRole.EMPLOYEE,
      createEmployeeDto.pinCode,
      true,
      undefined,
      undefined,
      organizationId,
    );

    const passwordHash = await hashPassword(createEmployeeDto.password);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const employee = await this.prisma.$transaction(async (transaction) => {
          if (organizationId && createEmployeeDto.siteId) {
            await this.ensureActiveSite(
              transaction,
              createEmployeeDto.siteId,
              organizationId,
            );
          }
          if (createEmployeeDto.isActive ?? true)
            await this.entitlements.assertMayIncrease(
              organizationId,
              'activeEmployees',
              transaction,
            );
          const employeeIdentifier = await this.generateEmployeeIdentifier(
            transaction,
            new Date(),
            organizationId,
          );

          const employee = await transaction.employee.create({
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
              organizationId: organizationId ?? null,
              scheduleId: createEmployeeDto.scheduleId ?? null,
              primarySiteId: organizationId ? createEmployeeDto.siteId : null,
              ...operationalScopeCreateData(organizationId),
            } as Prisma.EmployeeUncheckedCreateInput,
            select: employeeWithScheduleAndPinSelect,
          });
          if (organizationId && createEmployeeDto.siteId) {
            const siteAssignment = await transaction.employeeSiteAssignment.create({
              data: {
                organizationId,
                employeeId: employee.id,
                siteId: createEmployeeDto.siteId,
                effectiveFrom: this.parseEffectiveDate(new Date().toISOString()),
              },
            });
            if (createEmployeeDto.scheduleId) {
              const schedule = await transaction.schedule.findFirst({
                where: {
                  id: createEmployeeDto.scheduleId,
                  organizationId,
                  siteId: createEmployeeDto.siteId,
                  isActive: true,
                  v1ScopeStatus: 'OPERATIONAL',
                },
                select: { id: true },
              });
              if (!schedule) {
                throw new BadRequestException('Assigned schedule must be operational and belong to the employee site.');
              }
              await transaction.employeeScheduleAssignment.create({
                data: {
                  organizationId,
                  employeeId: employee.id,
                  siteId: createEmployeeDto.siteId,
                  scheduleId: schedule.id,
                  employeeSiteAssignmentId: siteAssignment.id,
                  effectiveFrom: this.parseEffectiveDate(new Date().toISOString()),
                  v1ScopeStatus: 'OPERATIONAL',
                },
              });
            }
          }
          return employee;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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

  async transferSite(
    id: string,
    payload: TransferEmployeeSiteDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    if (!organizationId) {
      throw new BadRequestException('A valid organization context is required.');
    }
    const effectiveFrom = this.parseEffectiveDate(payload.effectiveFrom);
    const today = this.parseEffectiveDate(new Date().toISOString());
    if (effectiveFrom < today) {
      throw new BadRequestException('Site transfer cannot be backdated.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findFirst({
          where: { id, ...employeeOperationalWhere(organizationId) },
          select: { id: true, primarySiteId: true },
        });
        if (!employee) throw new NotFoundException('Employee not found.');
        if (employee.primarySiteId === payload.siteId) {
          throw new ConflictException('Employee is already assigned to this site.');
        }
        await this.ensureActiveSite(tx, payload.siteId, organizationId);
        if (!payload.scheduleId) {
          throw new BadRequestException('A target-site schedule is required for transfer.');
        }
        const targetSchedule = await tx.schedule.findFirst({
          where: {
            id: payload.scheduleId,
            organizationId,
            siteId: payload.siteId,
            isActive: true,
            v1ScopeStatus: 'OPERATIONAL',
          },
          select: { id: true },
        });
        if (!targetSchedule) {
          throw new BadRequestException('A valid operational target-site schedule is required for transfer.');
        }
        if (effectiveFrom.getTime() === today.getTime()) {
          const tomorrow = new Date(today);
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          const attendance = await tx.attendance.findFirst({
            where: { employeeId: id, organizationId, date: { gte: today, lt: tomorrow } },
            select: { id: true },
          });
          if (attendance) {
            throw new ConflictException('An employee with attendance today cannot transfer sites today.');
          }
        }
        const current = await tx.employeeSiteAssignment.findFirst({
          where: { organizationId, employeeId: id, effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
          select: { id: true, effectiveFrom: true },
        });
        if (!current || current.effectiveFrom > effectiveFrom) {
          throw new ConflictException('Employee has no transferable current site assignment.');
        }
        // No attendance on the effective date means a same-day correction did
        // not create historical operational data at the original site.
        if (current.effectiveFrom.getTime() === effectiveFrom.getTime()) {
          await tx.employeeScheduleAssignment.deleteMany({
            where: { organizationId, employeeId: id, employeeSiteAssignmentId: current.id },
          });
          await tx.employeeSiteAssignment.update({
            where: { id: current.id }, data: { siteId: payload.siteId },
          });
          await tx.employee.update({
            where: { id },
            data: {
              primarySiteId: payload.siteId,
              scheduleId: targetSchedule.id,
            },
          });
          await tx.employeeScheduleAssignment.create({
            data: { organizationId, employeeId: id, siteId: payload.siteId, scheduleId: targetSchedule.id, employeeSiteAssignmentId: current.id, effectiveFrom, v1ScopeStatus: 'OPERATIONAL' },
          });
          return tx.employee.findUniqueOrThrow({
            where: { id }, select: employeeWithScheduleAndPinSelect,
          });
        }
        await tx.employeeSiteAssignment.update({
          where: { id: current.id }, data: { effectiveTo: effectiveFrom },
        });
        await tx.employeeScheduleAssignment.updateMany({
          where: { organizationId, employeeId: id, effectiveTo: null },
          data: { effectiveTo: effectiveFrom },
        });
        const targetSiteAssignment = await tx.employeeSiteAssignment.create({
          data: { organizationId, employeeId: id, siteId: payload.siteId, effectiveFrom },
        });
        await tx.employeeScheduleAssignment.create({
          data: { organizationId, employeeId: id, siteId: payload.siteId, scheduleId: targetSchedule.id, employeeSiteAssignmentId: targetSiteAssignment.id, effectiveFrom, v1ScopeStatus: 'OPERATIONAL' },
        });
        if (effectiveFrom.getTime() === today.getTime()) {
          await tx.employee.update({
            where: { id },
            data: {
              primarySiteId: payload.siteId,
              scheduleId: targetSchedule.id,
            },
          });
        }
        return tx.employee.findUniqueOrThrow({
          where: { id }, select: employeeWithScheduleAndPinSelect,
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isSerializationConflict(error)) {
        throw new ConflictException('Employee site transfer conflicted with another request.');
      }
      this.handlePersistenceError(error);
    }
  }

  async update(
    id: string,
    updateEmployeeDto: UpdateEmployeeDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    if (updateEmployeeDto.scheduleId !== undefined) {
      const { scheduleId, ...employeeFields } = updateEmployeeDto;
      const scheduleResult = await this.assignSchedule(
        id,
        { scheduleId },
        authentication,
      );
      if (Object.keys(employeeFields).length === 0) return scheduleResult;
      updateEmployeeDto = employeeFields as UpdateEmployeeDto;
    }
    const existingEmployee = await this.ensureEmployeeExists(
      id,
      organizationId,
    );

    const data = await this.buildEmployeeUpdateData(
      id,
      existingEmployee,
      updateEmployeeDto,
      organizationId,
    );

    if (updateEmployeeDto.isActive === true && !existingEmployee.isActive) {
      const employee = await this.prisma.$transaction(async (transaction) => {
        await this.entitlements.assertMayIncrease(
          organizationId,
          'activeEmployees',
          transaction,
        );
        return transaction.employee.update({
          where: { id },
          data,
          select: employeeWithScheduleAndPinSelect,
        });
      });
      return this.mapEmployeeResponse(employee);
    }

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

  async updateStatus(
    id: string,
    payload: UpdateEmployeeStatusDto,
    authentication?: AuthenticationContext,
  ) {
    return this.update(id, payload as UpdateEmployeeDto, authentication);
  }

  assignRole(
    id: string,
    payload: AssignEmployeeRoleDto,
    authentication?: AuthenticationContext,
  ) {
    return this.updateEmployeeFields(
      id,
      {
        role: payload.role,
      },
      this.tenantId(authentication),
    );
  }

  assignDepartment(
    id: string,
    payload: AssignEmployeeDepartmentDto,
    authentication?: AuthenticationContext,
  ) {
    return this.updateEmployeeFields(
      id,
      {
        department: payload.department ?? null,
      },
      this.tenantId(authentication),
    );
  }

  async assignSchedule(
    id: string,
    payload: AssignEmployeeScheduleDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    if (!organizationId) {
      if (
        authentication?.generation !== 'legacy' ||
        authentication.purpose !== 'account' ||
        !authentication.employeeId ||
        payload.effectiveFrom !== undefined
      ) {
        throw new BadRequestException(
          'A valid organization context is required.',
        );
      }
      const actor = await this.prisma.employee.findFirst({
        where: {
          id: authentication.employeeId,
          organizationId: null,
          userId: null,
          accessRole: AccessRole.ADMIN,
          isActive: true,
        },
        select: { id: true },
      });
      if (!actor) {
        throw new ForbiddenException(
          'Active administrator access is required.',
        );
      }
      await this.ensureEmployeeExists(id);
      if (payload.scheduleId) {
        await this.ensureScheduleExists(payload.scheduleId);
      }
      const employee = await this.prisma.employee.update({
        where: { id },
        data: { scheduleId: payload.scheduleId ?? null },
        select: employeeWithScheduleAndPinSelect,
      });
      return this.mapEmployeeResponse(employee);
    }
    const effectiveFrom = this.parseEffectiveDate(payload.effectiveFrom ?? new Date().toISOString());
    const today = this.parseEffectiveDate(new Date().toISOString());
    if (effectiveFrom < today) {
      throw new BadRequestException('Schedule assignment cannot be backdated.');
    }
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id, ...employeeOperationalWhere(organizationId) },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Employee not found.');
      const siteAssignment = await tx.employeeSiteAssignment.findFirst({
        where: { organizationId, employeeId: id, effectiveFrom: { lte: effectiveFrom }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }] },
        select: { id: true, siteId: true },
      });
      if (!siteAssignment) throw new BadRequestException('Employee has no effective site assignment for the schedule date.');
      const activeSite = await tx.attendanceSite.findFirst({
        where: { id: siteAssignment.siteId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!activeSite) throw new NotFoundException('Employee operational site is not active.');
      const activeAssignment = await tx.employeeScheduleAssignment.findFirst({
        where: { organizationId, employeeId: id, effectiveFrom: { lte: effectiveFrom }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }] },
        orderBy: { effectiveFrom: 'desc' },
      });
      const nextAssignment = await tx.employeeScheduleAssignment.findFirst({
        where: { organizationId, employeeId: id, effectiveFrom: { gt: effectiveFrom } },
        orderBy: { effectiveFrom: 'asc' },
        select: { effectiveFrom: true },
      });
      if (activeAssignment) {
        if (activeAssignment.effectiveFrom.getTime() === effectiveFrom.getTime()) {
          await tx.employeeScheduleAssignment.delete({ where: { id: activeAssignment.id } });
        } else {
          await tx.employeeScheduleAssignment.update({ where: { id: activeAssignment.id }, data: { effectiveTo: effectiveFrom } });
        }
      }
      if (payload.scheduleId) {
        const schedule = await tx.schedule.findFirst({
          where: { id: payload.scheduleId, organizationId, siteId: siteAssignment.siteId, isActive: true, v1ScopeStatus: 'OPERATIONAL' },
          select: { id: true },
        });
        if (!schedule) throw new NotFoundException('Assigned schedule not found for the employee effective site.');
        await tx.employeeScheduleAssignment.create({
          data: { organizationId, employeeId: id, siteId: siteAssignment.siteId, scheduleId: schedule.id, employeeSiteAssignmentId: siteAssignment.id, effectiveFrom, effectiveTo: nextAssignment?.effectiveFrom ?? null, reason: payload.reason, v1ScopeStatus: 'OPERATIONAL' },
        });
      }
      if (effectiveFrom.getTime() <= today.getTime()) {
        await tx.employee.update({ where: { id }, data: { scheduleId: payload.scheduleId ?? null } });
      }
      const result = await tx.employee.findUniqueOrThrow({ where: { id }, select: employeeWithScheduleAndPinSelect });
      return this.mapEmployeeResponse(result);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
        ...this.employeeTenantWhere(organizationId),
      },
      select: {
        id: true,
        isActive: true,
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

  private async ensureScheduleExists(
    scheduleId: string,
    organizationId?: string,
  ) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, ...scheduleOperationalWhere(organizationId) },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!schedule || schedule.organizationId !== (organizationId ?? null)) {
      throw new NotFoundException('Assigned schedule not found.');
    }
  }

  private async ensureActiveSite(
    transaction: Prisma.TransactionClient | PrismaService,
    siteId: string,
    organizationId: string,
  ) {
    const site = await transaction.attendanceSite.findFirst({
      where: { id: siteId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Attendance site not found or inactive.');
  }

  private parseEffectiveDate(value: string) {
    const datePart = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      throw new BadRequestException('effectiveFrom must be an ISO calendar date.');
    }
    const date = new Date(`${datePart}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('effectiveFrom must be valid.');
    }
    return date;
  }

  /**
   * Lazy activation is deliberately derived from the historical assignment
   * table. It avoids a scheduler that could be delayed or unavailable while
   * keeping primarySiteId a cached representation of the currently-effective
   * assignment. It never changes attendance or assignment history.
   */
  async synchronizeDuePrimarySites(organizationId: string, employeeId?: string) {
    const today = this.parseEffectiveDate(new Date().toISOString());
    const assignments = await this.prisma.employeeSiteAssignment.findMany({
      where: {
        organizationId,
        ...(employeeId ? { employeeId } : {}),
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
      },
      select: { employeeId: true, siteId: true },
    });
    await Promise.all(assignments.map((assignment) =>
      this.prisma.employee.updateMany({
        where: {
          id: assignment.employeeId,
          organizationId,
          NOT: { primarySiteId: assignment.siteId },
        },
        data: { primarySiteId: assignment.siteId },
      }),
    ));
  }

  private handlePersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = this.getUniqueConflictTarget(error);

        if (target.includes('pinCode')) {
          throw new ConflictException('Ce code PIN est deja utilise.');
        }

        if (target.includes('employeeIdentifier')) {
          throw new ConflictException(
            'Impossible de generer un identifiant employe unique.',
          );
        }

        if (target.includes('employeeCode')) {
          throw new ConflictException(
            target.includes('organizationId')
              ? 'An employee with the same code already exists in this organization.'
              : 'This employee code is currently unavailable.',
          );
        }

        if (target.includes('email')) {
          throw new ConflictException(
            target.includes('organizationId')
              ? 'An employee with the same email already exists in this organization.'
              : 'This employee email is currently unavailable.',
          );
        }

        if (target.includes('userId')) {
          throw new ConflictException(
            'This account is already linked to an employee in this organization.',
          );
        }

        throw new ConflictException(
          'An employee with the same unique information already exists.',
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
      this.getUniqueConflictTarget(error).includes('employeeIdentifier')
    );
  }

  private isSerializationConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private getUniqueConflictTarget(error: Prisma.PrismaClientKnownRequestError) {
    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.filter(
        (field): field is string => typeof field === 'string',
      );
    }

    return typeof target === 'string' ? [target] : [];
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
        organizationId: organizationId ?? null,
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
    _organizationId?: string,
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

  private tenantId(authentication?: AuthenticationContext) {
    if (!authentication || authentication.generation === 'legacy') {
      return undefined;
    }

    if (
      authentication.purpose !== 'account' ||
      !authentication.organizationId
    ) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }

    return authentication.organizationId;
  }

  private employeeTenantWhere(
    organizationId?: string,
  ): Prisma.EmployeeWhereInput {
    return employeeOperationalWhere(organizationId);
  }
}
