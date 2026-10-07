import {
  Body,
  Controller,
  Get,
  Query,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AccessRole, MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AssignEmployeeDepartmentDto } from './dto/assign-employee-department.dto';
import { AssignEmployeeRoleDto } from './dto/assign-employee-role.dto';
import { AssignEmployeeScheduleDto } from './dto/assign-employee-schedule.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import { TransferEmployeeSiteDto } from './dto/transfer-employee-site.dto';
import { EmployeesService } from './employees.service';

@Roles(AccessRole.ADMIN)
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  findAll(
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Query('siteId') siteId?: string,
  ) {
    return this.employeesService.findAll(authentication, siteId);
  }

  @Get(':id')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.employeesService.findOne(id, authentication);
  }

  @Post()
  async create(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    const employee = await this.employeesService.create(
      createEmployeeDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'employee.create',
      resource: 'employee',
      resourceId: employee.id,
      metadata: {
        accessRole: createEmployeeDto.accessRole,
        scheduleId: createEmployeeDto.scheduleId ?? null,
        isActive: createEmployeeDto.isActive,
      },
    });

    return employee;
  }

  @Patch(':id')
  async update(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    const employee = await this.employeesService.update(
      id,
      updateEmployeeDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
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
    @CurrentActor() actor: AuthorizationActor,
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
      actor,
      action: 'employee.status.update',
      resource: 'employee',
      resourceId: id,
      metadata: {
        isActive: updateEmployeeStatusDto.isActive,
      },
    });

    return employee;
  }

  @Patch(':id/site')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  async transferSite(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: TransferEmployeeSiteDto,
  ) {
    const employee = await this.employeesService.transferSite(
      id,
      payload,
      authentication,
    );
    this.auditLogService.logAdminAction({
      actor,
      action: 'employee.site.transfer',
      resource: 'employee',
      resourceId: id,
      metadata: { siteId: payload.siteId, effectiveFrom: payload.effectiveFrom },
    });
    return employee;
  }

  @Patch(':id/role')
  async assignRole(
    @CurrentActor() actor: AuthorizationActor,
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
      actor,
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
    @CurrentActor() actor: AuthorizationActor,
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
      actor,
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
    @CurrentActor() actor: AuthorizationActor,
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
      actor,
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
