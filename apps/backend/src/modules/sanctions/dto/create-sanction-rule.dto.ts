import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const activeSanctionRuleTypes = ['MINOR_LATENESS', 'MAJOR_LATENESS'] as const;

export class CreateSanctionRuleDto {
  @IsIn(activeSanctionRuleTypes)
  type!: (typeof activeSanctionRuleTypes)[number];

  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  latenessMinMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  latenessMinInclusive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  latenessMaxMinutes?: number | null;

  @IsOptional()
  @IsBoolean()
  latenessMaxInclusive?: boolean;

  @IsInt()
  @Min(0)
  monthlyTolerance!: number;

  @IsInt()
  @Min(0)
  amountFcfa!: number;

  @IsInt()
  @Min(0)
  priority!: number;

  @IsString()
  appliedReason!: string;

  @IsOptional()
  @IsString()
  toleratedReason?: string | null;
}
