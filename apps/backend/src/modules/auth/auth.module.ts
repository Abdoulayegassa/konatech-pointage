import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticationAttemptLimiterService } from './authentication-attempt-limiter.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AttendanceSitesModule } from '../attendance-sites/attendance-sites.module';

@Module({
  imports: [AttendanceSitesModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthenticationAttemptLimiterService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
