import { DashboardOverview } from '@/lib/api';
import {
  formatAttendanceTime,
  getAttendanceStatusMeta,
  getAttendanceVerificationMeta,
} from '@/components/attendance/attendance-display';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RecentActivityListProps = {
  activity: DashboardOverview['recentActivity'];
};

export function RecentActivityList({ activity }: RecentActivityListProps) {
  return (
    <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
      <CardHeader className="border-b border-slate-200/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="outline">Activite recente</Badge>
            <CardTitle className="mt-2 text-xl">Derniers mouvements</CardTitle>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-bold text-slate-600">
            {activity.length} mouvement(s)
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {activity.length === 0 ? (
          <AdminEmptyState
            badge="Activite recente"
            description="Les prochains pointages apparaitront ici."
            title="Aucun mouvement a afficher"
          />
        ) : (
          <div className="space-y-2.5">
            {activity.map((item) => {
              const status = getAttendanceStatusMeta(item.status);
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
                  className="grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-bold text-slate-950">
                        {item.employeeName}
                      </p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {gpsValidated ? (
                        <Badge variant="success">GPS valide</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.employeeIdentifier} -{' '}
                      {item.department ?? 'Sans departement'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
                    <div className="rounded-[16px] border border-white bg-white px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        Entree
                      </p>
                      <p className="mt-1 text-base font-black text-slate-950">
                        {formatAttendanceTime(item.clockInAt)}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-white bg-white px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        Sortie
                      </p>
                      <p className="mt-1 text-base font-black text-slate-950">
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
  );
}
