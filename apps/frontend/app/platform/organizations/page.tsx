import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { PlatformShell } from '@/components/platform/platform-shell';
import { PlatformOrganizationsView } from '@/components/platform/platform-organizations-view';
import { ApiRequestError, getPlatformDashboard } from '@/lib/api';
import { getCurrentUser, getSessionToken } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'InOut — Organisations',
};

export default async function PlatformOrganizationsPage() {
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
  if (!token) redirect('/login?redirectTo=%2Fplatform%2Forganizations');

  try {
    const dashboard = await getPlatformDashboard(token);
    return (
      <PlatformShell activeSection="organizations">
        <PlatformOrganizationsView initialDashboard={dashboard} />
      </PlatformShell>
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect('/login?redirectTo=%2Fplatform%2Forganizations');
    }
    return (
      <PlatformShell activeSection="organizations">
        <div className="rounded-3xl border border-red-100 bg-white p-6">
          <h1 className="text-xl font-black text-slate-950">
            Organisations indisponibles
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
