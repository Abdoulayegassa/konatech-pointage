import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { MonthlySanctionsQueryDto } from './dto/monthly-sanctions-query.dto';
import { UpdateSanctionRuleDto } from './dto/update-sanction-rule.dto';
import { SanctionsService } from './sanctions.service';

@Roles(AccessRole.ADMIN)
@Controller('sanctions')
export class SanctionsController {
  constructor(private readonly sanctionsService: SanctionsService) {}

  @Get('rules')
  getRules() {
    return this.sanctionsService.getRules();
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: UpdateSanctionRuleDto,
  ) {
    return this.sanctionsService.updateRule(id, payload);
  }

  @Get('monthly')
  getMonthlySanctions(@Query() query: MonthlySanctionsQueryDto) {
    return this.sanctionsService.getMonthlySanctions(
      query.month,
      query.employeeId,
    );
  }

  @Get('attendance/:attendanceId')
  getAttendanceSanction(@Param('attendanceId') attendanceId: string) {
    return this.sanctionsService.getAttendanceSanction(attendanceId);
  }
}
