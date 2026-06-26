import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardOverview } from '@/lib/api';
import { cn } from '@/lib/utils';

type DashboardAnalyticsSectionProps = {
  analytics: DashboardOverview['analytics'];
};

type MonthlyKpiTone = 'warning' | 'danger' | 'info' | 'purple';

type RankingTone = 'warning' | 'info' | 'purple';

type EmployeeRankingRow = {
  id: string;
  name: string;
  department: string | null;
  value: string;
  meta?: string;
};

const monthlyKpiToneClassNames: Record<
  MonthlyKpiTone,
  {
    badge: string;
    border: string;
    marker: string;
    surface: string;
    text: string;
  }
> = {
  warning: {
    badge: 'border-accent/15 bg-accent/10 text-accent',
    border: 'border-accent/15',
    marker: 'bg-accent',
    surface: 'bg-orange-50/60',
    text: 'text-accent',
  },
  danger: {
    badge: 'border-red-500/15 bg-red-50 text-red-700',
    border: 'border-red-500/15',
    marker: 'bg-red-600',
    surface: 'bg-red-50/60',
    text: 'text-red-700',
  },
  info: {
    badge: 'border-blue-500/15 bg-blue-50 text-blue-700',
    border: 'border-blue-500/15',
    marker: 'bg-blue-600',
    surface: 'bg-blue-50/60',
    text: 'text-blue-700',
  },
  purple: {
    badge: 'border-purple-500/15 bg-purple-50 text-purple-700',
    border: 'border-purple-500/15',
    marker: 'bg-purple-600',
    surface: 'bg-purple-50/60',
    text: 'text-purple-700',
  },
};

const rankingToneClassNames: Record<
  RankingTone,
  {
    badge: string;
    rank: string;
    value: string;
  }
> = {
  warning: {
    badge: 'border-accent/15 bg-accent/10 text-accent',
    rank: 'bg-accent/10 text-accent',
    value: 'border-accent/15 bg-accent/10 text-accent',
  },
  info: {
    badge: 'border-blue-500/15 bg-blue-50 text-blue-700',
    rank: 'bg-blue-50 text-blue-700',
    value: 'border-blue-500/15 bg-blue-50 text-blue-700',
  },
  purple: {
    badge: 'border-purple-500/15 bg-purple-50 text-purple-700',
    rank: 'bg-purple-50 text-purple-700',
    value: 'border-purple-500/15 bg-purple-50 text-purple-700',
  },
};

function formatHours(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'N/A';
  }

  return `${value.toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })} h`;
}

function formatMinutes(value: number) {
  return `${value.toLocaleString('fr-FR')} min`;
}

function MonthlyKpiCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: MonthlyKpiTone;
  value: string | number;
}) {
  const toneClassNames = monthlyKpiToneClassNames[tone];

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-[24px] border bg-white/95 shadow-[0_12px_28px_rgba(15,45,58,0.06)]',
        toneClassNames.border,
      )}
    >
      <CardContent className={cn('p-4', toneClassNames.surface)}>
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
              toneClassNames.marker,
            )}
          />
          <Badge className={toneClassNames.badge} variant="outline">
            Mois
          </Badge>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
          {value}
        </p>
        <p className={cn('mt-2 text-sm font-semibold', toneClassNames.text)}>
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyRankingState() {
  return (
    <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center">
      <p className="text-sm font-bold text-slate-600">
        Aucune donnée disponible
      </p>
    </div>
  );
}

function RankingCard({
  rows,
  title,
  tone,
}: {
  rows: EmployeeRankingRow[];
  title: string;
  tone: RankingTone;
}) {
  const toneClassNames = rankingToneClassNames[tone];

  return (
    <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
          <Badge className={toneClassNames.badge} variant="outline">
            Top 5
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-4">
        {rows.length === 0 ? (
          <EmptyRankingState />
        ) : (
          rows.slice(0, 5).map((row, index) => (
            <div
              className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 px-3.5 py-3"
              key={row.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-sm font-black',
                    toneClassNames.rank,
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">
                    {row.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                    {row.department ?? 'Sans département'}
                  </p>
                  {row.meta ? (
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-400">
                      {row.meta}
                    </p>
                  ) : null}
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-sm font-black',
                  toneClassNames.value,
                )}
              >
                {row.value}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardAnalyticsSection({
  analytics,
}: DashboardAnalyticsSectionProps) {
  const topLateEmployees = analytics.topLateEmployees ?? [];
  const topOvertimeEmployees = analytics.topOvertimeEmployees ?? [];
  const topEarlyExitEmployees = analytics.topEarlyExitEmployees ?? [];
  const lateMinutesFromAvailableRanking = topLateEmployees.reduce(
    (total, employee) => total + employee.totalMinutesLate,
    0,
  );
  const lateOccurrencesFromAvailableRanking = topLateEmployees.reduce(
    (total, employee) => total + employee.lateCount,
    0,
  );
  const lateKpiValue =
    lateMinutesFromAvailableRanking > 0
      ? formatMinutes(lateMinutesFromAvailableRanking)
      : lateOccurrencesFromAvailableRanking;
  const lateKpiDetail =
    lateMinutesFromAvailableRanking > 0
      ? 'Cumul du classement disponible'
      : 'Occurrences disponibles';

  const lateRankingRows = topLateEmployees.map((employee) => ({
    id: employee.employeeId,
    name: employee.employeeName,
    department: employee.department,
    value: formatMinutes(employee.totalMinutesLate),
    meta: `${employee.lateCount} occurrence(s) - ${employee.averageMinutesLate} min moy.`,
  }));
  const overtimeRankingRows = topOvertimeEmployees.map((employee) => ({
    id: employee.employeeId,
    name: employee.employeeName,
    department: employee.department,
    value: formatHours(employee.overtimeHours),
  }));
  const earlyExitRankingRows = topEarlyExitEmployees.map((employee) => ({
    id: employee.employeeId,
    name: employee.employeeName,
    department: employee.department,
    value: formatMinutes(employee.totalEarlyExitMinutes),
    meta: `${employee.earlyExitCount} occurrence(s)`,
  }));

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline">Performance RH</Badge>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Synthèse du mois
          </h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MonthlyKpiCard
          detail={lateKpiDetail}
          label="Retards du mois"
          tone="warning"
          value={lateKpiValue}
        />
        <MonthlyKpiCard
          detail="Absences consolidées"
          label="Absences du mois"
          tone="danger"
          value={analytics.absenceCountThisMonth}
        />
        <MonthlyKpiCard
          detail="Cumul mensuel"
          label="Heures supplémentaires"
          tone="info"
          value={formatHours(analytics.overtimeHoursThisMonth)}
        />
        <MonthlyKpiCard
          detail="Occurrences mensuelles"
          label="Départs anticipés"
          tone="purple"
          value={analytics.earlyExitCount}
        />
      </div>

      <div className="space-y-4">
        <div>
          <Badge variant="outline">Classements RH</Badge>
          <h3 className="mt-2 text-xl font-black text-slate-950">
            Classements RH
          </h3>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <RankingCard
            rows={lateRankingRows}
            title="Top retards"
            tone="warning"
          />
          <RankingCard
            rows={overtimeRankingRows}
            title="Top heures supplémentaires"
            tone="info"
          />
          <RankingCard
            rows={earlyExitRankingRows}
            title="Top départs anticipés"
            tone="purple"
          />
        </div>
      </div>
    </section>
  );
}
