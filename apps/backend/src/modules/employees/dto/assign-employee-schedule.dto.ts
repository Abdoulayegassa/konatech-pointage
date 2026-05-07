import { Transform } from 'class-transformer';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class AssignEmployeeScheduleDto {
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  scheduleId!: string | null;
}
