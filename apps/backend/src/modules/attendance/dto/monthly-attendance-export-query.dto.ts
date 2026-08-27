import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class MonthlyAttendanceExportQueryDto {
  @IsOptional()
  @IsIn(['monthly', 'custom'])
  mode?: 'monthly' | 'custom';

  @ValidateIf((query) => query.mode !== 'custom')
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ValidateIf((query) => query.mode !== 'custom')
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ValidateIf((query) => query.mode === 'custom')
  @IsDateString()
  startDate?: string;

  @ValidateIf((query) => query.mode === 'custom')
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf';

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
