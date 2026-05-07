import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { CheckInSecurityDto } from './check-in-security.dto';

export class SelfCheckInDto extends CheckInSecurityDto {
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}
