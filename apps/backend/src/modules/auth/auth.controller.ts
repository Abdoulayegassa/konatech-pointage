import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AttendanceEntryLoginDto } from './dto/attendance-entry-login.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

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
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
