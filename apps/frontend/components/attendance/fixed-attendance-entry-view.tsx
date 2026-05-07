import Link from 'next/link';
import {
  AttendanceRecord,
  EmployeeTodayAttendance,
  AuthenticatedUser,
} from '@/lib/api';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AttendanceLiveClock } from '@/components/attendance/attendance-live-clock';
import { EmployeeAttendanceActions } from '@/components/attendance/employee-attendance-actions';
import { AttendanceEntrySessionButton } from '@/components/attendance/attendance-entry-session-button';
import { LogoutForm } from '@/components/auth/logout-form';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  formatAttendanceHistoryDate,
  formatAttendanceTime,
  formatHoursValue,
  getAttendanceExitMessage,
  getEarlyExitMinutes,
  getAttendanceStatusMeta,
  getAttendanceVerificationItemClass,
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
  const statusMeta = getAttendanceStatusMeta(today.attendance?.status ?? null);
  const scheduleSummary = today.employee.schedule
    ? `${today.employee.schedule.name} - ${today.employee.schedule.startTime} a ${today.employee.schedule.endTime}`
    : 'Aucun planning assigne';
  const recentHistory = history.slice(0, 5);
  const todayExitMessage = getAttendanceExitMessage(today.attendance);
  const currentMonth = today.date.slice(0, 7);
  const monthAbsenceCount = getMonthlyAbsenceCount(
    today.employee.schedule,
    history,
    currentMonth,
    new Date(today.date),
  );
  const monthOvertimeHours = history.reduce(
    (total, item) => total + item.overtimeHours,
    0,
  );
  const monthWorkedHours = getMonthlyWorkedHours(history);
  const monthEarlyExitCount = history.filter((item) => item.earlyExit).length;
  const securityEnabled = today.securityPolicy?.enabled ?? false;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <header className="admin-reveal relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))] shadow-soft">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
          <div className="relative space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-accent/15 text-accent" variant="warning">
                  Pointage QR
                </Badge>
                <Badge variant="outline">{statusMeta.label}</Badge>
                {sessionMode === 'attendance-entry' ? (
                  <Badge variant="success">Session PIN active</Badge>
                ) : null}
              </div>
              {sessionMode === 'account' ? (
                <LogoutForm />
              ) : (
                <AttendanceEntrySessionButton
                  label="Changer demploye"
                  size="sm"
                />
              )}
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-3 rounded-full border border-accent/15 bg-white/80 px-3 py-2 shadow-sm backdrop-blur">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  QR access
                </span>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold leading-tight text-balance text-slate-950">
                  Pointage direct.
                </h1>
                <p className="text-sm leading-5 text-slate-600">
                  Bonjour {user.firstName}. Utilisez l action disponible.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Employe connecte
                </p>
                <p className="mt-1.5 text-base font-semibold text-slate-950">
                  {user.firstName} {user.lastName}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {user.email}
                </p>
                {sessionMode === 'attendance-entry' ? (
                  <p className="mt-2 text-sm font-medium text-accent">
                    Session PIN active.
                  </p>
                ) : null}
              </div>
              <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Regle
                </p>
                <p className="mt-1.5 text-sm font-semibold text-slate-950">
                  {securityEnabled ? 'GPS actif' : 'Pointage direct'}
                </p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {scheduleSummary}
                </p>
              </div>
            </div>
          </div>
        </header>

        <Card className="admin-reveal admin-reveal-delay-1 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={today.expectedToday ? 'success' : 'outline'}>
                {today.expectedToday ? 'Jour travaille' : 'Hors planning'}
              </Badge>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            </div>
            <CardTitle className="text-2xl text-slate-950">
              Action de pointage
            </CardTitle>
            <p className="text-sm leading-5 text-slate-600">
              Le flux conserve les regles existantes.
            </p>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <AttendanceLiveClock />

            <div className="rounded-[22px] border border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.06),rgba(255,255,255,0.98))] p-4 text-sm leading-5 text-slate-700">
              {statusMeta.description}
              {today.attendance?.minutesLate
                ? ` Retard calcule: ${today.attendance.minutesLate} min.`
                : ''}
              {todayExitMessage ? ` ${todayExitMessage}` : ''}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Entree
                </p>
                <p className="mt-1.5 text-lg font-semibold text-slate-950">
                  {formatAttendanceTime(today.attendance?.clockInAt ?? null)}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Sortie
                </p>
                <p className="mt-1.5 text-lg font-semibold text-slate-950">
                  {formatAttendanceTime(today.attendance?.clockOutAt ?? null)}
                </p>
              </div>
              <div className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Abs.
                </p>
                <p className="mt-1.5 text-lg font-semibold text-slate-950">
                  {monthAbsenceCount}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[20px] border border-primary/15 bg-primary/10 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Heures
                </p>
                <p className="mt-1.5 text-lg font-semibold text-slate-950">
                  {formatHoursValue(monthWorkedHours)}h
                </p>
              </div>
              <div className="rounded-[20px] border border-accent/15 bg-accent/10 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  Departs ant.
                </p>
                <p className="mt-1.5 text-lg font-semibold text-slate-950">
                  {monthEarlyExitCount}
                </p>
              </div>
              <div className="rounded-[20px] border border-success/15 bg-success/10 p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-success">
                  H. supp.
                </p>
                <p className="mt-1.5 text-lg font-semibold text-slate-950">
                  {formatHoursValue(monthOvertimeHours)}h
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

        <Card className="admin-reveal admin-reveal-delay-2 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-3 border-b border-slate-200/80 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="outline">Historique recent</Badge>
                <CardTitle className="text-2xl text-slate-950">
                  Ce mois-ci
                </CardTitle>
              </div>
              {sessionMode === 'account' ? (
                <Link
                  className="inline-flex items-center justify-center rounded-2xl border border-transparent bg-transparent px-5 py-3 text-sm font-semibold text-slate-600 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/80 hover:text-slate-950 hover:shadow-[0_10px_24px_rgba(15,45,58,0.08)]"
                  href="/my-attendance"
                >
                  Vue complete
                </Link>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {recentHistory.length === 0 ? (
              <AdminEmptyState
                badge="Historique"
                description="Vos derniers pointages QR apparaitront ici."
                title="Aucun pointage enregistre pour le mois en cours"
              />
            ) : (
              <div className="space-y-3">
                {recentHistory.map((item) => {
                  const itemStatus = getAttendanceStatusMeta(item.status);
                  const checkInVerification = getAttendanceVerificationMeta(
                    item,
                    'check-in',
                  );
                  const earlyExitMinutes = getEarlyExitMinutes(item);
                  const checkOutVerification = item.clockOutAt
                    ? getAttendanceVerificationMeta(item, 'check-out')
                    : null;
                  const verificationItemClass =
                    getAttendanceVerificationItemClass([
                      checkInVerification,
                      checkOutVerification,
                    ]);
                  const exitMessage = getAttendanceExitMessage(item);

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded-[22px] border p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-soft',
                        verificationItemClass ||
                          'border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))]',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-950">
                          {formatAttendanceHistoryDate(item.date)}
                        </p>
                        <Badge variant={itemStatus.variant}>
                          {itemStatus.label}
                        </Badge>
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                            checkInVerification.badgeClass,
                          )}
                        >
                          {checkInVerification.label}
                        </span>
                        {checkOutVerification ? (
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                              checkOutVerification.badgeClass,
                            )}
                          >
                            {checkOutVerification.label}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2.5 text-sm leading-5 text-slate-600">
                        {itemStatus.description}
                        {item.minutesLate > 0
                          ? ` Retard: ${item.minutesLate} min.`
                          : ''}
                        {exitMessage ? ` ${exitMessage}` : ''}
                      </p>
                      {earlyExitMinutes > 0 ? (
                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          Depart anticipe: {earlyExitMinutes} min.
                        </p>
                      ) : null}
                      <details className="mt-3 rounded-[18px] border border-slate-200 bg-white/85 px-3 py-3">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-950">
                          Voir verification
                        </summary>
                        <div className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
                          <p>{checkInVerification.description}</p>
                          {checkOutVerification ? (
                            <p>{checkOutVerification.description}</p>
                          ) : null}
                          {item.checkInVerificationPhoto ||
                          item.checkOutVerificationPhoto ? (
                            <div className="flex flex-wrap gap-2">
                              {item.checkInVerificationPhoto ? (
                                <a
                                  className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
                                  href={item.checkInVerificationPhoto}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Photo entree
                                </a>
                              ) : null}
                              {item.checkOutVerificationPhoto ? (
                                <a
                                  className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
                                  href={item.checkOutVerificationPhoto}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Photo sortie
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </details>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="rounded-[18px] border border-slate-200/80 bg-white/90 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Entree
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-950">
                            {formatAttendanceTime(item.clockInAt)}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-slate-200/80 bg-white/90 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Sortie
                          </p>
                          <p className="mt-2 text-base font-semibold text-slate-950">
                            {formatAttendanceTime(item.clockOutAt)}
                          </p>
                        </div>
                      </div>
                    </div>
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
