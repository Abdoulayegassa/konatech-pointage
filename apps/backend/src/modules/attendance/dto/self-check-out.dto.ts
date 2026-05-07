import { IsDateString, IsOptional } from 'class-validator';
import { CheckInSecurityDto } from './check-in-security.dto';

export class SelfCheckOutDto extends CheckInSecurityDto {
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
