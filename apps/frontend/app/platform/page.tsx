import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlatformShell } from '@/components/platform/platform-shell';
import { PlatformDashboard } from '@/components/platform/platform-dashboard';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { buttonVariants } from '@/components/ui/button';
import { AlertTriangle, ArrowUpRight, Building2, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiRequestError, getPlatformDashboard } from '@/lib/api';
import { getCurrentUser, getSessionToken } from '@/lib/auth';
import { getDefaultRedirectPath } from '@/lib/redirect';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'InOut — Tableau de bord plateforme',
};

export default async function PlatformPage() {
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
  if (!token) redirect('/login?redirectTo=%2Fplatform');

  try {
    const dashboard = await getPlatformDashboard(token);

    return (
      <PlatformShell activeSection="dashboard" maxWidthClassName="max-w-[1600px]">
        <div className="space-y-6">
          <AdminPageHeader
            context="SUPER ADMIN · CONTRÔLE PLATEFORME"
            title="Pilotage plateforme"
            description="État global des organisations, abonnements et usages SaaS."
            actions={<nav aria-label="Actions plateforme" className="flex flex-wrap gap-2 lg:justify-end">
              <Link className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-10 rounded-lg border-[#D9DCE1] bg-white px-3.5 text-sm text-[#30343A] shadow-none transition-colors hover:translate-y-0 hover:bg-[#F5F6F8] hover:shadow-none')} href="/platform/organizations">
                <Building2 aria-hidden="true" className="mr-2 h-4 w-4" />
                Organisations
                <ArrowUpRight aria-hidden="true" className="ml-2 h-3.5 w-3.5" />
              </Link>
              <Link className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-10 rounded-lg border-[#D9DCE1] bg-white px-3.5 text-sm text-[#30343A] shadow-none transition-colors hover:translate-y-0 hover:bg-[#F5F6F8] hover:shadow-none')} href="/platform/subscriptions">
                <CreditCard aria-hidden="true" className="mr-2 h-4 w-4" />
                Abonnements
                <ArrowUpRight aria-hidden="true" className="ml-2 h-3.5 w-3.5" />
              </Link>
            </nav>}
          />
          <PlatformDashboard data={dashboard} />
        </div>
      </PlatformShell>
    );
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect('/login?redirectTo=%2Fplatform');
    }

    return (
      <PlatformShell activeSection="dashboard" maxWidthClassName="max-w-[1600px]">
        <section
          aria-labelledby="platform-dashboard-error-title"
          className="rounded-xl border border-red-200 bg-white p-5 sm:p-6"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700">
              <AlertTriangle aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-[#25282D]" id="platform-dashboard-error-title">
                Tableau de bord plateforme indisponible
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-[#626973]">
                La session plateforme est active, mais les données ne sont pas disponibles. Réessayez dans un instant.
              </p>
              <Link className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-4 rounded-lg border-[#D9DCE1] bg-white text-[#30343A] shadow-none transition-colors hover:translate-y-0 hover:bg-[#F5F6F8] hover:shadow-none')} href="/platform">
                Réessayer
              </Link>
            </div>
          </div>
        </section>
      </PlatformShell>
    );
  }
}
