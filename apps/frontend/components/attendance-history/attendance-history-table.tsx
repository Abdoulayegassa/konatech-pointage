import { useMemo, useState } from 'react';
import { AttendanceDetailPanel } from '@/components/attendance-history/attendance-detail-panel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { FilterState } from './attendance-history-filters';

type AttendanceHistoryTableProps = {
  filters: FilterState;
  records: AttendanceRecord[];
};

type StatusTone = 'success' | 'warning' | 'danger' | 'purple' | 'info' | 'muted';

const statusToneClassNames: Record<StatusTone, string> = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-accent/15 text-accent',
  danger: 'border-transparent bg-red-50 text-red-700',
  purple: 'border-transparent bg-purple-50 text-purple-700',
  info: 'border-transparent bg-blue-50 text-blue-700',
  muted: 'border-transparent bg-slate-100 text-slate-600',
};

const headerClassName =
  'sticky top-0 z-10 bg-slate-50/95 px-3 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 backdrop-blur';

const cellClassName = 'px-3 py-3 align-middle text-sm';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

function formatOvertime(record: AttendanceRecord) {
  const minutes =
    record.overtimeMinutes > 0
      ? record.overtimeMinutes
      : Math.round(record.overtimeHours * 60);

  if (minutes <= 0) {
    return '0';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainingMinutes} min`;
}

function getGpsEvidenceState(record: AttendanceRecord): {
  label: string;
  tone: StatusTone;
} {
  const gpsValidated =
    typeof record.gpsValidated === 'boolean' ? record.gpsValidated : null;
  const latitude = record.checkInLatitude ?? record.checkOutLatitude;
  const longitude = record.checkInLongitude ?? record.checkOutLongitude;
  const accuracy = record.checkInAccuracyMeters ?? record.checkOutAccuracyMeters;
  const distanceFromOffice =
    record.distanceFromOffice ??
    record.checkInDistanceMeters ??
    record.checkOutDistanceMeters;
  const hasGpsEvidence =
    (typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      typeof accuracy === 'number') ||
    typeof distanceFromOffice === 'number';

  if (gpsValidated === true) {
    return { label: 'Validé', tone: 'success' };
  }

  if (gpsValidated === false) {
    return { label: 'Non validé', tone: 'danger' };
  }

  if (hasGpsEvidence) {
    return { label: 'GPS capturé', tone: 'warning' };
  }

  return { label: 'Non disponible', tone: 'muted' };
}

function hasSelfieVerification(record: AttendanceRecord) {
  return (
    record.checkInVerificationMethod === 'PHOTO' ||
    record.checkOutVerificationMethod === 'PHOTO' ||
    Boolean(record.checkInVerificationPhoto) ||
    Boolean(record.checkOutVerificationPhoto)
  );
}

function getStatusMeta(record: AttendanceRecord): {
  label: string;
  tone: StatusTone;
  value: string;
} {
  if (record.status === 'NON_WORKING_DAY_WORK') {
    return {
      label: 'Travail jour non ouvré',
      tone: 'info',
      value: 'non-working-day-work',
    };
  }

  if (
    (record.status === 'ABSENT' && !record.clockInAt) ||
    (!record.clockInAt && !record.clockOutAt)
  ) {
    return { label: 'Absent', tone: 'danger', value: 'absent' };
  }

  if (record.status === 'INCOMPLETE' || (record.clockInAt && !record.clockOutAt)) {
    return {
      label: 'Pointage incomplet',
      tone: 'muted',
      value: 'incomplete',
    };
  }

  if (record.earlyExit || record.earlyExitMinutes > 0) {
    return {
      label: 'Départ anticipé',
      tone: 'purple',
      value: 'early-exit',
    };
  }

  if (record.overtimeHours > 0 || record.overtimeMinutes > 0) {
    return {
      label: 'Heures supplémentaires',
      tone: 'info',
      value: 'overtime',
    };
  }

  if (record.minutesLate > 0) {
    return { label: 'Retard', tone: 'warning', value: 'late' };
  }

  return { label: "À l'heure", tone: 'success', value: 'present' };
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isInSelectedPeriod(record: AttendanceRecord, period: string) {
  const recordDate = new Date(record.date);
  const now = new Date();

  if (Number.isNaN(recordDate.getTime())) {
    return false;
  }

  if (period === 'today') {
    return recordDate.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }

  if (period === 'this-week') {
    const weekStart = new Date(now);
    const day = weekStart.getDay() === 0 ? 7 : weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - day + 1);
    weekStart.setHours(0, 0, 0, 0);

    return recordDate >= weekStart && recordDate <= now;
  }

  if (period === 'this-month' || period === 'custom') {
    return (
      recordDate.getFullYear() === now.getFullYear() &&
      recordDate.getMonth() === now.getMonth()
    );
  }

  if (period === 'this-quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3);

    return (
      recordDate.getFullYear() === now.getFullYear() &&
      Math.floor(recordDate.getMonth() / 3) === currentQuarter
    );
  }

  if (period === 'this-year') {
    return recordDate.getFullYear() === now.getFullYear();
  }

  return true;
}

export function filterAttendanceHistoryRecords(
  records: AttendanceRecord[],
  filters: FilterState,
) {
  const employeeSearch = normalizeSearchValue(filters.employee);

  return records.filter((record) => {
    const status = getStatusMeta(record);
    const employeeLabel = normalizeSearchValue(
      `${record.employee.firstName} ${record.employee.lastName} ${record.employee.employeeIdentifier}`,
    );

    return (
      isInSelectedPeriod(record, filters.period) &&
      (!employeeSearch || employeeLabel.includes(employeeSearch)) &&
      (!filters.department || record.employee.department === filters.department) &&
      (filters.status.length === 0 || filters.status.includes(status.value))
    );
  });
}

function ValueBadge({
  active,
  children,
  tone,
}: {
  active: boolean;
  children: string;
  tone: StatusTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-black',
        active
          ? statusToneClassNames[tone]
          : 'border-slate-200 bg-slate-50 text-slate-500',
      )}
    >
      {children}
    </span>
  );
}

export function AttendanceHistoryTable({
  filters,
  records,
}: AttendanceHistoryTableProps) {
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(
    null,
  );
  const filteredRecords = useMemo(
    () => filterAttendanceHistoryRecords(records, filters),
    [filters, records],
  );

  return (
    <>
      <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
        <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="outline">Historique RH</Badge>
              <CardTitle className="mt-2 text-xl text-slate-950">
                Historique des pointages
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Consultez l'ensemble des pointages enregistrés.
              </p>
            </div>
            <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
              {filteredRecords.length} pointage(s)
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredRecords.length === 0 ? (
            <div className="p-4">
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-12 text-center">
                <p className="text-base font-black text-slate-950">
                  Aucun pointage trouvé.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-[680px] overflow-auto">
              <table className="min-w-[1320px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th className={headerClassName}>Date</th>
                    <th className={headerClassName}>Employé</th>
                    <th className={headerClassName}>Département</th>
                    <th className={headerClassName}>Entrée</th>
                    <th className={headerClassName}>Sortie</th>
                    <th className={headerClassName}>Retard</th>
                    <th className={headerClassName}>Départ anticipé</th>
                    <th className={headerClassName}>Heures supp</th>
                    <th className={headerClassName}>GPS</th>
                    <th className={headerClassName}>Selfie</th>
                    <th className={headerClassName}>Commentaire</th>
                    <th className={headerClassName}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record, index) => {
                    const status = getStatusMeta(record);
                    const gpsEvidence = getGpsEvidenceState(record);
                    const selfiePresent = hasSelfieVerification(record);
                    const notesPreview = record.notes
                      ? `${record.notes.slice(0, 28)}${record.notes.length > 28 ? '...' : ''}`
                      : '';

                    return (
                      <tr
                        className={cn(
                          'cursor-pointer transition duration-200 hover:bg-accent/5 focus-within:bg-accent/5',
                          index % 2 === 0 ? 'bg-white' : 'bg-slate-50/55',
                        )}
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                      >
                        <td className={cn(cellClassName, 'font-bold text-slate-700')}>
                          {formatDate(record.date)}
                        </td>
                        <td className={cellClassName}>
                          <p className="font-black text-slate-950">
                            {record.employee.firstName} {record.employee.lastName}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            {record.employee.employeeIdentifier}
                          </p>
                        </td>
                        <td className={cn(cellClassName, 'font-semibold text-slate-600')}>
                          {record.employee.department ?? '--'}
                        </td>
                        <td className={cn(cellClassName, 'font-black text-slate-950')}>
                          {formatTime(record.clockInAt)}
                        </td>
                        <td className={cn(cellClassName, 'font-black text-slate-950')}>
                          {formatTime(record.clockOutAt)}
                        </td>
                        <td className={cellClassName}>
                          <ValueBadge active={record.minutesLate > 0} tone="warning">
                            {formatMinutes(record.minutesLate)}
                          </ValueBadge>
                        </td>
                        <td className={cellClassName}>
                          <ValueBadge
                            active={record.earlyExitMinutes > 0}
                            tone="purple"
                          >
                            {formatMinutes(record.earlyExitMinutes)}
                          </ValueBadge>
                        </td>
                        <td className={cellClassName}>
                          <ValueBadge
                            active={record.overtimeHours > 0 || record.overtimeMinutes > 0}
                            tone="info"
                          >
                            {formatOvertime(record)}
                          </ValueBadge>
                        </td>
                        <td className={cellClassName}>
                          <ValueBadge
                            active={gpsEvidence.label !== 'Non disponible'}
                            tone={gpsEvidence.tone}
                          >
                            {gpsEvidence.label}
                          </ValueBadge>
                        </td>
                        <td className={cellClassName}>
                          <ValueBadge active={selfiePresent} tone={selfiePresent ? 'success' : 'danger'}>
                            {selfiePresent ? 'Présent' : 'Manquant'}
                          </ValueBadge>
                        </td>
                        <td className={cn(cellClassName, 'max-w-[180px]')}>
                          <p className="truncate font-semibold text-slate-600">
                            {notesPreview}
                          </p>
                        </td>
                        <td className={cellClassName}>
                          <Badge
                            className={statusToneClassNames[status.tone]}
                            variant="outline"
                          >
                            {status.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AttendanceDetailPanel
        onClose={() => setSelectedRecord(null)}
        record={selectedRecord}
      />
    </>
  );
}
