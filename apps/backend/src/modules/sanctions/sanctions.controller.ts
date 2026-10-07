import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AccessRole, MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { CreateSanctionRuleDto } from './dto/create-sanction-rule.dto';
import { MonthlySanctionsQueryDto } from './dto/monthly-sanctions-query.dto';
import { UpdateSanctionRuleDto } from './dto/update-sanction-rule.dto';
import { SanctionsService } from './sanctions.service';

@Roles(AccessRole.ADMIN)
@Controller('sanctions')
export class SanctionsController {
  constructor(
    private readonly sanctionsService: SanctionsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('rules')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  getRules(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.sanctionsService.getRules(authentication);
  }

  @Get('rules/code/:code')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  getRuleByCode(
    @Param('code') code: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getRuleByCode(code, authentication);
  }

  @Get('rules/:id')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  getRuleById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getRuleById(id, authentication);
  }

  @Post('rules')
  async createRule(
    @CurrentActor() actor: AuthorizationActor,
    @Body() payload: CreateSanctionRuleDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const rule = await this.sanctionsService.createRule(
      payload,
      authentication,
    );
    this.auditLogService.logAdminAction({
      actor,
      action: 'sanction.rule.create',
      resource: 'sanction_rule',
      resourceId: rule.id,
      metadata: { code: rule.code, type: rule.type },
    });
    return rule;
  }

  @Patch('rules/:id')
  async updateRule(
    @CurrentActor() actor: AuthorizationActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateSanctionRuleDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const rule = await this.sanctionsService.updateRule(
      id,
      payload,
      authentication,
    );
    this.auditLogService.logAdminAction({
      actor,
      action: 'sanction.rule.update',
      resource: 'sanction_rule',
      resourceId: id,
      metadata: { changedFields: Object.keys(payload) },
    });
    return rule;
  }

  @Get('monthly')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  getMonthlySanctions(
    @Query() query: MonthlySanctionsQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getMonthlySanctions(
      query.month,
      query.employeeId,
      authentication,
    );
  }

  @Get('attendance/:attendanceId')
  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  getAttendanceSanction(
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getAttendanceSanction(
      attendanceId,
      authentication,
    );
  }
}
