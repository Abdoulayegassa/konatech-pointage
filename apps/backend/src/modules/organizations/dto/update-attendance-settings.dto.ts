import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsIn, Max, Min } from 'class-validator';

const workDays = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export class UpdateAttendanceSettingsDto {
  @IsOptional() @IsBoolean() gpsRequired?: boolean;
  @IsOptional() @IsBoolean() selfieRequired?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(100000) allowedRadiusMeters?:
    | number
    | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) defaultLatenessMarginMinutes?:
    | number
    | null;
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value))
  @IsIn(workDays, { each: true })
  defaultWorkDays?: (typeof workDays)[number][] | null;
}
