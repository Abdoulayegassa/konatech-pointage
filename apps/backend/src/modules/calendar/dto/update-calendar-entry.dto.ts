import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const activeCalendarEntryTypes = ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] as const;

export class UpdateCalendarEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsIn(activeCalendarEntryTypes)
  type?: (typeof activeCalendarEntryTypes)[number];
}
