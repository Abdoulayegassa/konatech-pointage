import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CheckInSecurityDto } from './check-in-security.dto';

export class CheckOutDto extends CheckInSecurityDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
