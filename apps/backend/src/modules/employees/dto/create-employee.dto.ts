import { AccessRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DISALLOWED_EMPLOYEE_PIN_CODES,
  EMPLOYEE_PIN_CODE_PATTERN,
  INVALID_EMPLOYEE_PIN_MESSAGE,
} from '../../../common/validation/pin-code.validation';

export class CreateEmployeeDto {
  @IsOptional()
  @IsString()
  @Matches(EMPLOYEE_PIN_CODE_PATTERN, {
    message: INVALID_EMPLOYEE_PIN_MESSAGE,
  })
  @IsNotIn([...DISALLOWED_EMPLOYEE_PIN_CODES], {
    message: INVALID_EMPLOYEE_PIN_MESSAGE,
  })
  pinCode?: string;

  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(80)
  role!: string;

  @IsOptional()
  @IsEnum(AccessRole)
  accessRole?: AccessRole;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  scheduleId?: string;
}
