import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { PlatformShell } from '@/components/platform/platform-shell';
import { PlatformPlansView } from '@/components/platform/platform-plans-view';
import { ApiRequestError, getPlatformDashboard, getPlatformPlanEntitlements } from '@/lib/api';
import { getCurrentUser, getSessionToken } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'InOut — Plans' };

export default async function PlatformPlansPage() {
  const tenantUser = await getCurrentUser();
  if (tenantUser) {
    redirect(
      getDefaultRedirectPath(tenantUser.accessRole, tenantUser.membership?.role),
    );
  }

  const token = await getSessionToken();
  if (!token) redirect('/login?redirectTo=%2Fplatform%2Fplans');

  try {
    const [dashboard, plans] = await Promise.all([
      getPlatformDashboard(token),
      getPlatformPlanEntitlements(token),
    ]);
    return (
      <PlatformShell activeSection="plans">
        <PlatformPlansView dashboard={dashboard} plans={plans} />
      </PlatformShell>
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect('/login?redirectTo=%2Fplatform%2Fplans');
    }
    return (
      <PlatformShell activeSection="plans">
        <section className="rounded-xl border border-[#E2E5E9] bg-white p-5 sm:p-6" role="alert">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700">
              <AlertTriangle aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[#25282D]">Plans indisponibles</h1>
              <p className="mt-1 text-sm leading-5 text-[#626973]">
                Les données de la plateforme ne sont pas disponibles. Réessayez dans un instant.
              </p>
            </div>
          </div>
        </section>
      </PlatformShell>
    );
  }
}
