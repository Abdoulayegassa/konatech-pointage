import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CheckInSecurityProofDto } from './check-in-security.dto';

export enum OfflineAttendanceAction {
  CHECK_IN = 'check-in',
  CHECK_OUT = 'check-out',
}

export class OfflineAttendanceSyncDto {
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsUUID()
  clientRequestId!: string;

  // Opaque signed-session binding, not an employee, user, or tenant ID.
  @IsUUID()
  sessionBinding!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  contextToken?: string;

  @IsEnum(OfflineAttendanceAction)
  action!: OfflineAttendanceAction;

  @IsDateString()
  capturedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckInSecurityProofDto)
  security?: CheckInSecurityProofDto;
}
