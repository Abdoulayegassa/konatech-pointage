import { SubscriptionPlan } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ScheduleDowngradeDto {
  @IsIn([SubscriptionPlan.STARTER, SubscriptionPlan.PRO])
  plan!: SubscriptionPlan;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operationId?: string;
}
