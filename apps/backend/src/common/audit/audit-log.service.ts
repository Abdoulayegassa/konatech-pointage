import { Injectable, Logger } from '@nestjs/common';
import { AuthorizationActor } from '../../modules/auth/interfaces/authorization-actor.interface';
import { sanitizeAuditMetadata } from '../security/sensitive-data.util';

type AuditLogInput = {
  actor: AuthorizationActor;
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
        actorType: input.actor.actorType,
        actorId: input.actor.actorId,
        organizationId: input.actor.organizationId,
        actorRole: input.actor.role,
        employeeId: input.actor.employeeId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        metadata: sanitizeAuditMetadata(input.metadata),
      }),
    );
  }
}
