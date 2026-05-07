import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CheckInSecurityDto } from './check-in-security.dto';

export class CheckInDto extends CheckInSecurityDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}
