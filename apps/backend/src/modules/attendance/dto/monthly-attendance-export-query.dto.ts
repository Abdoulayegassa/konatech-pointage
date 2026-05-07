import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class MonthlyAttendanceExportQueryDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
