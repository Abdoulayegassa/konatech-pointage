import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentAuthentication } from './decorators/current-authentication.decorator';
import { Public } from './decorators/public.decorator';
import { AttendanceEntryLoginDto } from './dto/attendance-entry-login.dto';
import { InitialOrganizationSelectionDto } from './dto/initial-organization-selection.dto';
import { LoginDto } from './dto/login.dto';
import { SelectOrganizationDto } from './dto/select-organization.dto';
import { AuthService } from './auth.service';
import { AuthenticationAttemptLimiterService } from './authentication-attempt-limiter.service';
import { ATTENDANCE_ENTRY_RATE_LIMIT_MESSAGE } from './constants/attendance-entry.constants';
import { AuthenticationContext } from './interfaces/authentication-context.interface';
import { requireOrganizationContext } from './interfaces/organization-context.helpers';
import { ClientIpRequest, getClientIp } from '../../common/security/client-ip';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly attemptLimiter: AuthenticationAttemptLimiterService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() request: ClientRequest) {
    const ip = this.requestIp(request);
    const policies = [
      { name: 'password-short', limit: 5, ttlMs: 60_000 },
      { name: 'password-long', limit: 20, ttlMs: 600_000 },
    ];
    await this.attemptLimiter.assertAllowed(
      'password',
      ip,
      loginDto.email,
      policies,
      'Too many requests. Try again later.',
    );

    try {
      const result = await this.authService.login(loginDto);
      await this.attemptLimiter.clear('password', ip, loginDto.email, policies);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.attemptLimiter.recordFailure(
          'password',
          ip,
          loginDto.email,
          policies,
        );
      }
      throw error;
    }
  }

  @Public()
  @Post('organization/select-initial')
  completeInitialOrganizationSelection(
    @Body() dto: InitialOrganizationSelectionDto,
  ) {
    return this.authService.completeInitialOrganizationSelection(
      dto.challenge,
      dto.organizationId,
    );
  }

  @Public()
  @Post('attendance-entry/login')
  async loginForAttendanceEntry(
    @Body() attendanceEntryLoginDto: AttendanceEntryLoginDto,
    @Req() request: ClientRequest,
  ) {
    const ip = this.requestIp(request);
    const policies = [
      { name: 'pin-short', limit: 5, ttlMs: 60_000 },
      { name: 'pin-long', limit: 10, ttlMs: 600_000 },
    ];
    await this.attemptLimiter.assertAllowed(
      'attendance-pin',
      ip,
      attendanceEntryLoginDto.pinCode,
      policies,
      ATTENDANCE_ENTRY_RATE_LIMIT_MESSAGE,
    );

    try {
      const result = await this.authService.loginForAttendanceEntry(
        attendanceEntryLoginDto,
      );
      await this.attemptLimiter.clear(
        'attendance-pin',
        ip,
        attendanceEntryLoginDto.pinCode,
        policies,
      );
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.attemptLimiter.recordFailure(
          'attendance-pin',
          ip,
          attendanceEntryLoginDto.pinCode,
          policies,
        );
      }
      throw error;
    }
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

  private requestIp(request: ClientRequest) {
    return getClientIp(request);
  }
}

type ClientRequest = ClientIpRequest;
