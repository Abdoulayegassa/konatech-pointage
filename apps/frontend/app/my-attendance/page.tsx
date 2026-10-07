import Image from 'next/image';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { AttendanceLiveClock } from '@/components/attendance/attendance-live-clock';
import {
  formatAttendanceHistoryDate,
  formatAttendanceTime,
  formatHoursValue,
  getAttendanceVerificationMeta,
  getMonthlyWorkedHours,
} from '@/components/attendance/attendance-display';
import { EmployeeAttendanceActions } from '@/components/attendance/employee-attendance-actions';
import { LogoutForm } from '@/components/auth/logout-form';
import { Card, CardContent } from '@/components/ui/card';
import { getAttendanceSites, getEmployeeAttendanceData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function MyAttendancePage() {
  const user = await requireCurrentUser();

  const membershipRole = user.membership?.role;
  const canUsePersonalAttendance = membershipRole
    ? membershipRole === 'EMPLOYEE'
    : user.accessRole === 'EMPLOYEE';
  if (!canUsePersonalAttendance) {
    redirect('/');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  if (user.membership?.role === 'EMPLOYEE' && user.employee === null) {
    return (
    <main className="min-h-screen bg-[#fffdfb] px-4 py-6 sm:px-6 md:pl-72">
        <div className="mx-auto flex max-w-xl flex-col gap-5">
          <header className="space-y-4">
            <div className="flex items-center gap-2">
              <AdminNav current="my-attendance" membershipRole="EMPLOYEE" />
              <LogoutForm />
            </div>
            <Image
              alt="Konatech"
              className="h-auto w-28 object-contain"
              height={120}
              priority
              src="/brand/inout-logo.png"
              width={240}
            />
          </header>
          <Card className="rounded-[28px] bg-white/95 shadow-soft">
            <CardContent className="space-y-5 p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">
                  Compte organisation
                </p>
                <h1 className="mt-2 text-2xl font-black text-slate-950">
                  Bienvenue dans{' '}
                  {user.organization?.name ?? 'votre organisation'}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Votre compte membre est actif, mais aucun profil employé de
                  pointage ne lui est encore associé. Un ADMIN peut
                  effectuer cette association.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const [{ today, history }, attendanceSites] = await Promise.all([
    getEmployeeAttendanceData(token),
    getAttendanceSites(token).catch(() => []),
  ]);
  const monthAbsenceCount = today.monthlyAbsenceCount;
  const monthWorkedHours = getMonthlyWorkedHours(history);
  const monthEarlyExitCount = history.filter(
    (item) => item.earlyExit && item.earlyExitMinutes > 0,
  ).length;
  const monthOvertimeHours = history.reduce(
    (total, item) => total + item.overtimeHours,
    0,
  );
  const recentHistory = history.slice(0, 8);
  const securityEnabled = today.securityPolicy?.enabled ?? false;
  const allowedRadiusMeters = today.securityPolicy?.allowedRadiusMeters;
  const gpsTitle = securityEnabled ? 'GPS actif' : 'Pointage direct';
  const gpsDetail = securityEnabled
    ? allowedRadiusMeters
      ? `Zone autorisée ${allowedRadiusMeters}m`
      : 'Zone autorisée'
    : 'GPS non requis';
  const actionLabel = today.canCheckIn
    ? 'Prêt pour le pointage'
    : today.canCheckOut
      ? 'Sortie disponible'
      : 'Pointage à jour';
  const kpis = [
    {
      label: 'ABS.',
      value: `${monthAbsenceCount}`,
      className: 'border-slate-200/80 bg-slate-50/90 text-slate-600',
    },
    {
      label: 'HEURES',
      value: `${formatHoursValue(monthWorkedHours)}h`,
      className: 'border-sky-200/70 bg-sky-50/80 text-sky-700',
    },
    {
      label: 'DÉPARTS ANT.',
      value: `${monthEarlyExitCount}`,
      className: 'border-orange-200/75 bg-orange-50/80 text-orange-700',
    },
    {
      label: 'H. SUPP.',
      value: `${formatHoursValue(monthOvertimeHours)}h`,
      className: 'border-success/20 bg-success/10 text-success',
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fffdfb] px-4 py-3.5 sm:px-6 sm:py-6 md:pl-72">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,244,0.86),rgba(255,255,255,0.98)_36%,rgba(255,255,255,1))]" />

      <div className="relative mx-auto flex w-full max-w-[460px] flex-col gap-3.5 lg:max-w-[520px]">
        <div className="flex items-center gap-2">
          <AdminNav current="my-attendance" membershipRole="EMPLOYEE" />
          <LogoutForm />
        </div>
        <header className="flex flex-col text-left">
          <div className="flex items-start justify-between gap-4">
            <Image
              alt="Konatech"
              className="h-auto w-24 object-contain sm:w-28"
              height={120}
              priority
              src="/brand/inout-logo.png"
              width={240}
            />
          </div>

          <div className="mt-3 leading-none">
            <p className="text-[1.45rem] font-black tracking-normal text-[#10323c]">
              KONATECH
            </p>
            <p className="mt-1 text-[1.45rem] font-black tracking-normal text-accent">
              POINTAGE
            </p>
          </div>

          <h1 className="mt-3.5 text-xl font-extrabold leading-tight text-slate-950">
            Bonjour {user.firstName} 👋
          </h1>
        </header>

        <AttendanceLiveClock
          timeZone={today.organizationTimezone ?? undefined}
        />

        <section
          className={`rounded-[26px] border px-5 py-4 shadow-[0_16px_38px_rgba(15,45,58,0.07)] ${
            securityEnabled
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${
                securityEnabled ? 'bg-success' : 'bg-slate-400'
              }`}
            />
            <div className="min-w-0">
              <p className="text-base font-extrabold">{gpsTitle}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-600">
                {gpsDetail}
              </p>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
                Action
              </p>
              <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">
                {actionLabel}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Entrée
                </p>
                <p className="mt-1.5 text-2xl font-black text-slate-950">
                  {formatAttendanceTime(
                    today.attendance?.clockInAt ?? null,
                    today.organizationTimezone ?? undefined,
                  )}
                </p>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Sortie
                </p>
                <p className="mt-1.5 text-2xl font-black text-slate-950">
                  {formatAttendanceTime(
                    today.attendance?.clockOutAt ?? null,
                    today.organizationTimezone ?? undefined,
                  )}
                </p>
              </div>
            </div>

            <EmployeeAttendanceActions
              attendanceSites={attendanceSites}
              canCheckIn={today.canCheckIn}
              canCheckOut={today.canCheckOut}
              offlineSessionBinding={user.offlineSessionBinding}
              offlineQueueOwner={
                user.employee && user.organization
                  ? { organizationId: user.organization.id, employeeId: user.employee.id }
                  : undefined
              }
              offlineBootstrapSeed={
                user.employee && user.organization && user.offlineSessionBinding
                  ? {
                      employeeId: user.employee.id,
                      organizationId: user.organization.id,
                      employeeName: `${user.firstName} ${user.lastName}`,
                      sessionBinding: user.offlineSessionBinding,
                      canCheckIn: today.canCheckIn,
                      canCheckOut: today.canCheckOut,
                      timeZone: today.organizationTimezone ?? undefined,
                      snapshotAt: new Date().toISOString(),
                    }
                  : undefined
              }
              securityPolicy={today.securityPolicy}
              requiresSiteSelection={Boolean(user.organization)}
              timeZone={today.organizationTimezone ?? undefined}
            />
          </CardContent>
        </Card>

        <section className="grid grid-cols-2 gap-2.5">
          {kpis.map((item) => (
            <div
              key={item.label}
              className={`rounded-[22px] border px-3.5 py-3.5 text-center shadow-[0_12px_30px_rgba(15,45,58,0.06)] ${item.className}`}
            >
              <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em]">
                {item.label}
              </p>
              <p className="mt-1.5 text-2xl font-black text-slate-950">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Récent
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  Historique
                </h2>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                {history.length}
              </span>
            </div>

            {recentHistory.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-center">
                <p className="text-sm font-bold text-slate-950">
                  Aucun pointage enregistré
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Vos derniers pointages apparaîtront ici.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentHistory.map((item) => {
                  const checkInVerification = getAttendanceVerificationMeta(
                    item,
                    'check-in',
                  );
                  const checkOutVerification = item.clockOutAt
                    ? getAttendanceVerificationMeta(item, 'check-out')
                    : null;
                  const gpsValidated =
                    checkInVerification.label.includes('GPS valide') ||
                    Boolean(checkOutVerification?.label.includes('GPS valide'));

                  return (
                    <article
                      key={item.id}
                      className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-bold capitalize text-slate-950">
                          {formatAttendanceHistoryDate(item.date)}
                        </p>
                        {gpsValidated ? (
                          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
                            GPS validé
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            Entrée
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-950">
                            {formatAttendanceTime(
                              item.clockInAt,
                              today.organizationTimezone ?? undefined,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            Sortie
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-950">
                            {formatAttendanceTime(
                              item.clockOutAt,
                              today.organizationTimezone ?? undefined,
                            )}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
