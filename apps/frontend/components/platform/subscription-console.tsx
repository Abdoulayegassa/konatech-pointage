import type { PlatformOrganization } from '@/lib/api';
import { PlatformSubscriptionsWorkspace } from '@/components/platform/platform-subscriptions-workspace';

export function SubscriptionConsole({
  initialOrganizations,
  initialOrganizationId,
}: {
  initialOrganizations: PlatformOrganization[];
  initialOrganizationId?: string;
}) {
  return (
    <PlatformSubscriptionsWorkspace
      initialOrganizations={initialOrganizations}
      initialOrganizationId={initialOrganizationId}
    />
  );
}
