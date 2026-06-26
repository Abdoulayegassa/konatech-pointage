import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
};

const alertMeta: Record<
  DailyAlertType,
  {
    badgeClassName: string;
    markerClassName: string;
    panelClassName: string;
  }
> = {
  absence: {
    badgeClassName: 'border-red-500/15 bg-red-50 text-red-700',
    markerClassName: 'bg-red-600',
    panelClassName: 'border-red-500/15 bg-red-50/60',
  },
  late: {
    badgeClassName: 'border-accent/15 bg-accent/10 text-accent',
    markerClassName: 'bg-accent',
    panelClassName: 'border-accent/15 bg-orange-50/60',
  },
  'early-exit': {
    badgeClassName: 'border-purple-500/15 bg-purple-50 text-purple-700',
    markerClassName: 'bg-purple-600',
    panelClassName: 'border-purple-500/15 bg-purple-50/60',
  },
  'missing-checkout': {
    badgeClassName: 'border-amber-500/20 bg-amber-50 text-amber-700',
    markerClassName: 'bg-amber-600',
    panelClassName: 'border-amber-500/20 bg-amber-50/70',
  },
};

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function buildDailyAlerts(
  activity: DashboardOverview['recentActivity'],
  dashboardDate: string,
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
    const itemAlerts: DailyAlert[] = [];

    if (item.status === 'ABSENT' || item.absenceCount > 0) {
      itemAlerts.push({
        ...baseAlert,
        id: `${item.id}-absence`,
        type: 'absence',
        label: 'Absence',
        detail: 'Absence',
        priority: 1,
      });
    }

    if (item.minutesLate > 0) {
      itemAlerts.push({
        ...baseAlert,
        id: `${item.id}-late`,
        type: 'late',
        label: 'Retard',
        detail: `Retard : ${item.minutesLate} min`,
        priority: 2,
      });
    }

    if (item.earlyExit || item.earlyExitMinutes > 0) {
      itemAlerts.push({
        ...baseAlert,
        id: `${item.id}-early-exit`,
        type: 'early-exit',
        label: 'Départ anticipé',
        detail: `Départ anticipé : ${item.earlyExitMinutes} min`,
        priority: 3,
      });
    }

    if (item.status === 'INCOMPLETE' || (item.clockInAt && !item.clockOutAt)) {
      itemAlerts.push({
        ...baseAlert,
        id: `${item.id}-missing-checkout`,
        type: 'missing-checkout',
        label: 'Sortie manquante',
        detail: 'Sortie manquante',
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
}: DailyAlertsCardProps) {
  const alerts = buildDailyAlerts(activity, dashboardDate);

  return (
    <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="warning">RH</Badge>
            <CardTitle className="mt-2 text-xl text-slate-950">
              Alertes du jour
            </CardTitle>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
            {alerts.length} alerte(s)
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {alerts.length === 0 ? (
          <AdminEmptyState
            badge="Alertes du jour"
            description="Aucun événement RH à surveiller pour le moment."
            title="Aucune alerte RH aujourd'hui"
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-5">
            {alerts.map((alert) => {
              const meta = alertMeta[alert.type];

              return (
                <article
                  className={cn(
                    'min-w-0 rounded-[22px] border p-4 shadow-sm',
                    meta.panelClassName,
                  )}
                  key={alert.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                        meta.markerClassName,
                      )}
                    />
                    <Badge
                      className={cn('shrink-0', meta.badgeClassName)}
                      variant="outline"
                    >
                      {alert.label}
                    </Badge>
                  </div>

                  <p className="mt-4 truncate text-base font-black text-slate-950">
                    {alert.employeeName}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                    {alert.employeeIdentifier} -{' '}
                    {alert.department ?? 'Sans département'}
                  </p>
                  <p className="mt-3 text-sm font-bold text-slate-800">
                    {alert.detail}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
