import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAttendanceSiteDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain visible characters.' })
  @MaxLength(120)
  name!: string;
  @Type(() => Number) @IsLatitude() latitude!: number;
  @Type(() => Number) @IsLongitude() longitude!: number;
  @Type(() => Number) @Min(1) @Max(100_000) allowedRadiusMeters!: number;
}
