import { DashboardOverview } from '@/lib/api';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type DashboardAnalyticsSectionProps = {
  analytics: DashboardOverview['analytics'];
};

function formatPercent(value: number) {
  return `${value.toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })}%`;
}

function formatDistance(value: number | null) {
  return value === null ? 'N/A' : `${value} m`;
}

function formatHours(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'N/A';
  }

  return `${value.toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })}h`;
}

function CompactStat({
  label,
  tone = 'default',
  value,
}: {
  label: string;
  tone?: 'default' | 'success' | 'warning';
  value: number | string;
}) {
  const toneClassName =
    tone === 'success'
      ? 'border-success/15 bg-success/10 text-success'
      : tone === 'warning'
        ? 'border-accent/15 bg-accent/10 text-accent'
        : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-[18px] border px-4 py-3 ${toneClassName}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.13em]">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function EmployeeRow({
  meta,
  name,
  rank,
  value,
}: {
  meta: string;
  name: string;
  rank: number;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white/90 px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-600">
          {String(rank).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">{name}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
            {meta}
          </p>
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
        {value}
      </span>
    </div>
  );
}

function EmptyCompact({ message }: { message: string }) {
  return (
    <AdminEmptyState
      badge="Analyse"
      description={message}
      title="Aucun signal prioritaire"
    />
  );
}

export function DashboardAnalyticsSection({
  analytics,
}: DashboardAnalyticsSectionProps) {
  const topOvertimeEmployees = analytics.topOvertimeEmployees ?? [];
  const topEarlyExitEmployees = analytics.topEarlyExitEmployees ?? [];
  const topLateEmployees = analytics.topLateEmployees ?? [];
  const topLegacySecurityEmployees = analytics.topLegacySecurityEmployees ?? [];
  const blockedAttempts =
    analytics.blockedAttendanceAttemptCount === null
      ? 'Non journalise'
      : analytics.blockedAttendanceAttemptCount;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline">Analytics avances</Badge>
          <h2 className="mt-2 text-xl font-black text-slate-950">
            Tendances operationnelles
          </h2>
        </div>
        <span className="w-fit rounded-full border border-success/15 bg-success/10 px-3 py-1 text-sm font-bold text-success">
          {analytics.gpsValidatedAttendanceCount} GPS valides
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
        <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">GPS operationnel</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <CompactStat
              label="GPS valides"
              tone="success"
              value={analytics.gpsValidatedAttendanceCount}
            />
            <CompactStat label="Hors zone" value={blockedAttempts} />
            <CompactStat
              label="Entrees GPS"
              tone="warning"
              value={analytics.gpsValidatedCheckInCount}
            />
            <CompactStat
              label="Sorties GPS"
              tone="warning"
              value={analytics.gpsValidatedCheckOutCount}
            />
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Synthese du mois</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <CompactStat
              label="Presence"
              tone="success"
              value={formatPercent(analytics.attendanceRate)}
            />
            <CompactStat
              label="Retard"
              tone="warning"
              value={formatPercent(analytics.latenessRate)}
            />
            <CompactStat
              label="Absence"
              value={formatPercent(analytics.absenceRate)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-[28px] border-success/15 bg-white/95">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Heures supplementaires</CardTitle>
              <Badge variant="success">
                {formatHours(analytics.overtimeHoursThisMonth)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topOvertimeEmployees.length === 0 ? (
              <EmptyCompact message="Aucune heure supplementaire ce mois." />
            ) : (
              topOvertimeEmployees.map((employee, index) => (
                <EmployeeRow
                  key={employee.employeeId}
                  meta={`${employee.employeeIdentifier} - ${
                    employee.department ?? 'Sans departement'
                  }`}
                  name={employee.employeeName}
                  rank={index + 1}
                  value={formatHours(employee.overtimeHours)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-accent/15 bg-white/95">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-lg">Departs anticipes</CardTitle>
              <Badge variant="warning">{analytics.earlyExitCount}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topEarlyExitEmployees.length === 0 ? (
              <EmptyCompact message="Aucun depart anticipe ce mois." />
            ) : (
              topEarlyExitEmployees.map((employee, index) => (
                <EmployeeRow
                  key={employee.employeeId}
                  meta={`${employee.employeeIdentifier} - ${
                    employee.department ?? 'Sans departement'
                  }`}
                  name={employee.employeeName}
                  rank={index + 1}
                  value={`${employee.earlyExitCount} j / ${employee.totalEarlyExitMinutes}m`}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Top retards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topLateEmployees.length === 0 ? (
              <EmptyCompact message="Aucun retard ce mois." />
            ) : (
              topLateEmployees.map((employee, index) => (
                <EmployeeRow
                  key={employee.employeeId}
                  meta={`${employee.lateCount} jour(s) - ${employee.averageMinutesLate}m moy.`}
                  name={employee.employeeName}
                  rank={index + 1}
                  value={`${employee.totalMinutesLate}m`}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <details className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
        <summary className="cursor-pointer list-none text-sm font-bold text-slate-800">
          Donnees legacy et historiques ({topLegacySecurityEmployees.length})
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <CompactStat
            label="Validations legacy"
            value={analytics.legacyHistoricalVerificationCount}
          />
          <CompactStat
            label="Photos historiques"
            value={analytics.legacyHistoricalPhotoCount}
          />
          <CompactStat
            label="Distance max"
            value={
              topLegacySecurityEmployees[0]
                ? formatDistance(
                    topLegacySecurityEmployees[0].maxDistanceMeters,
                  )
                : 'N/A'
            }
          />
        </div>
      </details>
    </section>
  );
}
