import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class TransferEmployeeSiteDto {
  @IsUUID()
  siteId!: string;

  /** ISO calendar date; intervals are [effectiveFrom, effectiveTo). */
  @IsDateString()
  effectiveFrom!: string;

  /** A transfer never infers a target schedule. */
  @IsOptional()
  @IsUUID()
  scheduleId?: string;
}
