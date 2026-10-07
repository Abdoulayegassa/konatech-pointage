import { Type, Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OfflineAttendanceReconciliationStatus } from '@prisma/client';

export class ReconciliationQueryDto {
  @IsOptional()
  @IsEnum(OfflineAttendanceReconciliationStatus)
  status?: OfflineAttendanceReconciliationStatus;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class ReconciliationDecisionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  @Matches(/\S/)
  reason!: string;
}
