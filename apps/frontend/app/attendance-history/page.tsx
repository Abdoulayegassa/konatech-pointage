import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { AttendanceHistoryWorkspace } from '@/components/attendance-history/attendance-history-workspace';
import { LogoutForm } from '@/components/auth/logout-form';
import { PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getAttendanceHistoryData, getEmployeesData } from '@/lib/api';
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

function getCurrentMonth() {
  const now = new Date();

  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

export default async function AttendanceHistoryPage() {
  const user = await requireCurrentUser();

  if (user.accessRole !== 'ADMIN') {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const [attendanceRecords, { employees }] = await Promise.all([
    getAttendanceHistoryData(token, getCurrentMonth()),
    getEmployeesData(token),
  ]);
  const departments = Array.from(
    new Set(
      employees
        .map((employee) => employee.department?.trim())
        .filter((department): department is string => Boolean(department)),
    ),
  ).sort((firstDepartment, secondDepartment) =>
    firstDepartment.localeCompare(secondDepartment, 'fr-FR'),
  );

  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <header className="admin-reveal rounded-[30px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_46px_rgba(15,45,58,0.08)] sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="attendance-history" />
            <LogoutForm />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent" variant="warning">
                {formatLongDate(new Date())}
              </Badge>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                Historique RH
              </h1>
              <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Consultez et analysez les pointages de vos employés.
              </p>
            </div>

            <Card className="border-slate-800 bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.20)]">
              <CardHeader className="pb-2">
                <Badge
                  className="w-fit border-white/10 bg-white/10 text-white"
                  variant="outline"
                >
                  Module RH
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div>
                  <p className="text-base font-bold text-white">
                    Historique des pointages
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Suivi des présences, absences, retards et anomalies RH.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      <AttendanceHistoryWorkspace
        departments={departments}
        employees={employees}
        records={attendanceRecords}
      />
    </PageShell>
  );
}
