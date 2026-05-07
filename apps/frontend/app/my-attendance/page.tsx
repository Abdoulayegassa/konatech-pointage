import { redirect } from 'next/navigation';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { AttendanceLiveClock } from '@/components/attendance/attendance-live-clock';
import { EmployeeAttendanceActions } from '@/components/attendance/employee-attendance-actions';
import { LogoutForm } from '@/components/auth/logout-form';
import { PageHero, PageShell } from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/attendance/attendance-display';
import { getEmployeeAttendanceData } from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function currentMonth() {
  const now = new Date();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');

  return `${now.getUTCFullYear()}-${month}`;
}

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export default async function MyAttendancePage() {
  const user = await requireCurrentUser();

  if (user.accessRole === 'ADMIN') {
    redirect('/');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const selectedMonth = currentMonth();
  const { today, history } = await getEmployeeAttendanceData(
    token,
    selectedMonth,
  );
  const statusMeta = getAttendanceStatusMeta(today.attendance?.status ?? null);
  const todayExitMessage = getAttendanceExitMessage(today.attendance);
  const monthAbsenceCount = getMonthlyAbsenceCount(
    today.employee.schedule,
    history,
    selectedMonth,
    new Date(today.date),
  );
  const monthOvertimeHours = history.reduce(
    (total, item) => total + item.overtimeHours,
    0,
  );
  const monthWorkedHours = getMonthlyWorkedHours(history);
  const monthEarlyExitCount = history.filter((item) => item.earlyExit).length;
  const monthLateEntries = history.filter(
    (item) => item.minutesLate > 0,
  ).length;
  const scheduleSummary = today.employee.schedule
    ? `${today.employee.schedule.name} - ${today.employee.schedule.startTime} a ${today.employee.schedule.endTime}`
    : 'Aucun planning assigne';
  const securityEnabled = today.securityPolicy?.enabled ?? false;
  const todayCheckInVerification = today.attendance
    ? getAttendanceVerificationMeta(today.attendance, 'check-in')
    : null;
  const todayCheckOutVerification =
    today.attendance?.clockOutAt && today.attendance
      ? getAttendanceVerificationMeta(today.attendance, 'check-out')
      : null;
  const summaryCards = [
    {
      label: 'Heures travaillees',
      value: `${formatHoursValue(monthWorkedHours)}h`,
      detail: 'Cumul du mois.',
      tone: 'border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.08),rgba(255,255,255,0.98))]',
      labelTone: 'text-primary',
    },
    {
      label: 'Heures supplementaires',
      value: `${formatHoursValue(monthOvertimeHours)}h`,
      detail: 'Au-dela de l horaire.',
      tone: 'border-success/15 bg-[linear-gradient(180deg,rgba(25,135,84,0.08),rgba(255,255,255,0.98))]',
      labelTone: 'text-success',
    },
    {
      label: 'Absences',
      value: `${monthAbsenceCount}`,
      detail: 'Jours sans pointage.',
      tone: 'border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]',
      labelTone: 'text-slate-500',
    },
    {
      label: 'Departs anticipes',
      value: `${monthEarlyExitCount}`,
      detail: 'Sorties avant horaire.',
      tone: 'border-accent/15 bg-[linear-gradient(180deg,rgba(244,110,40,0.08),rgba(255,255,255,0.98))]',
      labelTone: 'text-accent',
    },
    {
      label: 'Retards entree',
      value: `${monthLateEntries}`,
      detail: 'Entrees en retard.',
      tone: 'border-accent/15 bg-[linear-gradient(180deg,rgba(255,248,244,0.95),rgba(255,255,255,0.98))]',
      labelTone: 'text-accent',
    },
  ];

  return (
    <PageShell maxWidthClassName="max-w-6xl">
      <PageHero
        actions={<LogoutForm />}
        aside={
          <Card className="border-slate-200/80 bg-slate-950 text-white shadow-[0_28px_56px_rgba(15,23,42,0.22)]">
            <CardHeader className="space-y-4 border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge
                  className="border-white/10 bg-white/10 text-white"
                  variant="outline"
                >
                  Session employee
                </Badge>
                <span className="rounded-full border border-accent/20 bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">
                  Live sync
                </span>
              </div>
              <div className="space-y-2">
                <CardTitle className="text-xl text-white">Session</CardTitle>
                <p className="text-sm leading-5 text-slate-300">
                  Horloge et regle active.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              <AttendanceLiveClock />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Employe
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-white">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{user.email}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Securite
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-white">
                    {securityEnabled ? 'Securite GPS' : 'Pointage direct'}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {securityEnabled ? 'GPS requis' : 'Sans blocage GPS'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-200">
                  Focus
                </p>
                <p className="mt-1.5 text-sm leading-5 text-slate-100">
                  {todayExitMessage ?? 'Utilisez l action disponible.'}
                </p>
              </div>
            </CardContent>
          </Card>
        }
        badge="Konatech personal cockpit"
        dateLabel={formatLongDate(today.date)}
        description="Pointage du jour et indicateurs personnels dans une vue plus compacte."
        eyebrow="Employee attendance"
        stats={[
          {
            label: 'Statut',
            value: statusMeta.label,
            meta: statusMeta.description,
          },
          {
            label: 'Planning',
            value: today.employee.schedule?.name ?? 'Sans planning',
            meta: scheduleSummary,
          },
          {
            label: 'Action',
            value: today.canCheckIn
              ? 'Entree'
              : today.canCheckOut
                ? 'Sortie'
                : 'Aucune',
            meta: securityEnabled ? 'GPS actif' : 'Direct',
            tone: today.canCheckIn || today.canCheckOut ? 'success' : 'default',
          },
        ]}
        title={`Bonjour ${user.firstName}, votre pointage est pret.`}
      />

      <section className="admin-reveal admin-reveal-delay-1 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
            <div className="h-1.5 bg-[linear-gradient(90deg,rgba(16,50,60,0.92),rgba(244,110,40,0.72),rgba(244,110,40,0.95))]" />
            <CardHeader className="space-y-5 border-b border-slate-200/80 pb-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={today.expectedToday ? 'success' : 'outline'}>
                  {today.expectedToday ? 'Jour travaille' : 'Hors planning'}
                </Badge>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                {todayCheckInVerification ? (
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                      todayCheckInVerification.badgeClass,
                    )}
                  >
                    {todayCheckInVerification.label}
                  </span>
                ) : null}
                {todayCheckOutVerification ? (
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                      todayCheckOutVerification.badgeClass,
                    )}
                  >
                    {todayCheckOutVerification.label}
                  </span>
                ) : null}
              </div>

              <div className="space-y-2">
                    <CardTitle className="text-2xl text-slate-950">
                      Check-in / Check-out
                    </CardTitle>
                    <p className="text-sm leading-5 text-slate-600">
                      Le bouton disponible suit votre etat.
                    </p>
                  </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Entree
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">
                    {formatAttendanceTime(today.attendance?.clockInAt ?? null)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Sortie
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">
                    {formatAttendanceTime(today.attendance?.clockOutAt ?? null)}
                  </p>
                </div>
                <div className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Retard du jour
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-slate-950">
                    {today.attendance?.minutesLate
                      ? `${today.attendance.minutesLate} min`
                      : '0 min'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="rounded-[24px] border border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.06),rgba(255,255,255,0.98))] p-4 text-sm leading-5 text-slate-700">
                {statusMeta.description}
                {today.attendance?.minutesLate
                  ? ` Retard calcule: ${today.attendance.minutesLate} min.`
                  : ''}
                {todayExitMessage ? ` ${todayExitMessage}` : ''}
              </div>

              {todayCheckInVerification || todayCheckOutVerification ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {todayCheckInVerification ? (
                    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Validation entree
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {todayCheckInVerification.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {todayCheckInVerification.description}
                      </p>
                    </div>
                  ) : null}
                  {todayCheckOutVerification ? (
                    <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Validation sortie
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {todayCheckOutVerification.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {todayCheckOutVerification.description}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <EmployeeAttendanceActions
                canCheckIn={today.canCheckIn}
                canCheckOut={today.canCheckOut}
                securityPolicy={today.securityPolicy}
              />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,45,58,0.08)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Guidance rapide
                </p>
                <p className="mt-3 text-base font-semibold text-slate-950">
                  {today.canCheckIn
                    ? 'Vous pouvez enregistrer votre entree.'
                    : today.canCheckOut
                      ? 'Vous pouvez enregistrer votre sortie.'
                      : 'Aucune action immediate requise.'}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  {securityEnabled ? 'Pointage autorise uniquement dans la zone.' : 'Pointage direct.'}
                </p>
              </div>

              <div className="rounded-[24px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,45,58,0.08)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Planning
                </p>
                <p className="mt-3 text-base font-semibold text-slate-950">
                  {today.employee.schedule?.name ?? 'Sans planning'}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  {scheduleSummary}
                </p>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className={cn(
                    'rounded-[24px] border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft',
                    card.tone,
                  )}
                >
                  <p
                    className={cn(
                      'text-[11px] font-semibold uppercase tracking-[0.18em]',
                      card.labelTone,
                    )}
                  >
                    {card.label}
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950">
                    {card.value}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-600">
                    {card.detail}
                  </p>
                </div>
              ))}
            </section>
          </div>
        </section>

      <section className="admin-reveal admin-reveal-delay-2">
          <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
            <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <Badge variant="outline">Historique personnel</Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl text-slate-950">
                      Mois en cours
                    </CardTitle>
                    <p className="max-w-2xl text-sm leading-5 text-slate-600">
                      Historique mensuel de vos pointages et ecarts.
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50/90 px-4 py-2 shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  <span className="text-sm font-medium text-slate-600">
                    {history.length} pointage(s) ce mois-ci
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {history.length === 0 ? (
                <AdminEmptyState
                  badge="Historique"
                  description="Votre historique mensuel apparaitra ici des que des entrees ou sorties seront enregistrees."
                  detail="Utilisez le bouton disponible pour demarrer votre premier pointage."
                  title="Aucun pointage enregistre pour le mois en cours"
                />
              ) : (
                <div className="space-y-4">
                  {history.map((item) => {
                    const itemStatus = getAttendanceStatusMeta(item.status);
                    const earlyExitMinutes = getEarlyExitMinutes(item);
                    const checkInVerification = getAttendanceVerificationMeta(
                      item,
                      'check-in',
                    );
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
                      <article
                        key={item.id}
                        className={cn(
                          'rounded-[24px] border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft',
                          verificationItemClass ||
                            'border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))]',
                        )}
                      >
                        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.2fr_0.8fr]">
                          <div className="space-y-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-lg font-semibold text-slate-950">
                                    {formatAttendanceHistoryDate(item.date)}
                                  </p>
                                  <Badge variant={itemStatus.variant}>
                                    {itemStatus.label}
                                  </Badge>
                                  {item.minutesLate > 0 ? (
                                    <Badge variant="warning">
                                      Retard {item.minutesLate} min
                                    </Badge>
                                  ) : null}
                                  {earlyExitMinutes > 0 ? (
                                    <Badge variant="warning">
                                      Depart anticipe {earlyExitMinutes} min
                                    </Badge>
                                  ) : null}
                                  {item.overtimeHours > 0 ? (
                                    <Badge variant="success">
                                      Heures supplementaires{' '}
                                      {formatHoursValue(item.overtimeHours)}h
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-sm leading-5 text-slate-600">
                                  {itemStatus.description}
                                  {exitMessage ? ` ${exitMessage}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Securite GPS
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
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
                              <div className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
                                <p>{checkInVerification.description}</p>
                                {checkOutVerification ? (
                                  <p>{checkOutVerification.description}</p>
                                ) : null}
                                {item.notes ? <p>{item.notes}</p> : null}
                              </div>
                              {item.checkInVerificationPhoto ||
                              item.checkOutVerificationPhoto ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.checkInVerificationPhoto ? (
                                    <a
                                      className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
                                      href={item.checkInVerificationPhoto}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Ancienne verification photo (entree)
                                    </a>
                                  ) : null}
                                  {item.checkOutVerificationPhoto ? (
                                    <a
                                      className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
                                      href={item.checkOutVerificationPhoto}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Ancienne verification photo (sortie)
                                    </a>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Entree
                              </p>
                              <p className="mt-3 text-2xl font-semibold text-slate-950">
                                {formatAttendanceTime(item.clockInAt)}
                              </p>
                            </div>
                            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Sortie
                              </p>
                              <p className="mt-3 text-2xl font-semibold text-slate-950">
                                {formatAttendanceTime(item.clockOutAt)}
                              </p>
                            </div>
                            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Heures supplementaires
                              </p>
                              <p className="mt-3 text-xl font-semibold text-slate-950">
                                {item.overtimeHours > 0
                                  ? `${formatHoursValue(item.overtimeHours)}h`
                                  : '0h'}
                              </p>
                            </div>
                            <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Depart anticipe
                              </p>
                              <p className="mt-3 text-xl font-semibold text-slate-950">
                                {earlyExitMinutes > 0
                                  ? `${earlyExitMinutes} min`
                                  : '0 min'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
    </PageShell>
  );
}
