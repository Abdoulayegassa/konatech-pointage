import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlatformShell } from '@/components/platform/platform-shell';
import { SubscriptionConsole } from '@/components/platform/subscription-console';
import { ApiRequestError, getPlatformOrganizations } from '@/lib/api';
import { getCurrentUser, getSessionToken } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const metadata: Metadata = {
  title: 'InOut — Abonnements',
};

export const dynamic = 'force-dynamic';

export default async function PlatformSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const tenantUser = await getCurrentUser();
  if (tenantUser) {
    redirect(
      getDefaultRedirectPath(
        tenantUser.accessRole,
        tenantUser.membership?.role,
      ),
    );
  }

  const token = await getSessionToken();
  if (!token) redirect('/login?redirectTo=%2Fplatform%2Fsubscriptions');

  try {
    const [organizations, params] = await Promise.all([
      getPlatformOrganizations(token),
      searchParams,
    ]);
    return (
      <PlatformShell activeSection="subscriptions">
        <SubscriptionConsole
          initialOrganizations={organizations}
          initialOrganizationId={params.organizationId}
        />
      </PlatformShell>
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect('/login?redirectTo=%2Fplatform%2Fsubscriptions');
    }
    return (
      <PlatformShell activeSection="subscriptions">
        <div className="rounded-3xl border border-red-100 bg-white p-6">
          <h1 className="text-xl font-black text-slate-950">
            Abonnements indisponibles
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            La session plateforme est active, mais le service ne répond pas.
            Réessayez plus tard ou déconnectez-vous.
          </p>
        </div>
      </PlatformShell>
    );
  }
}
