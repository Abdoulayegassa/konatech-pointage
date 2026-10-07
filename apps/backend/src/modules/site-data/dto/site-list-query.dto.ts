import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class SiteListQueryDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100)
  pageSize?: number;

  @IsOptional() @IsString() @MaxLength(120)
  search?: string;

  @IsOptional() @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';
}
