import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedUser } from '../../modules/auth/interfaces/authenticated-user.interface';

type AuditLogInput = {
  actor: AuthenticatedUser;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AdminAudit');

  logAdminAction(input: AuditLogInput) {
    this.logger.warn(
      JSON.stringify({
        event: 'admin_audit',
        occurredAt: new Date().toISOString(),
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        actorRole: input.actor.accessRole,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? {},
      }),
    );
  }
}
