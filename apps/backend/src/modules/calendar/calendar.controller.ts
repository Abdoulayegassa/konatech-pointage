import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { CalendarMonthQueryDto } from './dto/calendar-month-query.dto';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';
import { CalendarService } from './calendar.service';

@Roles(AccessRole.ADMIN)
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('month')
  getMonthOverview(
    @Query() query: CalendarMonthQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.calendarService.getMonthOverview(query.month, authentication);
  }

  @Get('holidays')
  getMonthEntries(
    @Query() query: CalendarMonthQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.calendarService.findMonthEntries(query.month, authentication);
  }

  @Post('holidays')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() payload: CreateCalendarEntryDto,
  ) {
    const entry = await this.calendarService.create(payload, authentication);

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'calendar.entry.create',
      resource: 'calendar_entry',
      resourceId: entry.id,
      metadata: {
        name: payload.name,
        date: payload.date,
        type: payload.type,
      },
    });

    return entry;
  }

  @Patch('holidays/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateCalendarEntryDto,
  ) {
    const entry = await this.calendarService.update(
      id,
      payload,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'calendar.entry.update',
      resource: 'calendar_entry',
      resourceId: id,
      metadata: {
        changedFields: Object.keys(payload),
      },
    });

    return entry;
  }

  @Delete('holidays/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const entry = await this.calendarService.remove(id, authentication);

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'calendar.entry.delete',
      resource: 'calendar_entry',
      resourceId: id,
      metadata: {
        name: entry.name,
        type: entry.type,
      },
    });

    return entry;
  }
}
