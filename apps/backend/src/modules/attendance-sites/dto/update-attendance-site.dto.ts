import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAttendanceSiteDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'name must contain visible characters.' })
  @MaxLength(120)
  name?: string;
  @IsOptional() @Type(() => Number) @IsLatitude() latitude?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() longitude?: number;
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100_000)
  allowedRadiusMeters?: number;
}
