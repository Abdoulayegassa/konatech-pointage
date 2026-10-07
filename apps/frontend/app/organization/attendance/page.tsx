import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { AdminPageHeader, PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { getDashboardData, getAttendanceSites } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const statusLabels: Record<string, string> = {
  PRESENT: 'Présent',
  LATE: 'En retard',
  ABSENT: 'Absent',
  INCOMPLETE: 'Pointage incomplet',
  NON_WORKING_DAY_WORK: 'Travail hors jour planifié',
};

function formatTime(value: string | null, timeZone?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

export default async function OrganizationAttendancePage() {
  const user = await requireCurrentUser();
  if (user.membership?.role !== 'ADMIN') redirect('/my-attendance');
  const token = await getSessionToken();
  if (!token) redirect('/login');

  let dashboard;
  let activeSiteCount: number | null = null;
  try {
    dashboard = await getDashboardData(token);
  } catch {
    return (
      <PageShell adminNavigation as="div">
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <AdminNav current="attendance-history" membershipRole="ADMIN" />
          <LogoutForm />
        </div>
        <main className="space-y-4">
          <AdminPageHeader context={user.organization?.name ?? 'Organisation'} title="Présences aujourd’hui" description="Vue consolidée des opérations sur l’ensemble des sites actifs." />
          <section role="alert" className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">Données de présence indisponibles</h2>
            <p className="mt-1 text-sm text-slate-600">Actualisez la page ou réessayez dans quelques instants. Les opérations restent accessibles dans chaque site.</p>
          </section>
        </main>
      </PageShell>
    );
  }
  try {
    activeSiteCount = (await getAttendanceSites(token)).filter((site) => site.isActive).length;
  } catch {
    // Site count is supplementary; keep the organization-wide attendance view usable.
  }

  const metrics = [
    { label: 'Présents aujourd’hui', value: dashboard.summary.presentToday },
    { label: 'En retard', value: dashboard.summary.lateEmployeesToday },
    { label: 'Absents selon planning', value: dashboard.summary.absentEmployeesToday },
    { label: 'Employés actifs', value: dashboard.summary.totalEmployees },
  ];

  return (
    <PageShell adminNavigation as="div" contentClassName="gap-4 lg:gap-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <AdminNav current="attendance-history" membershipRole="ADMIN" />
        <LogoutForm />
      </div>
      <main className="space-y-5">
        <AdminPageHeader
          context={user.organization?.name ?? 'Organisation'}
          title="Présences aujourd’hui"
          description={`Indicateurs consolidés sur tous les sites actifs${activeSiteCount === null ? '' : ` · ${activeSiteCount} site${activeSiteCount === 1 ? '' : 's'}`}. Les opérations détaillées restent disponibles dans chaque espace de site.`}
          actions={<Link className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-10')} href="/organization/history">Ouvrir l’historique</Link>}
        />

        <section aria-label="Indicateurs de présence du jour" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card className="rounded-xl border-slate-200 bg-white shadow-none" key={metric.label}>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-600">{metric.label}</p>
                <p className="admin-kpi-value mt-2 text-3xl font-semibold leading-none tabular-nums text-slate-950">{metric.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section aria-labelledby="organization-attendance-activity" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950" id="organization-attendance-activity">Activité récente</h2>
              <p className="text-sm text-slate-600">Enregistrements de présence de toute l’organisation</p>
            </div>
            <Link className="text-sm font-semibold text-primary underline underline-offset-2" href="/organization/reports">Consulter les rapports</Link>
          </div>
          {dashboard.recentActivity.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-600">Aucun pointage enregistré aujourd’hui.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr><th className="px-4 py-3">Employé</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Arrivée</th><th className="px-4 py-3">Départ</th><th className="px-4 py-3">Retard</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.recentActivity.map((activity) => (
                    <tr key={`${activity.employeeIdentifier}-${activity.date}`}>
                      <td className="px-4 py-3"><span className="font-medium text-slate-950">{activity.employeeName}</span>{activity.department ? <span className="block text-xs text-slate-500">{activity.department}</span> : null}</td>
                      <td className="px-4 py-3"><Badge variant={activity.status === 'PRESENT' ? 'success' : activity.status === 'LATE' ? 'warning' : activity.status === 'ABSENT' ? 'danger' : 'neutral'}>{statusLabels[activity.status] ?? activity.status}</Badge></td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatTime(activity.clockInAt, user.organization?.timezone)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatTime(activity.clockOutAt, user.organization?.timezone)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{activity.minutesLate > 0 ? `${activity.minutesLate} min` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </PageShell>
  );
}
