import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const activeCalendarEntryTypes = ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] as const;

export class CreateCalendarEntryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsIn(activeCalendarEntryTypes)
  type!: (typeof activeCalendarEntryTypes)[number];
}
