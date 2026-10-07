import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticationContext } from '../interfaces/authentication-context.interface';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const authentication = context
      .switchToHttp()
      .getRequest<{ authentication?: AuthenticationContext }>().authentication;
    if (
      authentication?.purpose !== 'platform' ||
      !authentication.platformAdminId ||
      !authentication.userId
    ) {
      throw new ForbiddenException(
        'Platform administrator access is required.',
      );
    }
    return true;
  }
}
