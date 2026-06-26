import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { DailyAlertsCard } from '@/components/dashboard/daily-alerts-card';
import { DashboardAnalyticsSection } from '@/components/dashboard/dashboard-analytics-section';
import { MetricCard } from '@/components/dashboard/metric-card';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { RecentActivityList } from '@/components/dashboard/recent-activity-list';
import { PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  const primaryMetrics = [
    {
      label: 'Présents planifiés',
      value: dashboard.summary.scheduledPresentToday,
      hint: 'Présences sur jours ouvrés.',
      periodLabel: 'Situation RH',
      tone: 'success' as const,
    },
    {
      label: 'Travail jour non ouvré',
      value: dashboard.summary.nonWorkingDayWorkToday,
      hint: 'Présences exceptionnelles.',
      periodLabel: 'Situation RH',
      tone: 'outline' as const,
    },
    {
      label: "Retards aujourd'hui",
      value: dashboard.summary.lateEmployeesToday,
      hint: 'Priorité.',
      periodLabel: 'Situation RH',
      tone: 'warning' as const,
    },
    {
      label: "Absences aujourd'hui",
      value: dashboard.summary.absentEmployeesToday,
      hint: 'Sans pointage.',
      periodLabel: 'Situation RH',
      tone: 'danger' as const,
    },
    {
      label: "Départs anticipés aujourd'hui",
      value: dashboard.summary.earlyExitToday,
      hint: 'Sorties avant horaire.',
      periodLabel: 'Situation RH',
      tone: 'purple' as const,
    },
  ];

  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <header className="admin-reveal rounded-[30px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_46px_rgba(15,45,58,0.08)] sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="dashboard" />
            <LogoutForm />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent" variant="warning">
                {formatLongDate(dashboard.date)}
              </Badge>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                Bonjour {user.firstName} 👋
              </h1>
              <p className="text-base font-semibold text-slate-600">
                Vue operationnelle du jour
              </p>
            </div>

            <Card className="border-slate-800 bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.20)]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Session active
                    </p>
                    <p className="mt-2 text-base font-bold text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-accent">
                      {user.accessRole}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
                    Sync {formatDateTime(dashboard.generatedAt)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  {user.department ?? 'Administration Konatech'}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      <section className="admin-reveal admin-reveal-delay-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {primaryMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="admin-reveal admin-reveal-delay-2">
        <DailyAlertsCard
          activity={dashboard.recentActivity}
          dashboardDate={dashboard.date}
        />
      </section>

      <section className="admin-reveal admin-reveal-delay-3">
        <QuickActionsSection
          attendanceEntryPath="/attendance-entry"
          initialAttendanceEntryUrl={attendanceEntryUrl}
        />
      </section>

      <section className="admin-reveal admin-reveal-delay-3">
        <RecentActivityList activity={dashboard.recentActivity} />
      </section>

      <div className="admin-reveal admin-reveal-delay-3">
        <DashboardAnalyticsSection analytics={dashboard.analytics} />
      </div>
    </PageShell>
  );
}
