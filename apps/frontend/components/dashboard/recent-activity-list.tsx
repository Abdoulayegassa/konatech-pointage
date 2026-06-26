import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { formatAttendanceTime } from '@/components/attendance/attendance-display';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardOverview } from '@/lib/api';
import { cn } from '@/lib/utils';

type RecentActivityListProps = {
  activity: DashboardOverview['recentActivity'];
};

type LiveActivityType = 'entry' | 'exit' | 'absence';
type LiveActivityStatus =
  | 'normal'
  | 'late'
  | 'early-exit'
  | 'overtime'
  | 'non-working-day-work'
  | 'absence'
  | 'incomplete';

type LiveActivityItem = {
  id: string;
  type: LiveActivityType;
  employeeName: string;
  department: string | null;
  time: string | null;
  status: {
    label: string;
    tone: LiveActivityStatus;
  };
};

const typeMeta: Record<
  LiveActivityType,
  {
    label: string;
    icon: string;
    className: string;
  }
> = {
  entry: {
    label: 'Entrée',
    icon: 'E',
    className: 'border-success/15 bg-success/12 text-success',
  },
  exit: {
    label: 'Sortie',
    icon: 'S',
    className: 'border-accent/15 bg-accent/10 text-accent',
  },
  absence: {
    label: 'Absence',
    icon: '!',
    className: 'border-red-500/15 bg-red-50 text-red-700',
  },
};

const statusClassNames: Record<LiveActivityStatus, string> = {
  normal: 'border-transparent bg-success/15 text-success',
  late: 'border-transparent bg-accent/15 text-accent',
  'early-exit': 'border-transparent bg-purple-50 text-purple-700',
  overtime: 'border-transparent bg-blue-50 text-blue-700',
  'non-working-day-work': 'border-transparent bg-blue-50 text-blue-700',
  absence: 'border-transparent bg-red-50 text-red-700',
  incomplete: 'border-transparent bg-amber-50 text-amber-700',
};

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h${String(remainingMinutes).padStart(2, '0')}`;
}

function getOvertimeMinutes(
  item: DashboardOverview['recentActivity'][number],
) {
  if (item.overtimeMinutes > 0) {
    return item.overtimeMinutes;
  }

  return Math.round(item.overtimeHours * 60);
}

function getActivityStatus(
  item: DashboardOverview['recentActivity'][number],
): LiveActivityItem['status'] {
  if (item.status === 'NON_WORKING_DAY_WORK') {
    const overtimeMinutes = getOvertimeMinutes(item);

    return {
      label:
        overtimeMinutes > 0
          ? `Travail jour non ouvré : ${formatDuration(overtimeMinutes)}`
          : 'Travail jour non ouvré',
      tone: 'non-working-day-work',
    };
  }

  if (item.status === 'ABSENT' || item.absenceCount > 0) {
    return {
      label: 'Absence',
      tone: 'absence',
    };
  }

  if (item.status === 'INCOMPLETE' || (item.clockInAt && !item.clockOutAt)) {
    return {
      label: 'Pointage incomplet',
      tone: 'incomplete',
    };
  }

  if (item.earlyExit || item.earlyExitMinutes > 0) {
    return {
      label: `Départ anticipé : ${item.earlyExitMinutes} min`,
      tone: 'early-exit',
    };
  }

  const overtimeMinutes = getOvertimeMinutes(item);

  if (overtimeMinutes > 0) {
    return {
      label: `Heures supp : ${formatDuration(overtimeMinutes)}`,
      tone: 'overtime',
    };
  }

  if (item.minutesLate > 0) {
    return {
      label: `Retard : ${item.minutesLate} min`,
      tone: 'late',
    };
  }

  return {
    label: "À l'heure",
    tone: 'normal',
  };
}

function getActivityType(
  item: DashboardOverview['recentActivity'][number],
): LiveActivityType {
  if (item.status === 'ABSENT' || item.absenceCount > 0) {
    return 'absence';
  }

  return item.clockOutAt ? 'exit' : 'entry';
}

function getActivityTime(item: DashboardOverview['recentActivity'][number]) {
  if (item.clockOutAt) {
    return item.clockOutAt;
  }

  return item.clockInAt;
}

function buildLiveActivity(activity: DashboardOverview['recentActivity']) {
  return activity
    .map<LiveActivityItem>((item) => ({
      id: item.id,
      type: getActivityType(item),
      employeeName: item.employeeName,
      department: item.department,
      time: getActivityTime(item),
      status: getActivityStatus(item),
    }))
    .sort((first, second) => {
      const firstTime = first.time ? new Date(first.time).getTime() : 0;
      const secondTime = second.time ? new Date(second.time).getTime() : 0;

      return secondTime - firstTime;
    })
    .slice(0, 10);
}

export function RecentActivityList({ activity }: RecentActivityListProps) {
  const liveActivity = buildLiveActivity(activity);

  return (
    <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="outline">Activité en direct</Badge>
            <CardTitle className="mt-2 text-xl text-slate-950">
              Activité en direct
            </CardTitle>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
            {liveActivity.length} événement(s)
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {liveActivity.length === 0 ? (
          <AdminEmptyState
            badge="Activité en direct"
            description="Les derniers pointages apparaitront ici dès qu'ils seront disponibles."
            title="Aucune activité récente"
          />
        ) : (
          <div className="space-y-2.5">
            {liveActivity.map((item) => {
              const type = typeMeta[item.type];

              return (
                <article
                  className="grid gap-3 rounded-[22px] border border-slate-200 bg-slate-50/75 px-4 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,45,58,0.08)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                  key={item.id}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] border text-base font-black shadow-sm',
                        type.className,
                      )}
                      title={type.label}
                    >
                      {type.icon}
                    </div>
                    <div className="sm:hidden">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        {type.label}
                      </p>
                      <p className="text-base font-black text-slate-950">
                        {formatAttendanceTime(item.time)}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-black text-slate-950">
                        {item.employeeName}
                      </p>
                      <Badge
                        className={statusClassNames[item.status.tone]}
                        variant="outline"
                      >
                        {item.status.label}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                      {item.department ?? 'Sans département'}
                    </p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      {type.label}
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {formatAttendanceTime(item.time)}
                    </p>
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
