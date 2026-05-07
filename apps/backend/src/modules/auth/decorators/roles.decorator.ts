import { AccessRole } from '@prisma/client';
import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/auth.constants';

export const Roles = (...roles: AccessRole[]) => SetMetadata(ROLES_KEY, roles);
