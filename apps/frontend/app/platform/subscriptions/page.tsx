import type { Metadata } from 'next';
import Link from 'next/link';
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
        <section
          aria-labelledby="subscriptions-error-title"
          className="rounded-xl border border-rose-200 bg-white p-5 sm:p-6"
          role="alert"
        >
          <h1
            className="text-lg font-semibold text-[#25282D]"
            id="subscriptions-error-title"
          >
            Abonnements indisponibles
          </h1>
          <p className="mt-1 text-sm leading-5 text-[#626973]">
            La session plateforme est active, mais le service ne répond pas.
            Réessayez plus tard ou déconnectez-vous.
          </p>
          <Link
            className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[#D9DCE1] px-3.5 text-sm font-medium text-[#30343A] hover:bg-[#F5F6F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F35A24] focus-visible:ring-offset-2"
            href="/platform/subscriptions"
          >
            Réessayer
          </Link>
        </section>
      </PlatformShell>
    );
  }
}
