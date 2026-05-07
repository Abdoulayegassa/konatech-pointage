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
  findAll() {
    return this.schedulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedulesService.findOne(id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createScheduleDto: CreateScheduleDto,
  ) {
    const schedule = await this.schedulesService.create(createScheduleDto);

    this.auditLogService.logAdminAction({
      actor: user,
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    const schedule = await this.schedulesService.update(id, updateScheduleDto);

    this.auditLogService.logAdminAction({
      actor: user,
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
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateScheduleStatusDto: UpdateScheduleStatusDto,
  ) {
    const schedule = await this.schedulesService.updateStatus(
      id,
      updateScheduleStatusDto,
    );

    this.auditLogService.logAdminAction({
      actor: user,
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
