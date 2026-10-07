import { formatAttendanceTime } from '@/components/attendance/attendance-display';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardOverview } from '@/lib/api';

type DailyAlertType = 'absence' | 'late' | 'early-exit' | 'missing-checkout';

type DailyAlert = {
  id: string;
  employeeName: string;
  employeeIdentifier: string;
  department: string | null;
  type: DailyAlertType;
  label: string;
  detail: string;
  priority: number;
};

type DailyAlertsCardProps = {
  activity: DashboardOverview['recentActivity'];
  dashboardDate: string;
  timeZone?: string;
};

const alertMeta: Record<
  DailyAlertType,
  {
    badgeClassName: string;
    markerClassName: string;
  }
> = {
  absence: {
    badgeClassName: 'border-danger/20 bg-danger/10 text-danger',
    markerClassName: 'bg-danger',
  },
  late: {
    badgeClassName: 'border-warning/20 bg-warning/10 text-warning',
    markerClassName: 'bg-warning',
  },
  'early-exit': {
    badgeClassName: 'border-info/20 bg-info/10 text-info',
    markerClassName: 'bg-info',
  },
  'missing-checkout': {
    badgeClassName: 'border-warning/20 bg-warning/10 text-warning',
    markerClassName: 'bg-warning',
  },
};

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function buildDailyAlerts(
  activity: DashboardOverview['recentActivity'],
  dashboardDate: string,
  timeZone?: string,
) {
  const currentDateKey = toDateKey(dashboardDate);
  const alerts = activity.flatMap((item) => {
    if (toDateKey(item.date) !== currentDateKey) {
      return [];
    }

    const baseAlert = {
      employeeName: item.employeeName,
      employeeIdentifier: item.employeeIdentifier,
      department: item.department,
    };
    const activityKey = `${item.employeeIdentifier}-${item.date}`;
    const itemAlerts: DailyAlert[] = [];

    if (item.status === 'ABSENT' || item.absenceCount > 0) {
      itemAlerts.push({
        ...baseAlert,
        id: `${activityKey}-absence`,
        type: 'absence',
        label: 'Absence',
        detail: 'Absence',
        priority: 1,
      });
    }

    if (item.minutesLate > 0) {
      itemAlerts.push({
        ...baseAlert,
        id: `${activityKey}-late`,
        type: 'late',
        label: 'Retard',
        detail: `Retard : ${item.minutesLate} min${item.clockInAt ? ` · Entrée : ${formatAttendanceTime(item.clockInAt, timeZone)}` : ''}`,
        priority: 2,
      });
    }

    if (item.earlyExit || item.earlyExitMinutes > 0) {
      itemAlerts.push({
        ...baseAlert,
        id: `${activityKey}-early-exit`,
        type: 'early-exit',
        label: 'Départ anticipé',
        detail: `Départ anticipé : ${item.earlyExitMinutes} min${item.clockOutAt ? ` · Sortie : ${formatAttendanceTime(item.clockOutAt, timeZone)}` : ''}`,
        priority: 3,
      });
    }

    if (item.status === 'INCOMPLETE' || (item.clockInAt && !item.clockOutAt)) {
      itemAlerts.push({
        ...baseAlert,
        id: `${activityKey}-missing-checkout`,
        type: 'missing-checkout',
        label: 'Sortie manquante',
        detail: `Sortie manquante${item.clockInAt ? ` · Entrée : ${formatAttendanceTime(item.clockInAt, timeZone)}` : ''}`,
        priority: 4,
      });
    }

    return itemAlerts;
  });

  return alerts
    .sort((first, second) => first.priority - second.priority)
    .slice(0, 5);
}

export function DailyAlertsCard({
  activity,
  dashboardDate,
  timeZone,
}: DailyAlertsCardProps) {
  const alerts = buildDailyAlerts(activity, dashboardDate, timeZone);

  return <Card className="rounded-2xl border-slate-200 bg-white">
      <CardContent className="p-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><h2 className="font-black text-slate-950">Alertes du jour</h2><Badge variant={alerts.length ? 'warning' : 'success'}>{alerts.length}</Badge></div>
        </header>
        {alerts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Aucune alerte nécessitant une action aujourd’hui.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {alerts.map((alert) => {
              const meta = alertMeta[alert.type];

              return (
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" key={alert.id}>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.markerClassName)} aria-hidden="true" />
                  <Badge className={cn('shrink-0', meta.badgeClassName)} variant="outline">{alert.label}</Badge>
                  <span className="font-semibold text-slate-900">{alert.employeeName}</span>
                  <span className="text-slate-600">{alert.employeeIdentifier} · {alert.detail}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>;
}
