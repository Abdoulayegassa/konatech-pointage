import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CheckInSecurityProofDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50000)
  accuracyMeters?: number;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxLength(1000000)
  @Matches(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/, {
    message: 'Selfie requis pour valider le pointage.',
  })
  verificationPhotoDataUrl?: string;
}

export class CheckInSecurityDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckInSecurityProofDto)
  security?: CheckInSecurityProofDto;
}
