import { createHash } from 'node:crypto';
import { SubscriptionEventType } from '@prisma/client';

export function subscriptionEventId(
  organizationId: string,
  type: SubscriptionEventType,
  operationId: string,
) {
  const digest = createHash('sha256').update(operationId).digest('hex');
  return `${organizationId}:${type.toLowerCase()}:${digest}`;
}

export function operationMetadata(
  operationId: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  return { operationId, ...metadata };
}
