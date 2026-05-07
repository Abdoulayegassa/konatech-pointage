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
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
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
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    const employee = await this.employeesService.create(createEmployeeDto);

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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const employee = await this.employeesService.update(id, updateEmployeeDto);

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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEmployeeStatusDto: UpdateEmployeeStatusDto,
  ) {
    const employee = await this.employeesService.updateStatus(
      id,
      updateEmployeeStatusDto,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignEmployeeRoleDto: AssignEmployeeRoleDto,
  ) {
    const employee = await this.employeesService.assignRole(
      id,
      assignEmployeeRoleDto,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignEmployeeDepartmentDto: AssignEmployeeDepartmentDto,
  ) {
    const employee = await this.employeesService.assignDepartment(
      id,
      assignEmployeeDepartmentDto,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignEmployeeScheduleDto: AssignEmployeeScheduleDto,
  ) {
    const employee = await this.employeesService.assignSchedule(
      id,
      assignEmployeeScheduleDto,
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
