import Image from 'next/image';
import {
  AttendanceRecord,
  EmployeeTodayAttendance,
  AuthenticatedUser,
} from '@/lib/api';
import { AttendanceLiveClock } from '@/components/attendance/attendance-live-clock';
import { EmployeeAttendanceActions } from '@/components/attendance/employee-attendance-actions';
import { AttendanceEntrySessionButton } from '@/components/attendance/attendance-entry-session-button';
import { Card, CardContent } from '@/components/ui/card';
import {
  formatAttendanceHistoryDate,
  formatAttendanceTime,
  formatHoursValue,
  getAttendanceVerificationMeta,
  getMonthlyAbsenceCount,
  getMonthlyWorkedHours,
} from './attendance-display';

type FixedAttendanceEntryViewProps = {
  history: AttendanceRecord[];
  today: EmployeeTodayAttendance;
  user: AuthenticatedUser;
  sessionMode?: 'account' | 'attendance-entry';
};

export function FixedAttendanceEntryView({
  history,
  today,
  user,
  sessionMode = 'account',
}: FixedAttendanceEntryViewProps) {
  const recentHistory = history.slice(0, 5);
  const currentMonth = today.date.slice(0, 7);
  const monthAbsenceCount = getMonthlyAbsenceCount(
    today.employee.schedule,
    history,
    currentMonth,
    new Date(today.date),
  );
  const monthWorkedHours = getMonthlyWorkedHours(history);
  const monthEarlyExitCount = history.filter(
    (item) => item.earlyExit && item.earlyExitMinutes > 0,
  ).length;
  const monthOvertimeHours = history.reduce(
    (total, item) => total + item.overtimeHours,
    0,
  );
  const securityEnabled = today.securityPolicy?.enabled ?? false;
  const allowedRadiusMeters = today.securityPolicy?.allowedRadiusMeters;
  const gpsCard = securityEnabled
    ? {
        title: 'GPS actif',
        detail: allowedRadiusMeters
          ? `Zone autorisée ${allowedRadiusMeters}m`
          : 'Zone autorisée',
        tone: 'border-success/20 bg-success/10 text-success',
        dot: 'bg-success',
      }
    : {
        title: 'Pointage direct',
        detail: 'GPS non requis',
        tone: 'border-slate-200 bg-slate-50 text-slate-700',
        dot: 'bg-slate-400',
      };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fffdfb] px-4 py-3.5 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,244,0.86),rgba(255,255,255,0.98)_36%,rgba(255,255,255,1))]" />

      <div className="relative mx-auto flex w-full max-w-[460px] flex-col gap-3.5 lg:max-w-[520px]">
        <header className="flex flex-col text-left">
          <div className="flex items-start justify-between gap-4">
            <Image
              alt="Konatech"
              className="h-auto w-24 object-contain sm:w-28"
              height={120}
              priority
              src="/konatech-logo.png"
              width={240}
            />

            <div className="[&_button]:min-h-0 [&_button]:rounded-full [&_button]:border-slate-200/90 [&_button]:bg-white/80 [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-xs [&_button]:font-bold [&_button]:text-slate-600 [&_button]:shadow-sm [&_button:hover]:bg-white">
              <AttendanceEntrySessionButton label="Se déconnecter" size="sm" />
            </div>
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

        <AttendanceLiveClock />

        <section
          className={`rounded-[26px] border px-5 py-4 shadow-[0_16px_38px_rgba(15,45,58,0.07)] ${
            gpsCard.tone
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${gpsCard.dot}`} />
            <div className="min-w-0">
              <p className="text-base font-extrabold">{gpsCard.title}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-600">
                {gpsCard.detail}
              </p>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">
                Action
              </p>
              <h2 className="text-2xl font-black leading-tight text-slate-950">
                Prêt pour le pointage
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Entrée
                </p>
                <p className="mt-1.5 text-2xl font-black text-slate-950">
                  {formatAttendanceTime(today.attendance?.clockInAt ?? null)}
                </p>
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Sortie
                </p>
                <p className="mt-1.5 text-2xl font-black text-slate-950">
                  {formatAttendanceTime(today.attendance?.clockOutAt ?? null)}
                </p>
              </div>
            </div>

            <EmployeeAttendanceActions
              canCheckIn={today.canCheckIn}
              canCheckOut={today.canCheckOut}
              securityPolicy={today.securityPolicy}
              sessionMode={sessionMode}
            />
          </CardContent>
        </Card>

        <section className="grid grid-cols-2 gap-2.5">
          {[
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
          ].map((item) => (
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
                    checkInVerification.label.includes('GPS') ||
                    Boolean(checkOutVerification?.label.includes('GPS'));

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
                            GPS valide
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            Entrée
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-950">
                            {formatAttendanceTime(item.clockInAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            Sortie
                          </p>
                          <p className="mt-1 text-lg font-black text-slate-950">
                            {formatAttendanceTime(item.clockOutAt)}
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
