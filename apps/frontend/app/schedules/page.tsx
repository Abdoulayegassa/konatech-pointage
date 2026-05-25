import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { PageShell } from '@/components/layout/page-shell';
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
  const assignedEmployees = schedules.reduce(
    (total, schedule) => total + schedule.employees.length,
    0,
  );

  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <header className="admin-reveal rounded-[30px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_46px_rgba(15,45,58,0.08)] sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="schedules" />
            <LogoutForm />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent" variant="warning">
                {formatLongDate(new Date())}
              </Badge>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                Bonjour {user.firstName} 👋
              </h1>
              <div className="space-y-1">
                <CardTitle className="text-xl text-slate-950 sm:text-2xl">
                  Gestion des plannings
                </CardTitle>
                <p className="max-w-xl text-sm leading-5 text-slate-600">
                  Horaires, jours actifs et affectations.
                </p>
              </div>
            </div>

            <Card className="border-slate-800 bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.20)]">
              <CardHeader className="pb-2">
                <Badge
                  className="w-fit border-white/10 bg-white/10 text-white"
                  variant="outline"
                >
                  Session active
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div>
                  <p className="text-base font-bold text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    {user.department ?? user.accessRole}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      Plannings
                    </p>
                    <p className="mt-1 text-lg font-black text-white">
                      {schedules.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-200">
                      Affectations
                    </p>
                    <p className="mt-1 text-lg font-black text-white">
                      {assignedEmployees}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      <AdminSchedulesManager initialSchedules={schedules} />
    </PageShell>
  );
}
