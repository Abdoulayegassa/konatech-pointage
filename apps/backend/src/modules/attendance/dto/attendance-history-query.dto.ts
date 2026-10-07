import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const attendanceHistoryStatusFilters = [
  'present',
  'late',
  'absent',
  'non-working-day-work',
  'early-exit',
  'overtime',
  'incomplete',
] as const;

export type AttendanceHistoryStatusFilter =
  (typeof attendanceHistoryStatusFilters)[number];

export class AttendanceHistoryQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format.',
  })
  month?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').filter(Boolean),
  )
  @IsIn(attendanceHistoryStatusFilters, { each: true })
  status?: AttendanceHistoryStatusFilter[];

  @IsOptional()
  @IsIn(['all', 'checked-in', 'checked-out', 'incomplete'])
  attendance?: 'all' | 'checked-in' | 'checked-out' | 'incomplete';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
