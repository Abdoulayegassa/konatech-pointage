import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Check, LockKeyhole, UsersRound, UserCog, MapPin } from 'lucide-react';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { buttonVariants } from '@/components/ui/button';
import type { PlatformDashboard, PlatformPlanEntitlements, SubscriptionPlan } from '@/lib/api';
import { cn } from '@/lib/utils';

const plans: Array<{ key: SubscriptionPlan; name: string }> = [
  { key: 'STARTER', name: 'Starter' },
  { key: 'PRO', name: 'Pro' },
  { key: 'BUSINESS', name: 'Business' },
];

const numberFormat = new Intl.NumberFormat('fr-FR');

export function PlatformPlansView({ dashboard, plans: entitlements }: { dashboard: PlatformDashboard; plans: PlatformPlanEntitlements }) {
  const totalOrganizations = dashboard.statistics.totalOrganizations;
  const distribution = plans.map((plan) => ({
    ...plan,
    entitlements: entitlements[plan.key],
    organizations: dashboard.statistics.byPlan[plan.key] ?? 0,
    share: totalOrganizations > 0
      ? ((dashboard.statistics.byPlan[plan.key] ?? 0) / totalOrganizations) * 100
      : 0,
  }));

  return (
    <main className="min-w-0 space-y-6" aria-labelledby="plans-title">
      <AdminPageHeader
        context="SUPER ADMIN · GOUVERNANCE COMMERCIALE"
        title="Plans"
        id="plans-title"
        description="Limites actuellement appliquées et répartition des organisations par plan."
        className="border-b border-[#E2E5E9] pb-5"
        actions={
        <Link className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-10 w-fit rounded-lg border-[#D9DCE1] bg-white px-3.5 text-sm text-[#30343A] shadow-none transition-colors hover:translate-y-0 hover:bg-[#F5F6F8] hover:shadow-none')} href="/platform/subscriptions">
          Gérer les abonnements <ArrowUpRight aria-hidden="true" className="ml-2 h-4 w-4" />
        </Link>
        }
      />

      <section aria-labelledby="plans-comparison-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="plans-comparison-title" className="text-lg font-semibold text-[#25282D]">Configuration des plans</h2>
            <p className="mt-1 text-sm text-[#666D77]">Limites et fonctionnalités actuellement appliquées aux abonnements.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E5E9] bg-white px-2.5 py-1.5 text-xs font-medium text-[#555C66]"><LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />Lecture seule</span>
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-3">
          {distribution.map((plan) => (
            <article key={plan.key} className="min-w-0 rounded-xl border border-[#E0E3E8] bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 border-b border-[#ECEEF1] pb-4">
                <div>
                  <h3 className="text-base font-semibold text-[#25282D]">{plan.name}</h3>
                  <p className="mt-1 text-xs text-[#737983]">{plan.organizations.toLocaleString('fr-FR')} organisation{plan.organizations === 1 ? '' : 's'}</p>
                </div>
                <span className="rounded-md bg-[#F4F5F6] px-2 py-1 text-[11px] font-semibold tracking-wide text-[#616873]">{plan.key}</span>
              </div>

              <div className="pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#737983]">Limites</h4>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                  <Limit icon={<UsersRound aria-hidden="true" className="h-4 w-4" />} label="Employés actifs" value={numberFormat.format(plan.entitlements.activeEmployees)} />
                  <Limit icon={<UserCog aria-hidden="true" className="h-4 w-4" />} label="Capacité administrateurs" value={numberFormat.format(plan.entitlements.activeAdministrators)} />
                  <Limit icon={<MapPin aria-hidden="true" className="h-4 w-4" />} label="Sites actifs" value={numberFormat.format(plan.entitlements.activeAttendanceSites)} />
                </dl>
              </div>

              <div className="mt-4 border-t border-[#ECEEF1] pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[#737983]">Fonctionnalités produit</h4>
                {plan.entitlements.customExport ? <p className="mt-2 flex items-start gap-2 text-sm leading-5 text-[#454B54]"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />Export sur période personnalisée</p> : null}
                <p className="mt-2 text-xs leading-5 text-[#737983]">L’accès aux données historiques conservées est identique pour tous les plans. Les fonctionnalités disponibles sont communes aux trois plans.</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="plan-usage-title" className="rounded-xl border border-[#E0E3E8] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#ECEEF1] pb-4">
          <div>
            <h2 id="plan-usage-title" className="text-lg font-semibold text-[#25282D]">Utilisation des plans</h2>
            <p className="mt-1 text-sm text-[#666D77]">Part de chaque plan dans le portefeuille total des organisations.</p>
          </div>
          <p className="text-sm font-medium tabular-nums text-[#454B54]">{numberFormat.format(dashboard.statistics.totalOrganizations)} au total</p>
        </div>
        <div className="mt-4 space-y-4">
          {distribution.map((plan) => (
            <div key={plan.key} className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
              <span className="text-sm font-medium text-[#454B54]">{plan.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[#EFF1F3]" role="img" aria-label={`${plan.name} : ${plan.organizations} organisations, ${plan.share.toLocaleString('fr-FR')} % du total`}>
                <div className="h-full rounded-full bg-[#F35A24]" style={{ width: `${plan.share}%` }} />
              </div>
              <span className="text-sm tabular-nums text-[#25282D]">{numberFormat.format(plan.organizations)} <span className="text-[#737983]">organisation{plan.organizations === 1 ? '' : 's'}</span></span>
            </div>
          ))}
        </div>
      </section>

      <aside className="rounded-lg border border-[#E2E5E9] bg-[#F7F8F9] px-4 py-3 text-sm leading-5 text-[#626973]">
        Les limites affichées correspondent à la configuration actuellement appliquée par la plateforme. La tarification des plans n’est pas encore configurée.
      </aside>
    </main>
  );
}

function Limit({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs leading-4 text-[#737983]">{icon}<span>{label}</span></dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-[#25282D]">{value}</dd>
    </div>
  );
}
