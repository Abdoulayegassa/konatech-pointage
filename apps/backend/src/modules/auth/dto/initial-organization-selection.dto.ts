import { IsString, MinLength } from 'class-validator';

export class InitialOrganizationSelectionDto {
  @IsString()
  @MinLength(1)
  challenge!: string;

  @IsString()
  @MinLength(1)
  organizationId!: string;
}
