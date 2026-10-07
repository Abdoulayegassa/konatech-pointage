import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, Building2, Clock3, Users, UserCheck } from 'lucide-react';
import { OrganizationShell } from '@/components/layout/organization-shell';
import { DailyAlertsCard } from '@/components/dashboard/daily-alerts-card';
import { DashboardAnalyticsSection } from '@/components/dashboard/dashboard-analytics-section';
import { OwnerCompanyOverview } from '@/components/dashboard/owner-company-overview';
import {
  OwnerOnboardingChecklist,
  type OwnerOnboardingStep,
} from '@/components/dashboard/owner-onboarding-checklist';
import { RecentActivityList } from '@/components/dashboard/recent-activity-list';
import { AdminPageHeader } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getAttendanceSites,
  getDashboardData,
  getOwnerOnboardingStatus,
} from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vue d’ensemble de l’organisation' };

async function optionalRequest<T>(request: Promise<T>) {
  try {
    return { data: await request, unavailable: false } as const;
  } catch {
    return { data: null, unavailable: true } as const;
  }
}

async function getOwnerOnboardingData(token: string) {
  return optionalRequest(getOwnerOnboardingStatus(token));
}

export default async function DashboardPage() {
  const user = await requireCurrentUser();

  const membershipRole = user.membership?.role;
  const canViewDashboard = membershipRole
    ? membershipRole === 'ADMIN'
    : user.accessRole === 'ADMIN';

  if (!canViewDashboard) {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const [dashboard, attendanceSitesResult, ownerOnboardingResult] =
    await Promise.all([
      getDashboardData(token),
      optionalRequest(getAttendanceSites(token)),
      membershipRole === 'ADMIN' ? getOwnerOnboardingData(token) : null,
    ]);
  const attendanceSites = attendanceSitesResult.data ?? [];
  const activeSites = attendanceSites.filter((site) => site.isActive);
  const ownerOnboarding = ownerOnboardingResult?.data ?? null;
  const onboardingSteps: OwnerOnboardingStep[] | null =
    membershipRole === 'ADMIN'
      ? [
          {
            title: 'Profil de l’organisation',
            description:
              ownerOnboarding === null
                ? 'Le profil n’a pas pu être vérifié.'
                : ownerOnboarding.organizationProfile.configured
                  ? `${ownerOnboarding.organizationProfile.name} — ${ownerOnboarding.organizationProfile.timezone}.`
                  : 'Renseignez le nom et le fuseau horaire de référence.',
            href: '/organization/settings',
            linkLabel: 'Gérer le profil',
            state:
              ownerOnboarding === null
                ? 'unknown'
                : ownerOnboarding.organizationProfile.configured
                  ? 'complete'
                  : 'pending',
            importance: 'essential',
          },
          {
            title: 'Abonnement et quotas',
            description:
              ownerOnboarding === null
                ? 'L’abonnement n’a pas pu être vérifié.'
                : `Plan ${ownerOnboarding.subscription.plan} — statut ${ownerOnboarding.subscription.status}.`,
            href: '/organization/subscription',
            linkLabel: 'Consulter le plan',
            state: ownerOnboarding === null ? 'unknown' : 'complete',
            importance: 'available',
          },
          {
            title: 'Site de pointage',
            description:
              ownerOnboarding === null
                ? 'Les sites n’ont pas pu être vérifiés.'
                : ownerOnboarding.attendanceSites.activeCount > 0
                  ? `${ownerOnboarding.attendanceSites.activeCount} site(s) actif(s) disponible(s).`
                  : 'Ajoutez le lieu utilisé par le QR et les contrôles conditionnels.',
            href: '/sites',
            linkLabel: 'Gérer les sites',
            state:
              ownerOnboarding === null
                ? 'unknown'
                : ownerOnboarding.attendanceSites.activeCount > 0
                  ? 'complete'
                  : 'pending',
            importance: 'essential',
          },
          {
            title: 'Employés et équipe',
            description:
              ownerOnboarding === null
                ? 'Les employés n’ont pas pu être vérifiés.'
                : ownerOnboarding.employees.activeCount > 0 &&
                    ownerOnboarding.employees.pinConfiguredCount >=
                      ownerOnboarding.employees.activeCount
                  ? `${ownerOnboarding.employees.activeCount} employé(s) actif(s) avec un PIN configuré.`
                  : ownerOnboarding.employees.activeCount > 0
                    ? `${ownerOnboarding.employees.activeCount} employé(s) actif(s), mais certains PIN restent à configurer.`
                    : 'Créez un profil employé de pointage et configurez son PIN. Les comptes ADMIN et les invitations se gèrent séparément dans Membres.',
            href: '/organization/employees',
            linkLabel: 'Configurer l’équipe',
            state:
              ownerOnboarding === null
                ? 'unknown'
                : ownerOnboarding.employees.activeCount > 0 &&
                    ownerOnboarding.employees.pinConfiguredCount >=
                      ownerOnboarding.employees.activeCount
                  ? 'complete'
                  : 'pending',
            importance: 'essential',
          },
          {
            title: 'Planning de travail',
            description:
              ownerOnboarding === null
                ? 'Les plannings n’ont pas pu être vérifiés.'
                : ownerOnboarding.schedules.activeAssignedCount > 0
                  ? 'Un planning actif est affecté à un employé actif.'
                  : 'Créez puis affectez un planning pour calculer retards et absences.',
            href: activeSites.length === 1 ? `/site/${encodeURIComponent(activeSites[0].id)}/schedules` : '/sites',
            linkLabel: activeSites.length === 1 ? 'Gérer dans le site' : activeSites.length > 1 ? 'Choisir un site' : 'Créer un site',
            ...(activeSites.length > 1 ? { siteAction: 'schedules' as const } : {}),
            state:
              ownerOnboarding === null
                ? 'unknown'
                : ownerOnboarding.schedules.activeAssignedCount > 0
                  ? 'complete'
                  : 'pending',
            importance: 'essential',
          },
          {
            title: 'QR du site',
            description:
              ownerOnboarding === null
                ? 'La disponibilité du QR n’a pas pu être vérifiée.'
                : ownerOnboarding.qr.available
                  ? 'Le QR peut être généré pour votre site actif.'
                  : 'Le QR sera disponible dès qu’un site actif existe.',
            href: ownerOnboarding?.qr.available && activeSites.length === 1
              ? `/site/${encodeURIComponent(activeSites[0].id)}/qr`
              : '/sites',
            linkLabel: ownerOnboarding?.qr.available && activeSites.length === 1
              ? 'Générer le QR du site'
              : activeSites.length > 1 && ownerOnboarding?.qr.available ? 'Choisir un site' : 'Configurer un site',
            ...(ownerOnboarding?.qr.available && activeSites.length > 1 ? { siteAction: 'qr' as const } : {}),
            state:
              ownerOnboarding === null
                ? 'unknown'
                : ownerOnboarding.qr.available
                  ? 'complete'
                  : 'pending',
            importance: 'essential',
          },
          {
            title: 'Premier pointage',
            description:
              ownerOnboarding === null
                ? 'Les pointages n’ont pas pu être vérifiés.'
                : ownerOnboarding.attendance.firstClockInCompleted
                  ? 'Votre organisation a enregistré son premier pointage.'
                  : 'Testez le parcours réel avec le QR une fois la configuration prête.',
            href: ownerOnboarding?.qr.available && activeSites.length === 1
              ? `/site/${encodeURIComponent(activeSites[0].id)}/qr`
              : '/sites',
            linkLabel: ownerOnboarding?.qr.available && activeSites.length === 1
              ? 'Ouvrir le QR du site'
              : activeSites.length > 1 && ownerOnboarding?.qr.available ? 'Choisir un site' : 'Préparer le QR',
            ...(ownerOnboarding?.qr.available && activeSites.length > 1 ? { siteAction: 'qr' as const } : {}),
            state:
              ownerOnboarding === null
                ? 'unknown'
                : ownerOnboarding.attendance.firstClockInCompleted
                  ? 'complete'
                  : 'pending',
            importance: 'recommended',
          },
        ]
      : null;

  const hasActiveEmployees = dashboard.summary.totalEmployees > 0;
  const showOperations = membershipRole !== 'ADMIN' || activeSites.length > 0;
  const siteCount = ownerOnboarding?.attendanceSites.activeCount ??
    (attendanceSitesResult.unavailable ? null : activeSites.length);
  const kpis = [
    { label: 'Employés actifs', value: dashboard.summary.totalEmployees, Icon: Users, tone: 'text-slate-950', iconTone: 'bg-slate-100 text-slate-700' },
    { label: 'Sites actifs', value: siteCount ?? '—', Icon: Building2, tone: 'text-slate-950', iconTone: 'bg-blue-50 text-blue-700' },
    { label: "Présents aujourd’hui", value: dashboard.summary.presentToday, Icon: UserCheck, tone: 'text-success', iconTone: 'bg-success/10 text-success' },
    { label: "Retards aujourd’hui", value: dashboard.summary.lateEmployeesToday, Icon: Clock3, tone: 'text-warning', iconTone: 'bg-warning/10 text-warning' },
  ];

  return (
    <OrganizationShell current="dashboard" membershipRole={membershipRole}>
      <main className="space-y-6">
        <AdminPageHeader
          context={new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(dashboard.date))}
          title={user.organization?.name ?? 'Votre organisation'}
          description="Vue globale consolidée de votre organisation"
          primaryAction={membershipRole === 'ADMIN' ? <Link className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-10')} href="/organization/reports">Rapport du jour</Link> : undefined}
        />

        <section aria-labelledby="organization-kpis-title">
          <h2 className="sr-only" id="organization-kpis-title">Indicateurs de l’organisation</h2>
          <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ Icon: MetricIcon, iconTone, label, tone, value }) => <Card className="rounded-[10px] border-slate-200 bg-white shadow-none" key={label}>
              <CardContent className="flex min-h-36 flex-col gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium leading-5 text-slate-600">{label}</p><span aria-hidden="true" className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', iconTone)}><MetricIcon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span></div>
                  <p className={cn('admin-kpi-value mt-5 text-3xl font-semibold leading-none tabular-nums', tone)}>{value}</p>
                </div>
              </CardContent>
            </Card>)}
          </div>
        </section>

        {membershipRole === 'ADMIN' && !attendanceSitesResult.unavailable ? (
          <section aria-labelledby="organization-sites-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="text-lg font-semibold tracking-tight text-slate-950" id="organization-sites-title">Sites</h2><p className="text-sm text-slate-600">État opérationnel en temps réel</p></div>
              <Link className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-10')} href="/sites">Gérer les sites</Link>
            </div>
            {attendanceSites.length === 0 ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold text-slate-900">Aucun site configuré</p><p className="text-sm text-slate-600">Créez votre premier site pour organiser le pointage.</p></div>
                <Link className={cn(buttonVariants(), 'min-h-10')} href="/sites">Créer le premier site</Link>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{attendanceSites.map((site) => <li key={site.id}>
                <Card className="h-full rounded-[10px] border-slate-200 bg-white shadow-none"><CardContent className="flex min-h-44 h-full min-w-0 flex-col gap-3 p-5">
                  <div className="flex w-full min-w-0 items-start justify-between gap-2"><h3 className="min-w-0 break-words text-base font-semibold text-slate-950">{site.name}</h3><Badge className="shrink-0 normal-case tracking-normal" variant={site.isActive ? 'success' : 'neutral'}>{site.isActive ? 'Actif' : 'Inactif'}</Badge></div>
                  <p className="text-xs text-slate-500">Site opérationnel</p>
                  {site.isActive ? <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">Espace de pointage opérationnel</p> : <p className="py-3 text-center text-xs text-slate-400">Site inactif</p>}
                  <div className="mt-auto pt-1">{site.isActive ? <Link className="inline-flex min-h-9 items-center gap-1 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" href={`/site/${encodeURIComponent(site.id)}/dashboard`}>Ouvrir le site <Activity aria-hidden="true" className="h-4 w-4" /></Link> : <Link className="inline-flex min-h-9 items-center rounded-md text-sm font-semibold text-slate-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" href="/sites">Gérer le site</Link>}</div>
                </CardContent></Card>
              </li>)}</ul>
            )}
          </section>
        ) : null}

        {membershipRole === 'ADMIN' && attendanceSitesResult.unavailable ? <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-slate-800" role="status">La liste des sites est temporairement indisponible.</p> : null}
        {showOperations && activeSites.length > 0 ? <section aria-label="Analyse consolidée" className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          {hasActiveEmployees ? <RecentActivityList activity={dashboard.recentActivity} timeZone={user.organization?.timezone} /> : <div className="rounded-xl border border-slate-200 bg-white px-4 py-4"><h2 className="font-semibold text-slate-900">Aucun employé actif pour le moment</h2><p className="mt-1 text-sm text-slate-600">Ajoutez un employé pour commencer à suivre les opérations de vos sites.</p><Link className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href="/organization/employees">Ajouter un employé</Link></div>}
          <DailyAlertsCard activity={dashboard.recentActivity} dashboardDate={dashboard.date} timeZone={user.organization?.timezone} />
        </section> : null}
        <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          {showOperations && activeSites.length > 0 && hasActiveEmployees ? <DashboardAnalyticsSection analytics={dashboard.analytics} /> : <div className="rounded-[10px] border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold text-slate-900">Tendance des présences</h2><p className="mt-1 text-sm text-slate-500">Les séries historiques détaillées sont disponibles dans les rapports.</p><Link className="mt-4 inline-flex text-sm font-semibold text-primary underline" href="/organization/reports">Ouvrir les rapports</Link></div>}
          {membershipRole === 'ADMIN' ? <OwnerCompanyOverview status={ownerOnboarding} /> : <DailyAlertsCard activity={dashboard.recentActivity} dashboardDate={dashboard.date} timeZone={user.organization?.timezone} />}
        </section>
        {onboardingSteps ? <details className="rounded-[10px] border border-slate-200 bg-white px-5 py-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Configuration de départ</summary><div className="pt-4"><OwnerOnboardingChecklist steps={onboardingSteps} sites={attendanceSites} /></div></details> : null}
      </main>
    </OrganizationShell>
  );
}
