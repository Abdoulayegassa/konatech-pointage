import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateSanctionRuleDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  latenessMinMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  latenessMaxMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTolerance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountFcfa?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
