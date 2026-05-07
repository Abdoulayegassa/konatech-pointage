import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { PageHero, PageShell } from '@/components/layout/page-shell';
import { AdminSchedulesManager } from '@/components/schedules/admin-schedules-manager';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSchedulesData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function formatLongDate(value: Date) {
  return value.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default async function SchedulesPage() {
  const user = await requireCurrentUser();

  if (user.accessRole !== 'ADMIN') {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const schedules = await getSchedulesData(token);
  const activeSchedules = schedules.filter(
    (schedule) => schedule.isActive,
  ).length;
  const assignedEmployees = schedules.reduce(
    (total, schedule) => total + schedule.employees.length,
    0,
  );
  const inactiveSchedules = schedules.length - activeSchedules;
  const utilizedSchedules = schedules.filter(
    (schedule) => schedule.employees.length > 0,
  ).length;
  const heroHighlights = [
    {
      label: 'Plannings',
      value: schedules.length,
      meta: 'Catalogue total',
    },
    {
      label: 'Actifs',
      value: activeSchedules,
      meta: `${inactiveSchedules} inactif(s)`,
      tone: 'success' as const,
    },
    {
      label: 'Non utilises',
      value: schedules.length - utilizedSchedules,
      meta: 'A rationaliser',
      tone: 'warning' as const,
    },
  ];

  return (
    <PageShell>
      <PageHero
        actions={
          <>
            <AdminNav current="schedules" />
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
                  Schedule sync
                </span>
              </div>
              <div className="space-y-2">
                <CardTitle className="text-xl text-white">Session</CardTitle>
                <p className="text-sm leading-5 text-slate-300">
                  Catalogue et priorites.
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
                    Affectations
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    {assignedEmployees}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Utilises
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    {utilizedSchedules}
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-accent/20 bg-accent/10 px-3.5 py-3 text-sm font-medium text-slate-100">
                  Plannings peu utilises
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm font-medium text-slate-100">
                  Catalogue a rationaliser
                </div>
              </div>
            </CardContent>
          </Card>
        }
        badge="Konatech scheduling hub"
        dateLabel={formatLongDate(new Date())}
        description="Creation, tri et maintenance des horaires dans une vue plus compacte."
        eyebrow="Schedule registry"
        stats={heroHighlights}
        title="Planifier vite, comparer vite, agir vite."
      />

      <AdminSchedulesManager initialSchedules={schedules} />
    </PageShell>
  );
}
