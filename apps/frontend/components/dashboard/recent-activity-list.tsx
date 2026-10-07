import Link from 'next/link';
import {
  formatAttendanceHistoryDate,
  formatAttendanceTime,
} from '@/components/attendance/attendance-display';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardOverview } from '@/lib/api';
import { cn } from '@/lib/utils';

type RecentActivityListProps = {
  activity: DashboardOverview['recentActivity'];
  timeZone?: string;
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
  date: string;
  time: string | null;
  details: string;
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
    className: 'border-success/20 bg-success/10 text-success',
  },
  exit: {
    label: 'Sortie',
    icon: 'S',
    className: 'border-warning/20 bg-warning/10 text-warning',
  },
  absence: {
    label: 'Absence',
    icon: '!',
    className: 'border-danger/20 bg-danger/10 text-danger',
  },
};

const statusClassNames: Record<LiveActivityStatus, string> = {
  normal: 'border-transparent bg-success/15 text-success',
  late: 'border-transparent bg-warning/10 text-warning',
  'early-exit': 'border-transparent bg-info/10 text-info',
  overtime: 'border-transparent bg-info/10 text-info',
  'non-working-day-work': 'border-transparent bg-info/10 text-info',
  absence: 'border-transparent bg-danger/10 text-danger',
  incomplete: 'border-transparent bg-warning/10 text-warning',
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

function getOvertimeMinutes(item: DashboardOverview['recentActivity'][number]) {
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

function getActivityDetails(item: DashboardOverview['recentActivity'][number]) {
  const details = [
    item.minutesLate > 0 ? `Retard : ${item.minutesLate} min` : null,
    getOvertimeMinutes(item) > 0
      ? `Heures supp : ${formatDuration(getOvertimeMinutes(item))}`
      : null,
    item.earlyExit || item.earlyExitMinutes > 0
      ? `Départ anticipé : ${item.earlyExitMinutes} min`
      : null,
    item.status === 'INCOMPLETE' || (item.clockInAt && !item.clockOutAt)
      ? 'Sortie manquante'
      : null,
  ].filter((detail): detail is string => detail !== null);

  return details.join(' · ');
}

function buildLiveActivity(activity: DashboardOverview['recentActivity']) {
  return activity
    .map<LiveActivityItem>((item) => ({
      id: `${item.employeeIdentifier}-${item.date}`,
      type: getActivityType(item),
      employeeName: item.employeeName,
      department: item.department,
      date: item.date,
      time: getActivityTime(item),
      details: getActivityDetails(item),
      status: getActivityStatus(item),
    }))
    .sort((first, second) => {
      const firstTime = first.time ? new Date(first.time).getTime() : 0;
      const secondTime = second.time ? new Date(second.time).getTime() : 0;

      return secondTime - firstTime;
    })
    .slice(0, 5);
}

export function RecentActivityList({
  activity,
  timeZone,
}: RecentActivityListProps) {
  const liveActivity = buildLiveActivity(activity);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-3">
        <CardTitle className="text-base text-slate-950">Activité récente</CardTitle>
        <Link className="text-sm font-semibold text-primary underline underline-offset-2" href="/organization/history">Historique — tous les sites</Link>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {liveActivity.length === 0 ? (
          <p className="border-t border-slate-100 py-3 text-sm text-slate-600">Aucune activité récente pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {liveActivity.map((item) => {
              const type = typeMeta[item.type];
              return (
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" key={item.id}>
                  <span aria-label={type.label} className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-xs font-bold', type.className)}>{type.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{item.employeeName}<span className="font-normal text-slate-500"> · {formatAttendanceHistoryDate(item.date)} {formatAttendanceTime(item.time, timeZone)}</span></span>
                  <Badge className={statusClassNames[item.status.tone]} variant="outline">{item.status.label}</Badge>
                  {item.details ? <span className="w-full pl-10 text-xs text-slate-500">{item.details}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
