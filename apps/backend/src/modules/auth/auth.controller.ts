import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentAuthentication } from './decorators/current-authentication.decorator';
import { Public } from './decorators/public.decorator';
import { AttendanceEntryLoginDto } from './dto/attendance-entry-login.dto';
import { LoginDto } from './dto/login.dto';
import { SelectOrganizationDto } from './dto/select-organization.dto';
import { AuthService } from './auth.service';
import { AuthenticationContext } from './interfaces/authentication-context.interface';
import { requireOrganizationContext } from './interfaces/organization-context.helpers';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('attendance-entry/login')
  loginForAttendanceEntry(
    @Body() attendanceEntryLoginDto: AttendanceEntryLoginDto,
  ) {
    return this.authService.loginForAttendanceEntry(attendanceEntryLoginDto);
  }

  @Get('me')
  me(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.authService.getCurrentIdentity(authentication);
  }

  @Get('organizations')
  organizations(
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const context = requireOrganizationContext(authentication);
    return this.authService.getAvailableOrganizations(context.userId);
  }

  @Post('organization/select')
  selectOrganization(
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Body() dto: SelectOrganizationDto,
  ) {
    const context = requireOrganizationContext(authentication);
    return this.authService.selectOrganization(
      context.userId,
      dto.organizationId,
    );
  }
}
