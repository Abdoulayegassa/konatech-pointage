import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CheckInSecurityDto } from './check-in-security.dto';

export class CheckOutDto extends CheckInSecurityDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
