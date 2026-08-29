import { Controller, Get } from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';

@Roles(AccessRole.ADMIN)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.dashboardService.getOverview(new Date(), authentication);
  }
}
