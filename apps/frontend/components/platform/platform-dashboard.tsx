import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Building2,
  MapPin,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type {
  PlatformDashboard as PlatformDashboardData,
  PlatformOrganization,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/lib/api';
import { PlatformPlanDistributionChart } from './platform-plan-distribution-chart';

const numberFormat = new Intl.NumberFormat('fr-FR');

const planLabels: Record<SubscriptionPlan, string> = {
  STARTER: 'Starter',
  PRO: 'Pro',
  BUSINESS: 'Business',
};

const statusLabels: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Actifs',
  TRIALING: 'En essai',
  EXPIRED: 'Expirés',
  SUSPENDED: 'Suspendus',
  PENDING_DOWNGRADE: 'Baisse en attente',
  CANCELLED: 'Annulés',
};

const statusStyles: Record<SubscriptionStatus, { dot: string; text: string }> = {
  ACTIVE: { dot: 'bg-emerald-600', text: 'text-emerald-800' },
  TRIALING: { dot: 'bg-amber-500', text: 'text-amber-800' },
  EXPIRED: { dot: 'bg-red-600', text: 'text-red-800' },
  SUSPENDED: { dot: 'bg-red-600', text: 'text-red-800' },
  PENDING_DOWNGRADE: { dot: 'bg-amber-500', text: 'text-amber-800' },
  CANCELLED: { dot: 'bg-slate-400', text: 'text-slate-600' },
};

const activityLabels: Record<string, string> = {
  TRIAL_STARTED: 'Essai démarré',
  ACTIVATED: 'Abonnement activé',
  REACTIVATED: 'Abonnement réactivé',
  EXPIRED: 'Abonnement expiré',
  SUSPENDED: 'Abonnement suspendu',
  DOWNGRADE_SCHEDULED: 'Baisse de plan programmée',
  DOWNGRADE_APPLIED: 'Baisse de plan appliquée',
  CANCELLED: 'Abonnement annulé',
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date indisponible';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function panelClass() {
  return 'rounded-xl border border-[#E2E5E9] bg-white p-4 shadow-none sm:p-5';
}

function EmptyNote({ children, compact = false }: { children: string; compact?: boolean }) {
  return (
    <p className={`rounded-lg bg-[#F7F8F9] px-4 ${compact ? 'py-3' : 'py-4'} text-sm leading-5 text-[#626973]`}>
      {children}
    </p>
  );
}

type PlatformActivity = {
  key: string;
  label: string;
  occurredAt: string;
  organizationName: string;
};

function getRecentActivity(organizations: PlatformOrganization[]) {
  const activity: PlatformActivity[] = [];

  for (const organization of organizations) {
    for (const [index, event] of (organization.events ?? []).entries()) {
      const type = event.type;
      const occurredAt = event.occurredAt;
      if (typeof type !== 'string' || typeof occurredAt !== 'string') continue;
      activity.push({
        key: `${organization.organization.id}:${occurredAt}:${type}:${index}`,
        label: activityLabels[type] ?? 'Événement d’abonnement',
        occurredAt,
        organizationName: organization.organization.name,
      });
    }
  }

  return activity
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    )
    .slice(0, 6);
}

function RecentOrganizations({ organizations }: { organizations: PlatformOrganization[] }) {
  const recent = [...organizations]
    .sort(
      (left, right) =>
        new Date(right.organization.createdAt).getTime() -
        new Date(left.organization.createdAt).getTime(),
    )
    .slice(0, 5);

  return (
    <Card className={panelClass()}>
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-[#25282D]">
          Organisations récentes
        </h2>
        <p className="mt-1 text-sm leading-5 text-[#707680]">
          D’après la date de création enregistrée.
        </p>
      </header>
      {recent.length === 0 ? (
        <EmptyNote>Aucune organisation enregistrée.</EmptyNote>
      ) : (
        <ul className="divide-y divide-[#ECEEF0]">
          {recent.map((item) => (
            <li
              className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              key={item.organization.id}
            >
              <div className="min-w-0">
                <Link
                  className="block truncate text-[15px] font-medium text-[#30343A] hover:text-[#E65320] hover:underline"
                  href={`/platform/subscriptions?organizationId=${encodeURIComponent(item.organization.id)}`}
                >
                  {item.organization.name}
                </Link>
                <p className="mt-1 truncate text-[13px] text-[#707680]">
                  {planLabels[item.subscription.plan]} · {item.organization.slug}
                </p>
              </div>
              <time
                className="shrink-0 text-[13px] tabular-nums text-[#626973]"
                dateTime={item.organization.createdAt}
              >
                {formatDate(item.organization.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentActivity({ organizations }: { organizations: PlatformOrganization[] }) {
  const activity = getRecentActivity(organizations);

  return (
    <Card className={panelClass()}>
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-[#25282D]">
          Activité des abonnements
        </h2>
        <p className="mt-1 text-sm leading-5 text-[#707680]">
          Événements réellement enregistrés par la plateforme.
        </p>
      </header>
      {activity.length === 0 ? (
        <EmptyNote>Aucun événement d’abonnement récent.</EmptyNote>
      ) : (
        <ol className="space-y-3">
          {activity.map((item) => (
            <li className="flex min-w-0 gap-3" key={item.key}>
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F35A24]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-[#30343A]">
                  {item.label}
                </p>
                <p className="truncate text-[13px] text-[#626973]">
                  {item.organizationName}
                </p>
              </div>
              <time
                className="shrink-0 text-[13px] tabular-nums text-[#626973]"
                dateTime={item.occurredAt}
              >
                {formatDate(item.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SubscriptionAttention({ organizations }: { organizations: PlatformOrganization[] }) {
  const attentionItems = organizations.filter(
    (item) =>
      item.organization.status === 'SUSPENDED' ||
      item.subscription.status === 'SUSPENDED' ||
      item.subscription.status === 'EXPIRED',
  );
  const attention = [...attentionItems]
    .sort(
      (left, right) =>
        new Date(left.subscription.endsAt).getTime() -
        new Date(right.subscription.endsAt).getTime(),
    )
    .slice(0, 5);

  return (
    <Card className={panelClass()}>
      <header className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#25282D]">
            États à examiner
          </h2>
          <p className="mt-1 text-sm leading-5 text-[#707680]">
            {numberFormat.format(attentionItems.length)} organisation{attentionItems.length === 1 ? '' : 's'} concernée{attentionItems.length === 1 ? '' : 's'}.
          </p>
        </div>
      </header>
      {attention.length === 0 ? (
        <EmptyNote compact>Aucune organisation ni aucun abonnement expiré ou suspendu.</EmptyNote>
      ) : (
        <ul className="divide-y divide-[#ECEEF0]">
          {attention.map((item) => {
            const organizationSuspended =
              item.organization.status === 'SUSPENDED';
            const suspended =
              organizationSuspended ||
              item.subscription.status === 'SUSPENDED';
            const statusLabel = organizationSuspended
              ? 'Organisation suspendue'
              : item.subscription.status === 'SUSPENDED'
                ? 'Abonnement suspendu'
                : 'Abonnement expiré';
            return (
              <li
                className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                key={item.organization.id}
              >
                <div className="min-w-0">
                  <Link
                  className="block truncate text-[15px] font-medium text-[#30343A] hover:text-[#E65320] hover:underline"
                    href={`/platform/subscriptions?organizationId=${encodeURIComponent(item.organization.id)}`}
                  >
                    {item.organization.name}
                  </Link>
                  <p className="mt-1 text-[13px] text-[#626973]">
                    {planLabels[item.subscription.plan]} · {statusLabel}
                    {item.subscription.status === 'EXPIRED' ? ` · ${formatDate(item.subscription.endsAt)}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-[13px] font-medium ${suspended ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}
                >
                  {suspended ? 'Suspendu' : 'Expiré'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function PlatformDashboard({ data }: { data: PlatformDashboardData }) {
  const activeOrganizations = data.organizations.filter(
    (item) => item.organization.status === 'ACTIVE',
  ).length;
  const kpis = [
    { label: 'Organisations', value: data.statistics.totalOrganizations, detail: 'Portefeuille plateforme', icon: Building2, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Organisations actives', value: activeOrganizations, detail: 'Statut organisation', icon: BadgeCheck, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Employés actifs', value: data.statistics.usage.activeEmployees, detail: 'Tous les tenants', icon: UsersRound, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Sites actifs', value: data.statistics.usage.activeAttendanceSites, detail: 'Tous les tenants', icon: MapPin, tone: 'bg-amber-50 text-amber-700' },
  ];

  const statuses = Object.entries(statusLabels) as [
    SubscriptionStatus,
    string,
  ][];
  const planDistribution = (Object.entries(data.statistics.byPlan) as [
    SubscriptionPlan,
    number,
  ][]).map(([plan, count]) => ({ plan, count }));

  return (
    <div className="space-y-6">
      <section aria-label="Indicateurs plateforme" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, detail, icon: Icon, tone }) => <Card className="min-w-0 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-none" key={label}>
          <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium leading-5 text-[#626973]">{label}</p><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone}`}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span></div>
          <p className="mt-5 text-[32px] font-semibold leading-none tabular-nums tracking-tight text-[#25282D]">{numberFormat.format(value)}</p>
          <p className="mt-2 truncate text-[13px] text-[#707680]">{detail}</p>
        </Card>)}
      </section>

      {data.organizations.length === 0 ? (
        <section className="rounded-xl border border-dashed border-[#C8CDD4] bg-white px-5 py-6" role="status">
          <h2 className="text-base font-semibold text-[#30343A]">
            La plateforme ne compte encore aucune organisation
          </h2>
          <p className="mt-1 text-sm text-[#707680]">
            Les indicateurs et répartitions se rempliront à mesure que des organisations seront créées.
          </p>
        </section>
      ) : null}

      <section aria-label="Vue des abonnements" className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card className={panelClass()}>
          <header className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight text-[#25282D]">
              Répartition des plans
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#707680]">
              Abonnements actuels par plan, tous statuts confondus.
            </p>
          </header>
          <PlatformPlanDistributionChart data={planDistribution} />
        </Card>

        <Card className={panelClass()}>
          <header className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-[#25282D]">
              Cycle des abonnements
            </h2>
            <p className="mt-1 text-sm leading-5 text-[#707680]">
              Volumes par état de cycle retournés par la plateforme.
            </p>
          </header>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-2">
            {statuses.map(([status, label]) => (
              <li className="min-w-0" key={status}>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusStyles[status].dot}`} />
                  <span className={`truncate text-sm font-medium ${statusStyles[status].text}`}>
                    {label}
                  </span>
                </div>
                <p className="mt-1 pl-5 text-2xl font-semibold tabular-nums text-[#30343A]">
                  {numberFormat.format(data.statistics.byStatus[status])}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-label="Suivi plateforme" className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <SubscriptionAttention organizations={data.organizations} />
        <RecentOrganizations organizations={data.organizations} />
        <RecentActivity organizations={data.organizations} />
      </section>

      <p className="flex items-center gap-2 text-xs text-[#858B94]">
        <Activity aria-hidden="true" className="h-3.5 w-3.5" />
        Vue basée sur les données d’organisations et d’abonnements disponibles.
      </p>
    </div>
  );
}
