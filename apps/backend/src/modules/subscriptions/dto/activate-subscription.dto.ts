import { SubscriptionPlan } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ActivateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalPaymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;
}
