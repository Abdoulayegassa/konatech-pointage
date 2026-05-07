import { DashboardOverview } from '@/lib/api';
import {
  formatAttendanceShortDate,
  formatAttendanceTime,
  getAttendanceExitMessage,
  getAttendanceStatusMeta,
  getAttendanceVerificationItemClass,
  getAttendanceVerificationMeta,
} from '@/components/attendance/attendance-display';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type RecentActivityListProps = {
  activity: DashboardOverview['recentActivity'];
};

export function RecentActivityList({ activity }: RecentActivityListProps) {
  return (
    <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="outline">Activite recente</Badge>
            <div className="space-y-1">
              <CardTitle>Derniers mouvements</CardTitle>
              <p className="max-w-xl text-sm leading-5 text-slate-600">
                Lecture terrain du jour.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50/90 px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-sm font-medium text-slate-600">
              {activity.length} mouvement(s)
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {activity.length === 0 ? (
          <AdminEmptyState
            badge="Activite recente"
            description="Les prochains pointages apparaitront ici."
            detail="Aucune activite recente."
            title="Aucun mouvement a afficher"
          />
        ) : (
          <div className="space-y-3">
            {activity.map((item, index) => {
              const status = getAttendanceStatusMeta(item.status);
              const checkInVerification = getAttendanceVerificationMeta(
                item,
                'check-in',
              );
              const checkOutVerification = item.clockOutAt
                ? getAttendanceVerificationMeta(item, 'check-out')
                : null;
              const verificationItemClass = getAttendanceVerificationItemClass([
                checkInVerification,
                checkOutVerification,
              ]);
              const exitMessage = getAttendanceExitMessage(item);

              return (
                <div
                  key={item.id}
                  className={cn(
                    'grid gap-4 rounded-[24px] border px-4 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft lg:grid-cols-[1.28fr_0.72fr] lg:px-5',
                    verificationItemClass,
                    !verificationItemClass &&
                      'border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))]',
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white/90 text-sm font-semibold text-slate-700 shadow-sm">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-slate-950">
                              {item.employeeName}
                            </p>
                            <Badge variant={status.variant}>
                              {status.label}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                            <span>{item.employeeIdentifier}</span>
                            <span>{item.department ?? 'Sans departement'}</span>
                            <span>{formatAttendanceShortDate(item.date)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
                            checkInVerification.badgeClass,
                          )}
                        >
                          {checkInVerification.label}
                        </span>
                        {checkOutVerification ? (
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
                              checkOutVerification.badgeClass,
                            )}
                          >
                            {checkOutVerification.label}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
                      <div className="space-y-3">
                        <div className="rounded-[18px] border border-white/70 bg-white/85 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Verification
                          </p>
                          <div className="mt-2.5 space-y-1.5 text-sm leading-5 text-slate-600">
                            <p>{checkInVerification.description}</p>
                            {checkOutVerification ? (
                              <p>{checkOutVerification.description}</p>
                            ) : null}
                            {exitMessage ? (
                              <p className="font-medium text-slate-900">
                                {exitMessage}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {item.notes ||
                        item.checkInVerificationPhoto ||
                        item.checkOutVerificationPhoto ? (
                          <details className="rounded-[18px] border border-slate-200 bg-slate-50/90 p-4">
                            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-950">
                              Voir les details
                            </summary>
                            <div className="mt-3 space-y-3">
                              {item.notes ? (
                                <p className="text-sm leading-6 text-slate-600">
                                  {item.notes}
                                </p>
                              ) : null}
                              {item.checkInVerificationPhoto ||
                              item.checkOutVerificationPhoto ? (
                                <div className="flex flex-wrap gap-2">
                                  {item.checkInVerificationPhoto ? (
                                    <a
                                      className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
                                      href={item.checkInVerificationPhoto}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      Photo entree
                                    </a>
                                  ) : null}
                                  {item.checkOutVerificationPhoto ? (
                                    <a
                                      className="inline-flex w-fit items-center rounded-full border border-primary/15 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary transition duration-200 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2"
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
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                        <div className="rounded-[18px] border border-slate-200 bg-white/90 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Entree
                          </p>
                          <p className="mt-2 text-xl font-semibold text-slate-950">
                            {formatAttendanceTime(item.clockInAt)}
                          </p>
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-white/90 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Sortie
                          </p>
                          <p className="mt-2 text-xl font-semibold text-slate-950">
                            {formatAttendanceTime(item.clockOutAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
