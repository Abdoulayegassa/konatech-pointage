'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type AttendanceDetailPanelProps = {
  onClose: () => void;
  record: AttendanceRecord | null;
};

type Tone = 'success' | 'warning' | 'danger' | 'purple' | 'info' | 'muted';
type ComplianceLevel = 'success' | 'warning' | 'danger';
type SanctionStatus = 'TOLERATED' | 'APPLIED' | 'NOT_APPLICABLE';
type SanctionRuleType =
  | 'MINOR_LATENESS'
  | 'MAJOR_LATENESS'
  | 'EARLY_DEPARTURE'
  | 'UNJUSTIFIED_ABSENCE'
  | 'JUSTIFIED_ABSENCE'
  | 'LEAVE'
  | 'EXTERNAL_MISSION';
type SanctionResult = {
  employeeId: string;
  attendanceId: string;
  date: string;
  ruleType: SanctionRuleType | null;
  reason: string;
  amount: number;
  status: SanctionStatus;
};
type SanctionRequestState =
  | {
      status: 'idle' | 'loading';
      data: null;
    }
  | {
      status: 'success';
      data: SanctionResult;
    }
  | {
      status: 'not_found' | 'unavailable';
      data: null;
    }
  | {
      status: 'error';
      data: null;
    };

const toneClassNames: Record<Tone, string> = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-accent/15 text-accent',
  danger: 'border-transparent bg-red-50 text-red-700',
  purple: 'border-transparent bg-purple-50 text-purple-700',
  info: 'border-transparent bg-blue-50 text-blue-700',
  muted: 'border-transparent bg-slate-100 text-slate-600',
};

const complianceClassNames: Record<
  ComplianceLevel,
  {
    badge: string;
    marker: string;
    surface: string;
    title: string;
  }
> = {
  success: {
    badge: 'border-transparent bg-success/15 text-success',
    marker: 'bg-success',
    surface: 'border-success/15 bg-success/10',
    title: 'text-success',
  },
  warning: {
    badge: 'border-transparent bg-accent/15 text-accent',
    marker: 'bg-accent',
    surface: 'border-accent/15 bg-accent/10',
    title: 'text-accent',
  },
  danger: {
    badge: 'border-transparent bg-red-50 text-red-700',
    marker: 'bg-red-600',
    surface: 'border-red-500/15 bg-red-50',
    title: 'text-red-700',
  },
};

const sanctionClassNames: Record<
  'none' | 'tolerated' | 'applied',
  {
    badge: string;
    surface: string;
    title: string;
  }
> = {
  none: {
    badge: 'border-transparent bg-success/15 text-success',
    surface: 'border-success/15 bg-success/10',
    title: 'text-success',
  },
  tolerated: {
    badge: 'border-transparent bg-accent/15 text-accent',
    surface: 'border-accent/15 bg-accent/10',
    title: 'text-accent',
  },
  applied: {
    badge: 'border-transparent bg-red-50 text-red-700',
    surface: 'border-red-500/15 bg-red-50',
    title: 'text-red-700',
  },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(value: string | null) {
  if (!value) {
    return '--';
  }

  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMinutes(value: number) {
  return `${Math.max(0, value)} min`;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
}

function formatSanctionReason(reason: string) {
  const normalizedReason = reason.trim();

  if (
    normalizedReason ===
    'No active sanction rule applies to this attendance record.'
  ) {
    return 'Aucune règle disciplinaire applicable à ce pointage.';
  }

  if (
    normalizedReason ===
    'Major lateness: lateness of 15 minutes or more has no tolerance.'
  ) {
    return 'Retard majeur (15 min ou plus) : sanction appliquée sans tolérance.';
  }

  if (normalizedReason === 'First minor lateness in the month is tolerated.') {
    return 'Premier retard mineur du mois : tolérance accordée.';
  }

  if (
    normalizedReason ===
    'Minor lateness: first occurrence in the month is tolerated; subsequent occurrences are sanctioned.'
  ) {
    return 'Tolérance mensuelle déjà utilisée.';
  }

  if (normalizedReason === 'Prepared for future configuration; inactive in V1.') {
    return 'Règle prévue pour une configuration ultérieure.';
  }

  return reason;
}

function getSanctionRuleLabel(ruleType: SanctionRuleType | null) {
  if (ruleType === 'MINOR_LATENESS') {
    return 'Retard mineur';
  }

  if (ruleType === 'MAJOR_LATENESS') {
    return 'Retard majeur';
  }

  return 'Aucune sanction';
}

function getSanctionDecisionLabel(status: SanctionStatus) {
  if (status === 'TOLERATED') {
    return 'Tolérance accordée';
  }

  if (status === 'APPLIED') {
    return 'Sanction appliquée';
  }

  return 'Aucune sanction appliquée';
}

function getSanctionStatusLabel(status: SanctionStatus) {
  if (status === 'TOLERATED') {
    return 'Tolérance accordée';
  }

  if (status === 'APPLIED') {
    return 'Sanction appliquée';
  }

  return 'Non applicable';
}

function getStatusMeta(record: AttendanceRecord): {
  label: string;
  tone: Tone;
} {
  if (record.status === 'NON_WORKING_DAY_WORK') {
    return { label: 'Travail jour non ouvré', tone: 'info' };
  }

  if (
    (record.status === 'ABSENT' && !record.clockInAt) ||
    (!record.clockInAt && !record.clockOutAt)
  ) {
    return { label: 'Absent', tone: 'danger' };
  }

  if (record.status === 'INCOMPLETE' || (record.clockInAt && !record.clockOutAt)) {
    return { label: 'Pointage incomplet', tone: 'muted' };
  }

  if (record.earlyExit || record.earlyExitMinutes > 0) {
    return { label: 'Départ anticipé', tone: 'purple' };
  }

  if (record.overtimeHours > 0 || record.overtimeMinutes > 0) {
    return { label: 'Heures supplémentaires', tone: 'info' };
  }

  if (record.minutesLate > 0) {
    return { label: 'Retard', tone: 'warning' };
  }

  return { label: "À l'heure", tone: 'success' };
}

function getComplianceLevel(record: AttendanceRecord): {
  description: string;
  label: string;
  level: ComplianceLevel;
} {
  const status = getStatusMeta(record);
  const gpsValidated = hasGpsVerification(record);
  const completeAttendance = Boolean(record.clockInAt && record.clockOutAt);
  const missingMandatoryInformation = !record.clockInAt || !record.date;

  if (record.status === 'NON_WORKING_DAY_WORK') {
    return {
      description: 'Travail exceptionnel enregistré sur un jour non ouvré',
      label: 'Travail exceptionnel',
      level: 'success',
    };
  }

  if (
    status.label === 'Absent' ||
    status.label === 'Pointage incomplet' ||
    missingMandatoryInformation
  ) {
    return {
      description: 'Présence non conforme ou nécessitant une action',
      label: 'Incident RH',
      level: 'danger',
    };
  }

  if (
    record.minutesLate > 0 ||
    record.earlyExitMinutes > 0 ||
    record.overtimeHours > 0 ||
    record.overtimeMinutes > 0 ||
    !gpsValidated
  ) {
    return {
      description: 'Présence enregistrée avec anomalie mineure',
      label: 'À surveiller',
      level: 'warning',
    };
  }

  if (
    status.label === "À l'heure" &&
    gpsValidated &&
    completeAttendance &&
    record.minutesLate === 0 &&
    record.earlyExitMinutes === 0
  ) {
    return {
      description: 'Pointage conforme aux règles RH',
      label: 'Conforme',
      level: 'success',
    };
  }

  return {
    description: 'Présence enregistrée avec anomalie mineure',
    label: 'À surveiller',
    level: 'warning',
  };
}

function getAttendanceType(record: AttendanceRecord) {
  if (record.clockOutAt) {
    return 'Sortie';
  }

  return 'Entrée';
}

function getOvertimeMinutes(record: AttendanceRecord) {
  return record.overtimeMinutes > 0
    ? record.overtimeMinutes
    : Math.round(record.overtimeHours * 60);
}

function hasGpsVerification(record: AttendanceRecord) {
  return (
    record.checkInVerificationMethod === 'GPS' ||
    record.checkOutVerificationMethod === 'GPS'
  );
}

function getGpsDetails(record: AttendanceRecord) {
  const latitude = record.checkInLatitude ?? record.checkOutLatitude;
  const longitude = record.checkInLongitude ?? record.checkOutLongitude;
  const accuracy = record.checkInAccuracyMeters ?? record.checkOutAccuracyMeters;

  return { accuracy, latitude, longitude };
}

function getGpsEvidenceState(record: AttendanceRecord): {
  description: string;
  label: string;
  tone: Tone;
} {
  const gpsValidated =
    typeof record.gpsValidated === 'boolean' ? record.gpsValidated : null;
  const gpsDetails = getGpsDetails(record);
  const hasGpsCapture =
    typeof gpsDetails.latitude === 'number' &&
    typeof gpsDetails.longitude === 'number' &&
    typeof gpsDetails.accuracy === 'number';
  const hasDistanceEvidence = typeof record.distanceFromOffice === 'number';
  const hasGpsEvidence = hasGpsCapture || hasDistanceEvidence;

  if (gpsValidated === true) {
    return {
      description: 'Position conforme à la zone autorisée.',
      label: 'Validé',
      tone: 'success',
    };
  }

  if (gpsValidated === false) {
    return {
      description: hasGpsEvidence
        ? 'GPS capturé, validation de zone non confirmée.'
        : 'Aucune donnée GPS disponible.',
      label: 'Non validé',
      tone: 'danger',
    };
  }

  if (hasGpsEvidence) {
    return {
      description: 'GPS capturé, validation de zone non confirmée.',
      label: 'GPS capturé',
      tone: 'warning',
    };
  }

  return {
    description: 'Aucune donnée GPS disponible.',
    label: 'Non disponible',
    tone: 'muted',
  };
}

function getSelfieUrl(record: AttendanceRecord) {
  return record.checkInVerificationPhoto ?? record.checkOutVerificationPhoto;
}

function DetailSection({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <Card
      className={cn(
        'rounded-[24px] border-slate-200/80 bg-white/95 shadow-sm',
        className,
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-950">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">{children}</CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <div className="min-w-0 text-right text-sm font-black text-slate-950">
        {value}
      </div>
    </div>
  );
}

function MetricBadge({
  children,
  tone,
}: {
  children: string;
  tone: Tone;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-3 py-1 text-sm font-black',
        toneClassNames[tone],
      )}
    >
      {children}
    </span>
  );
}

function SummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: Tone;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/70 bg-white/88 p-3 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <div className="mt-2">
        <MetricBadge tone={tone}>{value}</MetricBadge>
      </div>
    </div>
  );
}

function ComplianceScoreCard({
  description,
  label,
  level,
}: {
  description: string;
  label: string;
  level: ComplianceLevel;
}) {
  const classNames = complianceClassNames[level];

  return (
    <div className={cn('rounded-[20px] border p-4', classNames.surface)}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
        Conformité RH
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span
          className={cn('h-3 w-3 shrink-0 rounded-full', classNames.marker)}
        />
        <Badge className={cn('px-3 py-1.5 text-sm', classNames.badge)}>
          {label}
        </Badge>
      </div>
      <p className={cn('mt-3 text-sm font-bold leading-5', classNames.title)}>
        {description}
      </p>
    </div>
  );
}

function SanctionLoadingCard() {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="h-4 w-32 rounded-full bg-slate-200" />
      <div className="mt-4 h-7 w-44 rounded-full bg-slate-200" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-16 rounded-[18px] bg-white/80" />
        <div className="h-16 rounded-[18px] bg-white/80" />
      </div>
    </div>
  );
}

function SanctionDetailCard({ sanction }: { sanction: SanctionResult }) {
  if (sanction.status === 'NOT_APPLICABLE') {
    const classNames = sanctionClassNames.none;

    return (
      <div className={cn('rounded-[20px] border p-4', classNames.surface)}>
        <Badge className={cn('px-3 py-1.5 text-sm', classNames.badge)}>
          Aucune sanction applicable à ce pointage.
        </Badge>
        <p className={cn('mt-3 text-base font-black', classNames.title)}>
          Aucune sanction applicable à ce pointage.
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
          Aucun impact disciplinaire détecté.
        </p>
      </div>
    );
  }

  const isApplied = sanction.status === 'APPLIED';
  const classNames = isApplied
    ? sanctionClassNames.applied
    : sanctionClassNames.tolerated;

  return (
    <div className={cn('rounded-[20px] border p-4', classNames.surface)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={cn('text-base font-black', classNames.title)}>
            {getSanctionRuleLabel(sanction.ruleType)}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700">
            {getSanctionDecisionLabel(sanction.status)}
          </p>
        </div>
        <Badge className={cn('w-fit px-3 py-1.5 text-sm', classNames.badge)}>
          {getSanctionStatusLabel(sanction.status)}
        </Badge>
      </div>

      <div className="mt-4 space-y-1">
        <DetailRow
          label="Type"
          value={getSanctionRuleLabel(sanction.ruleType)}
        />
        <DetailRow
          label="Décision"
          value={getSanctionDecisionLabel(sanction.status)}
        />
        <DetailRow label="Montant" value={formatMoney(sanction.amount)} />
        <DetailRow label="Règle" value={formatSanctionReason(sanction.reason)} />
        <DetailRow
          label="Statut"
          value={getSanctionStatusLabel(sanction.status)}
        />
      </div>
    </div>
  );
}

export function AttendanceDetailPanel({
  onClose,
  record,
}: AttendanceDetailPanelProps) {
  const [sanctionState, setSanctionState] = useState<SanctionRequestState>({
    status: 'idle',
    data: null,
  });

  useEffect(() => {
    if (!record?.id) {
      setSanctionState({
        status: 'idle',
        data: null,
      });
      return;
    }

    const controller = new AbortController();

    setSanctionState({
      status: 'loading',
      data: null,
    });

    fetch(`/api/sanctions/attendance/${encodeURIComponent(record.id)}`, {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            setSanctionState({
              status: 'not_found',
              data: null,
            });
            return null;
          }

          throw new Error('Sanction request failed.');
        }

        return (await response.json()) as SanctionResult;
      })
      .then((data) => {
        if (!data) {
          return;
        }

        setSanctionState({
          status: 'success',
          data,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setSanctionState({
          status: 'unavailable',
          data: null,
        });
      });

    return () => {
      controller.abort();
    };
  }, [record?.id]);

  if (!record) {
    return null;
  }

  const status = getStatusMeta(record);
  const gpsEvidence = getGpsEvidenceState(record);
  const compliance = getComplianceLevel(record);
  const gpsDetails = getGpsDetails(record);
  const selfieUrl = getSelfieUrl(record);
  const hasScheduleInfo = Boolean(
    record.scheduleNameSnapshot ||
      record.scheduleStartTimeSnapshot ||
      record.scheduleEndTimeSnapshot ||
      typeof record.scheduleLatenessMarginSnapshot === 'number',
  );

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Fermer la fiche pointage"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside className="absolute inset-0 flex flex-col overflow-hidden bg-slate-50 shadow-[0_22px_70px_rgba(15,23,42,0.26)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[520px] sm:rounded-l-[30px]">
        <header className="border-b border-slate-200 bg-white/95 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge variant="outline">Fiche Pointage</Badge>
              <h2 className="mt-3 text-2xl font-black text-slate-950">
                Fiche Pointage
              </h2>
              <p className="mt-2 text-lg font-black text-slate-950">
                {record.employee.firstName} {record.employee.lastName}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {record.employee.department ?? 'Sans département'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {formatDate(record.date)}
              </p>
            </div>
            <Button onClick={onClose} type="button" variant="secondary">
              Fermer
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <DetailSection title="Identité du pointage">
            <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-lg font-black text-slate-950">
                {record.employee.firstName} {record.employee.lastName}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-600">
                {record.employee.department ?? 'Sans département'}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-600">
                {formatDate(record.date)}
              </p>
            </div>
          </DetailSection>

          <DetailSection
            className="border-primary/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,248,248,0.94))] shadow-[0_18px_44px_rgba(15,45,58,0.10)]"
            title="Résumé RH"
          >
            <ComplianceScoreCard
              description={compliance.description}
              label={compliance.label}
              level={compliance.level}
            />

            <div className="rounded-[20px] border border-primary/10 bg-white/90 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                Statut
              </p>
              <div className="mt-2">
                <Badge
                  className={cn(
                    'px-3 py-1.5 text-sm',
                    toneClassNames[status.tone],
                  )}
                  variant="outline"
                >
                  {status.label}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryMetric
                label="Retard"
                tone="warning"
                value={formatMinutes(record.minutesLate)}
              />
              <SummaryMetric
                label="Départ anticipé"
                tone="purple"
                value={formatMinutes(record.earlyExitMinutes)}
              />
              <SummaryMetric
                label="Heures supplémentaires"
                tone="info"
                value={formatMinutes(getOvertimeMinutes(record))}
              />
            </div>
          </DetailSection>

          <DetailSection title="Sanction RH">
            {sanctionState.status === 'loading' ||
            sanctionState.status === 'idle' ? (
              <SanctionLoadingCard />
            ) : null}

            {sanctionState.status === 'success' && sanctionState.data ? (
              <SanctionDetailCard sanction={sanctionState.data} />
            ) : null}

            {sanctionState.status === 'not_found' ? (
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                <Badge className="border-transparent bg-slate-100 text-slate-600">
                  Introuvable
                </Badge>
                <p className="mt-3 text-sm font-bold leading-6 text-slate-700">
                  Pointage introuvable pour l'analyse disciplinaire.
                </p>
              </div>
            ) : null}

            {sanctionState.status === 'unavailable' ? (
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                <Badge className="border-transparent bg-slate-100 text-slate-600">
                  Indisponible
                </Badge>
                <p className="mt-3 text-sm font-bold leading-6 text-slate-700">
                  Analyse disciplinaire temporairement indisponible.
                </p>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection title="Horaires de pointage">
            <DetailRow label="Type" value={getAttendanceType(record)} />
            <DetailRow label="Heure d'entrée" value={formatTime(record.clockInAt)} />
            <DetailRow label="Heure de sortie" value={formatTime(record.clockOutAt)} />
          </DetailSection>

          <DetailSection title="Planning appliqué">
            {hasScheduleInfo ? (
              <>
                <DetailRow
                  label="Planning utilisé"
                  value={record.scheduleNameSnapshot ?? 'Indisponible'}
                />
                <DetailRow
                  label="Début prévu"
                  value={record.scheduleStartTimeSnapshot ?? 'Indisponible'}
                />
                <DetailRow
                  label="Fin prévue"
                  value={
                    record.scheduleEndTimeSnapshot ??
                    (record.scheduledExitTime
                      ? formatTime(record.scheduledExitTime)
                      : 'Indisponible')
                  }
                />
                <DetailRow
                  label="Marge de retard"
                  value={
                    typeof record.scheduleLatenessMarginSnapshot === 'number'
                      ? `${record.scheduleLatenessMarginSnapshot} min`
                      : 'Indisponible'
                  }
                />
              </>
            ) : (
              <p className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm font-bold text-slate-600">
                Informations de planning indisponibles
              </p>
            )}
          </DetailSection>

          <DetailSection title="Conformité">
            <DetailRow
              label="Statut GPS"
              value={
                <div className="space-y-1 text-right">
                  <MetricBadge tone={gpsEvidence.tone}>
                    {gpsEvidence.label}
                  </MetricBadge>
                  <p className="max-w-[240px] text-xs font-semibold leading-5 text-slate-500">
                    {gpsEvidence.description}
                  </p>
                </div>
              }
            />
            <DetailRow
              label="Latitude"
              value={gpsDetails.latitude ?? 'Indisponible'}
            />
            <DetailRow
              label="Longitude"
              value={gpsDetails.longitude ?? 'Indisponible'}
            />
            <DetailRow
              label="Précision GPS"
              value={
                typeof gpsDetails.accuracy === 'number'
                  ? `${gpsDetails.accuracy} m`
                  : 'Indisponible'
              }
            />
            <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                Commentaire
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                {record.notes?.trim() || 'Aucun commentaire'}
              </p>
            </div>
          </DetailSection>

          <DetailSection title="Preuves">
            <p className="text-sm font-black text-slate-700">
              Selfie de vérification
            </p>
            {selfieUrl ? (
              <img
                alt="Selfie de vérification du pointage"
                className="max-h-[360px] w-full rounded-[22px] object-cover shadow-[0_18px_42px_rgba(15,45,58,0.12)]"
                src={selfieUrl}
              />
            ) : (
              <p className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm font-bold text-slate-600">
                Aucun selfie disponible
              </p>
            )}
          </DetailSection>

          <DetailSection title="Audit technique">
            <DetailRow label="Date de création" value={formatDateTime(record.createdAt)} />
            <DetailRow
              label="Dernière mise à jour"
              value={formatDateTime(record.updatedAt)}
            />
            <DetailRow label="Identifiant du pointage" value={record.id} />
          </DetailSection>
        </div>

        <footer className="border-t border-slate-200 bg-white/95 p-4 sm:p-5">
          <Button className="w-full" onClick={onClose} type="button">
            Fermer
          </Button>
        </footer>
      </aside>
    </div>
  );
}
