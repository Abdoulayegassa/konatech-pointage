import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { EntitlementsService } from './entitlements.service';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      authentication?: AuthenticationContext;
    }>();
    if (READ_ONLY_METHODS.has(request.method ?? 'GET')) return true;

    const authentication = request.authentication;
    if (
      !authentication ||
      authentication.generation === 'legacy' ||
      authentication.purpose === 'platform' ||
      this.isOrganizationSelection(request.url)
    )
      return true;

    if (!authentication.organizationId)
      throw new ForbiddenException(
        'A valid organization context is required for this operation.',
      );
    await this.entitlements.assertOperationalWriteAllowed(
      authentication.organizationId,
    );
    return true;
  }

  private isOrganizationSelection(url?: string) {
    const path = url?.split('?')[0] ?? '';
    return (
      path.endsWith('/auth/organization/select') ||
      path.endsWith('/auth/organization/select-initial')
    );
  }
}
