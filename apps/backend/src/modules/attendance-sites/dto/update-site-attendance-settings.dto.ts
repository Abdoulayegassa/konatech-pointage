import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const workDays = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
] as const;

/** Nullable values clear a site override and restore organization fallback. */
export class UpdateSiteAttendanceSettingsDto {
  @IsOptional() @IsBoolean() gpsRequired?: boolean | null;
  @IsOptional() @IsBoolean() selfieRequired?: boolean | null;
  @IsOptional() @IsInt() @Min(0) @Max(1440) defaultLatenessMarginMinutes?: number | null;
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value))
  @IsIn(workDays, { each: true })
  defaultWorkDays?: (typeof workDays)[number][] | null;
}
