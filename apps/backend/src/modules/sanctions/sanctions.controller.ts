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
import { AccessRole } from '@prisma/client';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { CreateSanctionRuleDto } from './dto/create-sanction-rule.dto';
import { MonthlySanctionsQueryDto } from './dto/monthly-sanctions-query.dto';
import { UpdateSanctionRuleDto } from './dto/update-sanction-rule.dto';
import { SanctionsService } from './sanctions.service';

@Roles(AccessRole.ADMIN)
@Controller('sanctions')
export class SanctionsController {
  constructor(private readonly sanctionsService: SanctionsService) {}

  @Get('rules')
  getRules(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.sanctionsService.getRules(authentication);
  }

  @Get('rules/code/:code')
  getRuleByCode(
    @Param('code') code: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getRuleByCode(code, authentication);
  }

  @Get('rules/:id')
  getRuleById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getRuleById(id, authentication);
  }

  @Post('rules')
  createRule(
    @Body() payload: CreateSanctionRuleDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.createRule(payload, authentication);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateSanctionRuleDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.updateRule(id, payload, authentication);
  }

  @Get('monthly')
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
  getAttendanceSanction(
    @Param('attendanceId') attendanceId: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.sanctionsService.getAttendanceSanction(
      attendanceId,
      authentication,
    );
  }
}
