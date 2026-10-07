import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { CurrentPlatformAdmin } from '../auth/decorators/current-platform-admin.decorator';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';
import { ProvisionOrganizationDto } from '../subscriptions/dto/provision-organization.dto';

@Controller()
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @UseGuards(PlatformAdminGuard)
  @Post('platform/organizations')
  @Header('Cache-Control', 'no-store')
  async provisionOrganization(
    @Body() payload: ProvisionOrganizationDto,
    @CurrentPlatformAdmin() actorUserId: string,
  ) {
    const result =
      await this.invitationsService.provisionOrganizationWithFirstAdmin({
        ...payload,
        invitedByUserId: actorUserId,
      });
    this.auditLogService.logAdminAction({
      actor: {
        actorType: 'USER',
        actorId: actorUserId,
        organizationId: null,
        role: 'PLATFORM_ADMIN',
        employeeId: null,
      } as never,
      action: 'organization.provision',
      resource: 'organization',
      resourceId: result.organization.id,
      metadata: {
        firstAdminInvitationId: result.firstAdminInvitation.invitation.id,
      },
    });
    return result;
  }

  @Post('organizations/current/invitations')
  @Header('Cache-Control', 'no-store')
  @Roles(MembershipRole.ADMIN)
  async create(
    @Body() payload: CreateInvitationDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const result = await this.invitationsService.create(
      payload.email,
      authentication,
      payload.role ?? MembershipRole.EMPLOYEE,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'invitation.create',
      resource: 'invitation',
      resourceId: result.invitation.id,
    });

    return {
      invitation: result.invitation,
      invitationToken: result.token,
    };
  }

  @Get('organizations/current/invitations')
  @Roles(MembershipRole.ADMIN)
  list(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.invitationsService.list(authentication);
  }

  @Get('organizations/current/invitations/:invitationId')
  @Roles(MembershipRole.ADMIN)
  findOne(
    @Param('invitationId') invitationId: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.invitationsService.findOne(invitationId, authentication);
  }

  @Patch('organizations/current/invitations/:invitationId/revoke')
  @Roles(MembershipRole.ADMIN)
  async revoke(
    @Param('invitationId') invitationId: string,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const invitation = await this.invitationsService.revoke(
      invitationId,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'invitation.revoke',
      resource: 'invitation',
      resourceId: invitation.id,
    });

    return invitation;
  }

  @Public()
  @Post('invitations/accept')
  @Header('Cache-Control', 'no-store')
  async accept(@Body() payload: AcceptInvitationDto) {
    const result = await this.invitationsService.accept(
      payload.token,
      payload.password,
    );

    this.auditLogService.logAdminAction({
      actor: {
        actorType: 'USER',
        actorId: result.user.id,
        organizationId: result.organization.id,
        role: result.membership.role,
        employeeId: null,
      },
      action: 'invitation.accept',
      resource: 'invitation',
      resourceId: result.invitationId,
      metadata: {
        targetUserId: result.user.id,
        membershipId: result.membership.id,
      },
    });

    return {
      user: result.user,
      membership: result.membership,
      organization: result.organization,
    };
  }
}
