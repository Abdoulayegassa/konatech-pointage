import { UnauthorizedException } from '@nestjs/common';
import {
  AuthenticationContext,
  OrganizationContext,
} from './authentication-context.interface';

export function requireOrganizationContext(
  context: AuthenticationContext,
): OrganizationContext {
  if (
    context.generation !== 'saas' ||
    context.purpose !== 'account' ||
    !context.userId ||
    !context.membershipId ||
    !context.organizationId ||
    !context.membershipRole
  ) {
    throw new UnauthorizedException(
      'An active SaaS account organization context is required.',
    );
  }

  return context as OrganizationContext;
}
