import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class AssignEmployeeScheduleDto {
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  scheduleId!: string | null;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
