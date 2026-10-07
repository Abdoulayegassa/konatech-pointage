import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AccessRole, MembershipRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants/auth.constants';
import { AuthorizationRole } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AuthenticationContext } from '../interfaces/authentication-context.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<AuthorizationRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      authentication?: AuthenticationContext;
      user?: AuthenticatedUser;
    }>();
    const user = request.user;
    const authentication = request.authentication;

    if (authentication?.generation === 'saas') {
      if (authentication.purpose === 'attendance_entry') {
        if (
          !authentication.employeeId ||
          !user ||
          user.id !== authentication.employeeId ||
          !requiredRoles.includes(AccessRole.EMPLOYEE)
        ) {
          throw new ForbiddenException(
            'This session cannot access account resources.',
          );
        }

        return true;
      }

      if (authentication.purpose !== 'account') {
        throw new ForbiddenException(
          'This session cannot access account resources.',
        );
      }

      if (
        requiredRoles.includes(AccessRole.EMPLOYEE) &&
        authentication.membershipRole === MembershipRole.EMPLOYEE &&
        (!authentication.employeeId ||
          !user ||
          user.id !== authentication.employeeId ||
          !user.isActive)
      ) {
        throw new ForbiddenException(
          'An active employee profile is required for this resource.',
        );
      }

      if (
        !this.membershipRoleSatisfies(
          authentication.membershipRole,
          requiredRoles,
        )
      ) {
        throw new ForbiddenException(
          'Insufficient permissions for this resource.',
        );
      }

      return true;
    }

    if (!user) {
      return false;
    }

    if (!requiredRoles.includes(user.accessRole)) {
      throw new ForbiddenException(
        'Insufficient permissions for this resource.',
      );
    }

    return true;
  }

  private membershipRoleSatisfies(
    membershipRole: MembershipRole | null,
    requiredRoles: AuthorizationRole[],
  ) {
    if (!membershipRole) {
      return false;
    }

    return requiredRoles.some((requiredRole) => {
      if (requiredRole === membershipRole) {
        return true;
      }

      if (requiredRole === AccessRole.ADMIN) {
        return membershipRole === MembershipRole.ADMIN;
      }

      if (requiredRole === AccessRole.EMPLOYEE) {
        return membershipRole === MembershipRole.EMPLOYEE;
      }

      return false;
    });
  }
}
