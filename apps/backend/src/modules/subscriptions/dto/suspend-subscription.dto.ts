import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  operationId?: string;
}
