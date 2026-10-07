import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { UpdateMembershipRoleDto } from './dto/update-membership-role.dto';
import { UpdateMembershipStatusDto } from './dto/update-membership-status.dto';
import { MembershipsService } from './memberships.service';

@Controller('organizations/current/members')
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @Roles(MembershipRole.ADMIN)
  list(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.membershipsService.list(authentication);
  }

  @Get(':membershipId')
  @Roles(MembershipRole.ADMIN)
  findOne(
    @Param('membershipId') membershipId: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.membershipsService.findOne(membershipId, authentication);
  }

  @Patch(':membershipId/role')
  @Roles(MembershipRole.ADMIN)
  async changeRole(
    @Param('membershipId') membershipId: string,
    @Body() payload: UpdateMembershipRoleDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const result = await this.membershipsService.changeRole(
      membershipId,
      payload.role,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'membership.role.update',
      resource: 'membership',
      resourceId: result.membership.id,
      metadata: {
        targetUserId: result.membership.userId,
        previousRole: result.previousRole,
        newRole: result.membership.role,
        status: result.membership.status,
      },
    });

    return result.membership;
  }

  @Patch(':membershipId/status')
  @Roles(MembershipRole.ADMIN)
  async changeStatus(
    @Param('membershipId') membershipId: string,
    @Body() payload: UpdateMembershipStatusDto,
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const result = await this.membershipsService.changeStatus(
      membershipId,
      payload.status,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'membership.status.update',
      resource: 'membership',
      resourceId: result.membership.id,
      metadata: {
        targetUserId: result.membership.userId,
        role: result.membership.role,
        previousStatus: result.previousStatus,
        newStatus: result.membership.status,
      },
    });

    return result.membership;
  }
}
