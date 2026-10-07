import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AttendanceSitesService } from './attendance-sites.service';
import { CreateAttendanceSiteDto } from './dto/create-attendance-site.dto';
import { UpdateAttendanceSiteDto } from './dto/update-attendance-site.dto';
import { UpdateAttendanceSiteStatusDto } from './dto/update-attendance-site-status.dto';
import { UpdateSiteAttendanceSettingsDto } from './dto/update-site-attendance-settings.dto';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
@Controller('attendance-sites')
export class AttendanceSitesController {
  constructor(
    private readonly sites: AttendanceSitesService,
    private readonly auditLogService: AuditLogService,
  ) {}
  @Get()
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.EMPLOYEE,
  )
  list(@CurrentAuthentication() auth: AuthenticationContext) {
    return this.sites.list(auth);
  }
  @Post() @Roles(MembershipRole.ADMIN) create(
    @Body() dto: CreateAttendanceSiteDto,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.sites.create(dto, auth);
  }
  @Patch(':id') @Roles(MembershipRole.ADMIN) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceSiteDto,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.sites.update(id, dto, auth);
  }
  @Patch(':id/status')
  @Roles(MembershipRole.ADMIN)
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttendanceSiteStatusDto,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.sites.setStatus(id, dto.isActive, auth);
  }

  @Get(':id/settings')
  @Roles(MembershipRole.ADMIN)
  getSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    return this.sites.getSettings(id, auth);
  }

  @Patch(':id/settings')
  @Roles(MembershipRole.ADMIN)
  async updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteAttendanceSettingsDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() auth: AuthenticationContext,
  ) {
    const settings = await this.sites.updateSettings(id, dto, auth);
    this.auditLogService.logAdminAction({
      actor,
      action: 'attendance-site.settings.update',
      resource: 'site-attendance-settings',
      resourceId: settings.id,
      metadata: { siteId: id, changedFields: Object.keys(dto) },
    });
    return settings;
  }
}
