import type { ReactNode } from 'react';
import { DashboardOverview } from '@/lib/api';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DashboardAnalyticsSectionProps = {
  analytics: DashboardOverview['analytics'];
};

type RateTone = 'success' | 'warning' | 'danger' | 'primary';

function formatPercent(value: number) {
  return `${value.toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })}%`;
}

function formatDistance(value: number | null) {
  return value === null ? 'Distance non disponible' : `${value} m max`;
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

function getRateToneStyles(tone: RateTone) {
  return {
    success: {
      bar: 'bg-success',
      surface:
        'border-success/15 bg-[linear-gradient(180deg,rgba(25,135,84,0.08),rgba(255,255,255,0.98))]',
      pill: 'border-success/15 bg-success/10 text-success',
    },
    warning: {
      bar: 'bg-accent',
      surface:
        'border-accent/15 bg-[linear-gradient(180deg,rgba(244,110,40,0.08),rgba(255,255,255,0.98))]',
      pill: 'border-accent/15 bg-accent/10 text-accent',
    },
    danger: {
      bar: 'bg-red-500',
      surface:
        'border-red-200 bg-[linear-gradient(180deg,rgba(239,68,68,0.08),rgba(255,255,255,0.98))]',
      pill: 'border-red-200 bg-red-50 text-red-700',
    },
    primary: {
      bar: 'bg-primary',
      surface:
        'border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.08),rgba(255,255,255,0.98))]',
      pill: 'border-primary/15 bg-primary/10 text-primary',
    },
  }[tone];
}

function EmptyInsight({ message }: { message: string }) {
  return (
    <AdminEmptyState
      badge="Analyse"
      description={message}
      detail="Les prochains signaux remonteront ici."
      title="Aucun signal prioritaire"
    />
  );
}

function SectionHeading({
  badge,
  badgeVariant = 'outline',
  description,
  title,
  trailing,
}: {
  badge: string;
  badgeVariant?: 'outline' | 'success' | 'warning' | 'default';
  description: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Badge variant={badgeVariant}>{badge}</Badge>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold leading-tight text-slate-950 sm:text-2xl">
            {title}
          </h2>
          <p className="max-w-xl text-sm leading-5 text-slate-600">
            {description}
          </p>
        </div>
      </div>
      {trailing}
    </div>
  );
}

function RateInsightCard({
  hint,
  label,
  tone,
  value,
}: {
  hint: string;
  label: string;
  tone: RateTone;
  value: number;
}) {
  const styles = getRateToneStyles(tone);
  const width = `${Math.min(100, Math.max(0, value))}%`;

  return (
    <div
      className={cn(
        'rounded-[22px] border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft',
        styles.surface,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            KPI
          </p>
          <p className="text-base font-semibold text-slate-950">{label}</p>
        </div>
        <span
          className={cn(
            'inline-flex rounded-full border px-3 py-1 text-sm font-semibold',
            styles.pill,
          )}
        >
          {formatPercent(value)}
        </span>
      </div>
      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-200/80">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            styles.bar,
          )}
          style={{ width }}
        />
      </div>
      <p className="mt-3 text-sm leading-5 text-slate-600">{hint}</p>
    </div>
  );
}

function SecurityStat({
  accentClassName,
  description,
  label,
  value,
}: {
  accentClassName: string;
  description: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[22px] border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft',
        accentClassName,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1.5 text-sm leading-5 text-slate-600">{description}</p>
    </div>
  );
}

function RankedEmployeeRow({
  accentClassName,
  aside,
  description,
  index,
  name,
}: {
  accentClassName: string;
  aside: ReactNode;
  description: ReactNode;
  index: number;
  name: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-[22px] border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between',
        accentClassName,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/70 bg-white/90 text-sm font-semibold text-slate-700">
          {String(index).padStart(2, '0')}
        </span>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-slate-950">{name}</p>
          <div className="text-sm leading-6 text-slate-600">{description}</div>
        </div>
      </div>
      <div className="sm:min-w-[218px]">{aside}</div>
    </div>
  );
}

export function DashboardAnalyticsSection({
  analytics,
}: DashboardAnalyticsSectionProps) {
  const topOvertimeEmployees = analytics.topOvertimeEmployees ?? [];
  const topEarlyExitEmployees = analytics.topEarlyExitEmployees ?? [];
  const topLateEmployees = analytics.topLateEmployees ?? [];
  const topLegacySecurityEmployees =
    analytics.topLegacySecurityEmployees ?? [];

  const rateCards = [
    {
      label: 'Taux de presence',
      value: analytics.attendanceRate,
      hint: 'Employes attendus deja pointes.',
      tone: 'success' as const,
    },
    {
      label: 'Taux de retard',
      value: analytics.latenessRate,
      hint: 'Presences hors marge.',
      tone: 'warning' as const,
    },
    {
      label: 'Taux d absence',
      value: analytics.absenceRate,
      hint: 'Attendus sans presence.',
      tone: 'danger' as const,
    },
  ];

  const blockedAttemptsTracked =
    analytics.blockedAttendanceAttemptCount !== null;
  const blockedAttemptsLabel = blockedAttemptsTracked
    ? analytics.blockedAttendanceAttemptCount
    : 'Non journalise';

  return (
    <section className="space-y-6">
      <SectionHeading
        badge="Analytics"
        description="Tendances du jour et points de vigilance."
        title="Lecture rapide"
        trailing={
          <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/85 px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span className="text-sm font-medium text-slate-600">
              {analytics.gpsValidatedAttendanceCount} GPS valides
            </span>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.16fr_0.84fr]">
        <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="success">Operations du jour</Badge>
              <span className="rounded-full border border-success/15 bg-success/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-success">
                Priorite 1
              </span>
            </div>
            <div className="space-y-1">
              <CardTitle>Presence, retards et absences</CardTitle>
              <p className="text-sm leading-5 text-slate-600">
                Les ecarts du jour en premier.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 lg:grid-cols-3">
              {rateCards.map((card) => (
                <RateInsightCard key={card.label} {...card} />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="rounded-[22px] border border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.96),rgba(255,255,255,0.98))] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                  Absences cumulees
                </p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
                  {analytics.absenceCountThisMonth}
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  Cumul mensuel.
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Focus
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  Traiter les absences puis les retards repetes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[28px] border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.92))]">
          <CardHeader className="space-y-4 border-b border-accent/10 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="warning">Securite GPS</Badge>
              <span className="rounded-full border border-accent/15 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Zone autorisee
              </span>
            </div>
            <div className="space-y-1">
              <CardTitle>Pointages GPS et zone autorisee</CardTitle>
              <p className="text-sm leading-5 text-slate-600">
                Validation, zone et refus bloquants.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-3 lg:grid-cols-3">
              <SecurityStat
                accentClassName="border-accent/15 bg-white"
                description="Valides dans le flux actuel."
                label="Pointages valides (GPS)"
                value={analytics.gpsValidatedAttendanceCount}
              />
              <SecurityStat
                accentClassName="border-success/15 bg-success/10"
                description="Confirmes dans la zone."
                label="Presence dans la zone"
                value={analytics.insideZoneAttendanceCount}
              />
              <SecurityStat
                accentClassName="border-slate-200 bg-slate-50/90"
                description={
                  blockedAttemptsTracked
                    ? 'Refus hors zone ou sans GPS.'
                    : 'Journal detaille indisponible.'
                }
                label="Pointages refuses (hors zone)"
                value={blockedAttemptsLabel}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SecurityStat
                accentClassName="border-accent/15 bg-white"
                description="Entrees GPS."
                label="Entrees GPS"
                value={analytics.gpsValidatedCheckInCount}
              />
              <SecurityStat
                accentClassName="border-accent/15 bg-white"
                description="Sorties GPS."
                label="Sorties GPS"
                value={analytics.gpsValidatedCheckOutCount}
              />
              <SecurityStat
                accentClassName="border-success/15 bg-success/10"
                description="Entrees dans la zone."
                label="Zone autorisee entree"
                value={analytics.insideZoneCheckInCount}
              />
              <SecurityStat
                accentClassName="border-success/15 bg-success/10"
                description="Sorties dans la zone."
                label="Zone autorisee sortie"
                value={analytics.insideZoneCheckOutCount}
              />
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Mode actif
                  </p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Pointage GPS en zone. Les preuves photo restent historiques.
                  </p>
                </div>
                <span className="rounded-full border border-success/15 bg-success/10 px-3 py-1 text-sm font-semibold text-success">
                  {analytics.insideZoneAttendanceCount} dans la zone
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SecurityStat
                accentClassName="border-slate-200 bg-slate-50/90"
                description="Anciennes validations conservees."
                label="Validations legacy"
                value={analytics.legacyHistoricalVerificationCount}
              />
              <SecurityStat
                accentClassName="border-slate-200 bg-slate-50/90"
                description="Anciennes preuves photo."
                label="Photos historiques"
                value={analytics.legacyHistoricalPhotoCount}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-[28px] border-success/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,244,0.88))]">
          <CardHeader className="space-y-4 border-b border-success/10 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="success">Temps additionnel</Badge>
                <CardTitle>Heures supplementaires du mois</CardTitle>
              </div>
              <span className="rounded-full border border-success/15 bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">
                {formatHours(analytics.overtimeHoursThisMonth)}
              </span>
            </div>
            <p className="text-sm leading-5 text-slate-600">
              Top exposition ce mois.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <SecurityStat
                accentClassName="border-slate-200 bg-white/90"
                description="Jours travailles hors jours planifies."
                label="Jours hors planning"
                value={analytics.outsideScheduleWorkDays}
              />
              <SecurityStat
                accentClassName="border-indigo-200 bg-indigo-50/80"
                description="Volume dedie au hors planning."
                label="Heures hors planning"
                value={formatHours(
                  analytics.outsideScheduleOvertimeHoursThisMonth,
                )}
              />
            </div>

            {topOvertimeEmployees.length === 0 ? (
              <EmptyInsight message="Aucune heure supplementaire enregistree sur le mois en cours." />
            ) : (
              topOvertimeEmployees.map((employee, index) => (
                <RankedEmployeeRow
                  key={employee.employeeId}
                  accentClassName="border-success/15 bg-white/90"
                  aside={
                    <div className="rounded-[18px] border border-success/15 bg-success/10 px-4 py-3 text-center sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-success">
                        H. supp.
                      </p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">
                        {formatHours(employee.overtimeHours)}
                      </p>
                    </div>
                  }
                  description={
                    <>
                      {employee.employeeIdentifier} -{' '}
                      {employee.department ?? 'Sans departement'}
                    </>
                  }
                  index={index + 1}
                  name={employee.employeeName}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[28px] border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.92))]">
          <CardHeader className="space-y-4 border-b border-accent/10 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="warning">Departs anticipes</Badge>
                <CardTitle>Departs anticipes a suivre</CardTitle>
              </div>
              <span className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1.5 text-sm font-semibold text-accent">
                {analytics.earlyExitCount}
              </span>
            </div>
            <p className="text-sm leading-5 text-slate-600">
              A suivre ce mois.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {topEarlyExitEmployees.length === 0 ? (
              <EmptyInsight message="Aucun depart anticipe sur le mois en cours." />
            ) : (
              topEarlyExitEmployees.map((employee, index) => (
                <RankedEmployeeRow
                  key={employee.employeeId}
                  accentClassName="border-accent/15 bg-white/90"
                  aside={
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Total
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {employee.totalEarlyExitMinutes}m
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-accent/15 bg-accent/10 px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                          Jours
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {employee.earlyExitCount}
                        </p>
                      </div>
                    </div>
                  }
                  description={
                    <>
                      {employee.employeeIdentifier} -{' '}
                      {employee.department ?? 'Sans departement'}
                    </>
                  }
                  index={index + 1}
                  name={employee.employeeName}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
        <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="warning">Retards</Badge>
                <CardTitle>Top retards du mois</CardTitle>
              </div>
              <span className="text-sm font-medium text-slate-500">
                Classement minutes
              </span>
            </div>
            <p className="text-sm leading-5 text-slate-600">
              Volume et moyenne.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {topLateEmployees.length === 0 ? (
              <EmptyInsight message="Aucun retard enregistre sur le mois en cours." />
            ) : (
              topLateEmployees.map((employee, index) => (
                <RankedEmployeeRow
                  key={employee.employeeId}
                  accentClassName="border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))]"
                  aside={
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Jours
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {employee.lateCount}
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-accent/15 bg-accent/10 px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                          Total
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {employee.totalMinutesLate}m
                        </p>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Moy.
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {employee.averageMinutesLate}m
                        </p>
                      </div>
                    </div>
                  }
                  description={
                    <>
                      {employee.employeeIdentifier} -{' '}
                      {employee.department ?? 'Sans departement'}
                    </>
                  }
                  index={index + 1}
                  name={employee.employeeName}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[28px] border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.92))]">
          <CardHeader className="space-y-4 border-b border-accent/10 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="outline">Historique legacy</Badge>
                <CardTitle>Controles historiques a relire</CardTitle>
              </div>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                Ancien modele
              </span>
            </div>
            <p className="text-sm leading-5 text-slate-600">
              Bloc secondaire pour audit.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            <details className="group rounded-[22px] border border-slate-200 bg-white/75 p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
                <span>Afficher le detail legacy</span>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  {topLegacySecurityEmployees.length} profil(s)
                </span>
              </summary>

              <div className="mt-4 space-y-3">
                {topLegacySecurityEmployees.length === 0 ? (
                  <EmptyInsight message="Aucune verification legacy a relire sur le mois en cours." />
                ) : (
                  topLegacySecurityEmployees.map((employee, index) => (
                    <RankedEmployeeRow
                      key={employee.employeeId}
                      accentClassName={
                        employee.legacyStrictCount > 0
                          ? 'border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.94),rgba(255,255,255,0.98))]'
                          : 'border-accent/15 bg-white/90'
                      }
                      aside={
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Total
                            </p>
                            <p className="mt-1 font-semibold text-slate-950">
                              {employee.suspiciousCount}
                            </p>
                          </div>
                          <div
                            className={cn(
                              'rounded-[18px] border px-3 py-3 text-center',
                              employee.legacyStrictCount > 0
                                ? 'border-red-200 bg-red-50'
                                : 'border-accent/15 bg-accent/10',
                            )}
                          >
                            <p
                              className={cn(
                                'text-xs font-semibold uppercase tracking-[0.12em]',
                                employee.legacyStrictCount > 0
                                  ? 'text-red-700'
                                  : 'text-accent',
                              )}
                            >
                              {employee.legacyStrictCount > 0
                                ? 'Eleve'
                                : 'Vigilance'}
                            </p>
                            <p className="mt-1 font-semibold text-slate-950">
                              {employee.legacyStrictCount > 0
                                ? employee.legacyStrictCount
                                : employee.legacyWarningCount}
                            </p>
                          </div>
                          <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Photos
                            </p>
                            <p className="mt-1 font-semibold text-slate-950">
                              {employee.legacyPhotoVerificationCount}
                            </p>
                          </div>
                          <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              Distance
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-950">
                              {formatDistance(employee.maxDistanceMeters)}
                            </p>
                          </div>
                        </div>
                      }
                      description={
                        <div className="space-y-2">
                          <p>
                            {employee.employeeIdentifier} -{' '}
                            {employee.department ?? 'Sans departement'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
                                employee.legacyWarningCount > 0
                                  ? 'border-accent/15 bg-accent/10 text-accent'
                                  : 'border-slate-200 bg-white text-slate-500',
                              )}
                            >
                              Vigilance {employee.legacyWarningCount}
                            </span>
                            <span
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
                                employee.legacyStrictCount > 0
                                  ? 'border-red-200 bg-red-50 text-red-700'
                                  : 'border-slate-200 bg-white text-slate-500',
                              )}
                            >
                              Eleve {employee.legacyStrictCount}
                            </span>
                          </div>
                        </div>
                      }
                      index={index + 1}
                      name={employee.employeeName}
                    />
                  ))
                )}
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
