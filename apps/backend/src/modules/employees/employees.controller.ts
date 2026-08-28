import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AssignEmployeeDepartmentDto } from './dto/assign-employee-department.dto';
import { AssignEmployeeRoleDto } from './dto/assign-employee-role.dto';
import { AssignEmployeeScheduleDto } from './dto/assign-employee-schedule.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { EmployeesService } from './employees.service';

@Roles(AccessRole.ADMIN)
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  findAll(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.employeesService.findAll(authentication);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.employeesService.findOne(id, authentication);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    const employee = await this.employeesService.create(createEmployeeDto, authentication);

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'employee.create',
      resource: 'employee',
      resourceId: employee.id,
      metadata: {
        email: createEmployeeDto.email,
        accessRole: createEmployeeDto.accessRole,
        scheduleId: createEmployeeDto.scheduleId ?? null,
        isActive: createEmployeeDto.isActive,
      },
    });

    return employee;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const employee = await this.employeesService.update(id, updateEmployeeDto, authentication);

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'employee.update',
      resource: 'employee',
      resourceId: id,
      metadata: {
        changedFields: Object.keys(updateEmployeeDto),
      },
    });

    return employee;
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEmployeeStatusDto: UpdateEmployeeStatusDto,
  ) {
    const employee = await this.employeesService.updateStatus(
      id,
      updateEmployeeStatusDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'employee.status.update',
      resource: 'employee',
      resourceId: id,
      metadata: {
        isActive: updateEmployeeStatusDto.isActive,
      },
    });

    return employee;
  }

  @Patch(':id/role')
  async assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignEmployeeRoleDto: AssignEmployeeRoleDto,
  ) {
    const employee = await this.employeesService.assignRole(
      id,
      assignEmployeeRoleDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'employee.role.assign',
      resource: 'employee',
      resourceId: id,
      metadata: {
        role: assignEmployeeRoleDto.role,
      },
    });

    return employee;
  }

  @Patch(':id/department')
  async assignDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignEmployeeDepartmentDto: AssignEmployeeDepartmentDto,
  ) {
    const employee = await this.employeesService.assignDepartment(
      id,
      assignEmployeeDepartmentDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'employee.department.assign',
      resource: 'employee',
      resourceId: id,
      metadata: {
        department: assignEmployeeDepartmentDto.department,
      },
    });

    return employee;
  }

  @Patch(':id/schedule')
  async assignSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignEmployeeScheduleDto: AssignEmployeeScheduleDto,
  ) {
    const employee = await this.employeesService.assignSchedule(
      id,
      assignEmployeeScheduleDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'employee.schedule.assign',
      resource: 'employee',
      resourceId: id,
      metadata: {
        scheduleId: assignEmployeeScheduleDto.scheduleId,
      },
    });

    return employee;
  }
}
