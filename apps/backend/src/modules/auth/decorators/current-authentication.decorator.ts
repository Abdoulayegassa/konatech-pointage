import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticationContext } from '../interfaces/authentication-context.interface';

export const CurrentAuthentication = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticationContext => {
    const request = context
      .switchToHttp()
      .getRequest<{ authentication?: AuthenticationContext }>();

    if (!request.authentication) {
      throw new UnauthorizedException('Authentication context is unavailable.');
    }

    return request.authentication;
  },
);
