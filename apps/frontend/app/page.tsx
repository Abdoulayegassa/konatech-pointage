import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { AttendanceEntryQrCard } from '@/components/dashboard/attendance-entry-qr-card';
import { DashboardAnalyticsSection } from '@/components/dashboard/dashboard-analytics-section';
import { MetricCard } from '@/components/dashboard/metric-card';
import { MonthlyAttendanceExportCard } from '@/components/dashboard/monthly-attendance-export-card';
import { RecentActivityList } from '@/components/dashboard/recent-activity-list';
import { PageHero, PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardData, getPublicAppUrl } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatHours(value: number) {
  return `${value.toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })}h`;
}

async function getAttendanceEntryUrl() {
  const configuredAppUrl = getPublicAppUrl();

  if (!configuredAppUrl) {
    return '/attendance-entry';
  }

  return new URL('/attendance-entry', `${configuredAppUrl}/`).toString();
}

export default async function HomePage() {
  const user = await requireCurrentUser();

  if (user.accessRole !== 'ADMIN') {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const dashboard = await getDashboardData(token);
  const attendanceEntryUrl = await getAttendanceEntryUrl();
  const metrics = [
    {
      label: 'Retards',
      value: dashboard.summary.lateEmployeesToday,
      hint: 'Priorite.',
      tone: 'warning' as const,
    },
    {
      label: 'Absences',
      value: dashboard.summary.absentEmployeesToday,
      hint: 'Sans pointage.',
      tone: 'outline' as const,
    },
    {
      label: 'Departs anticipes',
      value: dashboard.summary.earlyExitToday,
      hint: 'Sorties avant horaire.',
      tone: 'warning' as const,
    },
    {
      label: "Presents aujourd'hui",
      value: dashboard.summary.presentToday,
      hint: 'Pointages valides.',
      tone: 'success' as const,
    },
    {
      label: 'Heures supplementaires',
      value: formatHours(dashboard.summary.overtimeHoursToday),
      hint: 'Cumul du jour.',
      tone: 'success' as const,
    },
    {
      label: 'Employes actifs',
      value: dashboard.summary.totalEmployees,
      hint: 'Base suivie.',
      tone: 'default' as const,
    },
  ];
  const heroHighlights = [
    {
      label: 'Retards',
      value: dashboard.summary.lateEmployeesToday,
      meta: 'Priorite 1',
      tone: 'warning' as const,
    },
    {
      label: 'Absences',
      value: dashboard.summary.absentEmployeesToday,
      meta: 'Priorite 1',
      tone: 'danger' as const,
    },
    {
      label: 'GPS valides',
      value: dashboard.analytics.insideZoneAttendanceCount,
      meta: 'Zone autorisee',
      tone: 'success' as const,
    },
  ];

  return (
    <PageShell>
      <PageHero
        actions={
          <>
            <AdminNav current="dashboard" />
            <LogoutForm />
          </>
        }
        aside={
          <Card className="border-slate-200/80 bg-slate-950 text-white shadow-[0_28px_56px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-4 border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge
                  className="border-white/10 bg-white/10 text-white"
                  variant="outline"
                >
                  Session admin
                </Badge>
                <span className="rounded-full border border-accent/20 bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">
                  Live sync
                </span>
              </div>
              <div className="space-y-2">
                <CardTitle className="text-xl text-white">Session</CardTitle>
                <p className="text-sm leading-5 text-slate-300">
                  Synchro et priorites du jour.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Connecte
                </p>
                <p className="mt-1.5 text-lg font-semibold text-white">
                  {user.firstName} {user.lastName}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {user.department ?? 'Administration Konatech'}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Role
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-accent-foreground">
                    {user.accessRole}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Derniere synchro
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    {formatDateTime(dashboard.generatedAt)}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-2xl border border-accent/20 bg-accent/10 px-3.5 py-3 text-sm font-medium text-slate-100">
                  Retards d abord
                </div>
                <div className="rounded-2xl border border-red-200/30 bg-red-500/10 px-3.5 py-3 text-sm font-medium text-slate-100">
                  Absences ensuite
                </div>
                <div className="rounded-2xl border border-success/20 bg-success/10 px-3.5 py-3 text-sm font-medium text-slate-100">
                  GPS a verifier
                </div>
              </div>
            </CardContent>
          </Card>
        }
        badge="Konatech control center"
        dateLabel={formatLongDate(dashboard.date)}
        description="Alertes, presences, GPS et actions rapides dans une vue operationnelle."
        eyebrow="Admin overview"
        stats={heroHighlights}
        title="Le tableau de bord qui montre d abord ce qui exige une action."
      />

      <section className="admin-reveal admin-reveal-delay-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <div className="admin-reveal admin-reveal-delay-2">
        <DashboardAnalyticsSection analytics={dashboard.analytics} />
      </div>

      <section className="admin-reveal admin-reveal-delay-2 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <AttendanceEntryQrCard
          attendanceEntryPath="/attendance-entry"
          initialAttendanceEntryUrl={attendanceEntryUrl}
        />
        <MonthlyAttendanceExportCard />
      </section>

      <section className="admin-reveal admin-reveal-delay-3">
        <RecentActivityList activity={dashboard.recentActivity} />
      </section>
    </PageShell>
  );
}
