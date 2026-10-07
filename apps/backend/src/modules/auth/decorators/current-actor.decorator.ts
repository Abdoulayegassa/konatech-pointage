import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationActor } from '../interfaces/authorization-actor.interface';
import { AuthenticationContext } from '../interfaces/authentication-context.interface';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthorizationActor => {
    const request = context.switchToHttp().getRequest<{
      authentication?: AuthenticationContext;
      user?: AuthenticatedUser;
    }>();
    const authentication = request.authentication;

    if (!authentication) {
      throw new UnauthorizedException('Authentication context is unavailable.');
    }

    if (
      authentication.generation === 'saas' &&
      authentication.purpose === 'account' &&
      authentication.userId &&
      authentication.organizationId &&
      authentication.membershipRole
    ) {
      return {
        actorType: 'USER',
        actorId: authentication.userId,
        organizationId: authentication.organizationId,
        role: authentication.membershipRole,
        employeeId: authentication.employeeId,
      };
    }

    if (
      authentication.generation === 'legacy' &&
      authentication.employeeId &&
      request.user
    ) {
      return {
        actorType: 'EMPLOYEE',
        actorId: authentication.employeeId,
        organizationId: null,
        role: request.user.accessRole,
        employeeId: authentication.employeeId,
      };
    }

    throw new UnauthorizedException('Administrative actor is unavailable.');
  },
);
