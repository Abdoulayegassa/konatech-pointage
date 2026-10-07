import { Body, Controller, Get, Patch } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { UpdateAttendanceSettingsDto } from './dto/update-attendance-settings.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('current')
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.EMPLOYEE,
  )
  getCurrent(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.organizationsService.getCurrent(authentication);
  }

  @Get('current/owner-onboarding')
  @Roles(MembershipRole.ADMIN)
  getOwnerOnboarding(
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.organizationsService.getOwnerOnboarding(authentication);
  }

  @Get('current/attendance-settings')
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.EMPLOYEE,
  )
  getCurrentAttendanceSettings(
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.organizationsService.getCurrentAttendanceSettings(
      authentication,
    );
  }

  @Patch('current/attendance-settings')
  @Roles(MembershipRole.ADMIN)
  async updateCurrentAttendanceSettings(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() payload: UpdateAttendanceSettingsDto,
  ) {
    const settings =
      await this.organizationsService.updateCurrentAttendanceSettings(
        payload,
        authentication,
      );
    this.auditLogService.logAdminAction({
      actor,
      action: 'organization.attendance-settings.update',
      resource: 'organization-attendance-settings',
      resourceId: settings.organizationId,
      metadata: { changedFields: Object.keys(payload) },
    });
    return settings;
  }

  @Patch('current')
  @Roles(MembershipRole.ADMIN)
  async updateCurrent(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() payload: UpdateOrganizationProfileDto,
  ) {
    const organization = await this.organizationsService.updateCurrent(
      payload,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'organization.profile.update',
      resource: 'organization',
      resourceId: organization.id,
      metadata: {
        changedFields: Object.keys(payload),
      },
    });

    return organization;
  }
}
