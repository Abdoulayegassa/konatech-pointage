import { AccessRole, MembershipRole } from '@prisma/client';
import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/auth.constants';

export type AuthorizationRole = AccessRole | MembershipRole;

export const Roles = (...roles: AuthorizationRole[]) =>
  SetMetadata(ROLES_KEY, roles);
