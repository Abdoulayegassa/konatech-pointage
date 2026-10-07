import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class MonthlySanctionsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format.',
  })
  month?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  employeeId?: string;
}
