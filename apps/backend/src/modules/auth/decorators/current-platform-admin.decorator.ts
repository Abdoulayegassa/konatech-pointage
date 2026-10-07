import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentPlatformAdmin = createParamDecorator(
  (_: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<{
      authentication?: {
        purpose?: string;
        userId?: string | null;
        platformAdminId?: string | null;
      };
    }>().authentication?.userId ?? null,
);
