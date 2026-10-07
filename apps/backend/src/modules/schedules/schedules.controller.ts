import {
  Body,
  Controller,
  Get,
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
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { UpdateScheduleStatusDto } from './dto/update-schedule-status.dto';
import { SchedulesService } from './schedules.service';

@Roles(AccessRole.ADMIN)
@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  findAll(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.schedulesService.findAll(authentication);
  }

  @Get(':id')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.schedulesService.findOne(id, authentication);
  }

  @Post()
  async create(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() createScheduleDto: CreateScheduleDto,
  ) {
    const schedule = await this.schedulesService.create(
      createScheduleDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'schedule.create',
      resource: 'schedule',
      resourceId: schedule.id,
      metadata: {
        name: createScheduleDto.name,
        startTime: createScheduleDto.startTime,
        endTime: createScheduleDto.endTime,
        workDays: createScheduleDto.workDays,
        isActive: createScheduleDto.isActive,
      },
    });

    return schedule;
  }

  @Patch(':id')
  async update(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    const schedule = await this.schedulesService.update(
      id,
      updateScheduleDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'schedule.update',
      resource: 'schedule',
      resourceId: id,
      metadata: {
        changedFields: Object.keys(updateScheduleDto),
      },
    });

    return schedule;
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduleStatusDto: UpdateScheduleStatusDto,
  ) {
    const schedule = await this.schedulesService.updateStatus(
      id,
      updateScheduleStatusDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'schedule.status.update',
      resource: 'schedule',
      resourceId: id,
      metadata: {
        isActive: updateScheduleStatusDto.isActive,
      },
    });

    return schedule;
  }
}
