import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AttendanceHistoryQueryDto } from '../attendance/dto/attendance-history-query.dto';
import { UpdateScheduleDto } from '../schedules/dto/update-schedule.dto';
import { UpdateScheduleStatusDto } from '../schedules/dto/update-schedule-status.dto';
import { CreateSiteScheduleDto } from '../schedules/dto/create-site-schedule.dto';
import { SchedulesService } from '../schedules/schedules.service';
import { SiteListQueryDto } from './dto/site-list-query.dto';
import { SiteDataService } from './site-data.service';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarMonthQueryDto } from '../calendar/dto/calendar-month-query.dto';
import { CreateCalendarEntryDto } from '../calendar/dto/create-calendar-entry.dto';
import { UpdateCalendarEntryDto } from '../calendar/dto/update-calendar-entry.dto';
import { MonthlySanctionsQueryDto } from '../sanctions/dto/monthly-sanctions-query.dto';
import { SanctionsService } from '../sanctions/sanctions.service';

@Roles(MembershipRole.ADMIN)
@Controller('attendance-sites/:siteId')
export class SiteDataController {
  constructor(
    private readonly data: SiteDataService,
    private readonly scheduleService: SchedulesService,
    private readonly auditLogService: AuditLogService,
    private readonly calendarService: CalendarService,
    private readonly sanctionsService: SanctionsService,
  ) {}

  @Get()
  detail(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentAuthentication() auth: AuthenticationContext) {
    return this.data.detail(siteId, auth);
  }

  @Get('dashboard')
  dashboard(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentAuthentication() auth: AuthenticationContext) {
    return this.data.dashboard(siteId, auth);
  }

  @Get('employees')
  employees(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: SiteListQueryDto, @CurrentAuthentication() auth: AuthenticationContext) {
    return this.data.employees(siteId, query, auth);
  }

  @Get('schedules')
  schedules(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: SiteListQueryDto, @CurrentAuthentication() auth: AuthenticationContext) {
    return this.data.schedules(siteId, query, auth);
  }

  @Get('schedules/:scheduleId')
  schedule(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.scheduleService.findOneForSite(siteId, scheduleId, auth);
  }

  @Get('calendar')
  siteCalendar(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: CalendarMonthQueryDto,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.calendarService.getSiteMonthOverview(siteId, query.month, auth);
  }

  @Post('calendar/holidays')
  async createSiteCalendarEntry(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() payload: CreateCalendarEntryDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const entry = await this.calendarService.createForSite(siteId, payload, auth);
    this.auditLogService.logAdminAction({
      actor, action: 'calendar.site-entry.create', resource: 'calendar_entry',
      resourceId: entry.id, metadata: { siteId, name: entry.name, date: entry.date },
    });
    return { ...entry, scope: 'SITE', inherited: false };
  }

  @Patch('calendar/holidays/:entryId')
  async updateSiteCalendarEntry(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() payload: UpdateCalendarEntryDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const entry = await this.calendarService.updateForSite(siteId, entryId, payload, auth);
    this.auditLogService.logAdminAction({
      actor, action: 'calendar.site-entry.update', resource: 'calendar_entry',
      resourceId: entry.id, metadata: { siteId, changedFields: Object.keys(payload) },
    });
    return { ...entry, scope: 'SITE', inherited: false };
  }

  @Delete('calendar/holidays/:entryId')
  async deleteSiteCalendarEntry(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const entry = await this.calendarService.removeForSite(siteId, entryId, auth);
    this.auditLogService.logAdminAction({
      actor, action: 'calendar.site-entry.delete', resource: 'calendar_entry',
      resourceId: entry.id, metadata: { siteId, name: entry.name },
    });
    return entry;
  }

  @Post('schedules')
  async createSchedule(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() payload: CreateSiteScheduleDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const schedule = await this.scheduleService.createForSite(siteId, payload, auth);
    this.auditLogService.logAdminAction({
      actor,
      action: 'schedule.create',
      resource: 'schedule',
      resourceId: schedule.id,
      metadata: { siteId, name: schedule.name },
    });
    return schedule;
  }

  @Patch('schedules/:scheduleId')
  async updateSchedule(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() payload: UpdateScheduleDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const schedule = await this.scheduleService.update(scheduleId, payload, auth, siteId);
    this.auditLogService.logAdminAction({
      actor,
      action: 'schedule.update',
      resource: 'schedule',
      resourceId: schedule.id,
      metadata: { siteId, changedFields: Object.keys(payload) },
    });
    return schedule;
  }

  @Patch('schedules/:scheduleId/status')
  async updateScheduleStatus(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() payload: UpdateScheduleStatusDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const schedule = await this.scheduleService.updateStatus(scheduleId, payload, auth, siteId);
    this.auditLogService.logAdminAction({
      actor,
      action: 'schedule.status.update',
      resource: 'schedule',
      resourceId: schedule.id,
      metadata: { siteId, isActive: payload.isActive },
    });
    return schedule;
  }

  @Get('attendance')
  attendance(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: AttendanceHistoryQueryDto, @CurrentAuthentication() auth: AuthenticationContext) {
    return this.data.attendance(siteId, query, auth);
  }

  @Get('history')
  history(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: AttendanceHistoryQueryDto, @CurrentAuthentication() auth: AuthenticationContext) {
    return this.data.history(siteId, query, auth);
  }

  @Get('sanctions')
  sanctions(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: MonthlySanctionsQueryDto,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.sanctionsService.getMonthlySanctions(
      query.month,
      query.employeeId,
      auth,
      siteId,
    );
  }
}
