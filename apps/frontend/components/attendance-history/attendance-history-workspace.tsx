'use client';

import { useMemo, useState } from 'react';
import {
  AttendanceHistoryFilters,
  defaultAttendanceHistoryFilters,
  type FilterState,
} from '@/components/attendance-history/attendance-history-filters';
import {
  AttendanceHistoryTable,
  filterAttendanceHistoryRecords,
} from '@/components/attendance-history/attendance-history-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  AttendanceHistoryPage,
  AttendanceRecord,
  EmployeeRecord,
} from '@/lib/api';
import { cn } from '@/lib/utils';

type AttendanceHistoryWorkspaceProps = {
  departments: string[];
  employees: EmployeeRecord[];
  initialHistory: AttendanceHistoryPage;
};

function getOvertimeMinutes(record: AttendanceRecord) {
  if (record.overtimeMinutes > 0) {
    return record.overtimeMinutes;
  }

  return Math.round(record.overtimeHours * 60);
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return '0 min';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${minutes} min`;
}

function PeriodSummaryCard({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className={cn('rounded-lg border px-3 py-2.5', className)}>
      <p className="text-xs font-medium text-slate-600">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function AttendancePeriodSummary({ records }: { records: AttendanceRecord[] }) {
  const overtimeMinutes = records.reduce(
    (total, record) => total + getOvertimeMinutes(record),
    0,
  );
  const lateCount = records.filter((record) => record.minutesLate > 0).length;
  const absenceCount = records.filter(
    (record) => record.status === 'ABSENT',
  ).length;
  const earlyExitCount = records.filter(
    (record) => record.earlyExit || record.earlyExitMinutes > 0,
  ).length;
  const nonWorkingDayWorkCount = records.filter(
    (record) => record.status === 'NON_WORKING_DAY_WORK',
  ).length;

  return (
    <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-3">
        <CardTitle className="text-sm font-semibold">Résumé de la période</CardTitle>
        <span className="text-xs text-slate-600">{records.length} pointage(s)</span>
      </CardHeader>
      <CardContent className="p-3">
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <PeriodSummaryCard
            className="border-blue-200 bg-blue-50"
            label="Pointages"
            value={records.length}
          />
          <PeriodSummaryCard
            className="border-accent/20 bg-orange-50"
            label="Retards"
            value={lateCount}
          />
          <PeriodSummaryCard
            className="border-red-200 bg-red-50"
            label="Absences"
            value={absenceCount}
          />
          <PeriodSummaryCard
            className="border-purple-200 bg-purple-50"
            label="Départs anticipés"
            value={earlyExitCount}
          />
          <PeriodSummaryCard
            className="border-blue-200 bg-blue-50"
            label="Heures supplémentaires"
            value={formatDuration(overtimeMinutes)}
          />
          <PeriodSummaryCard
            className="border-success/20 bg-success/10"
            label="Travail jour non ouvré"
            value={nonWorkingDayWorkCount}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function AttendanceHistoryWorkspace({
  departments,
  employees,
  initialHistory,
}: AttendanceHistoryWorkspaceProps) {
  const [filters, setFilters] = useState<FilterState>(
    defaultAttendanceHistoryFilters,
  );
  const [history, setHistory] = useState(initialHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayPage, setDisplayPage] = useState(1);
  const filteredRecords = useMemo(
    () => filterAttendanceHistoryRecords(history.items, filters).filter((record) => {
      const query = filters.query.trim().toLowerCase();
      return !query || [record.employee.firstName, record.employee.lastName, record.employee.email, record.employee.employeeIdentifier].join(' ').toLowerCase().includes(query);
    }),
    [filters, history.items],
  );
  const pageSize = 50;
  const paginatedRecords = filteredRecords.slice(
    (displayPage - 1) * pageSize,
    displayPage * pageSize,
  );

  function isoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  function businessDateKey(date: Date) {
    const timeZone = history.organizationTimezone;
    if (!timeZone) return isoDate(date);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  function resolvePeriod(nextFilters: FilterState) {
    const now = new Date();
    if (nextFilters.period === 'custom') {
      return { startDate: nextFilters.startDate, endDate: nextFilters.endDate };
    }
    if (nextFilters.period === 'today') {
      const value = businessDateKey(now);
      return { startDate: value, endDate: value };
    }
    if (nextFilters.period === 'this-week') {
      const localToday = businessDateKey(now);
      const start = new Date(`${localToday}T00:00:00.000Z`);
      const day = start.getUTCDay() || 7;
      start.setUTCDate(start.getUTCDate() - day + 1);
      return { startDate: isoDate(start), endDate: localToday };
    }
    const localToday = new Date(`${businessDateKey(now)}T00:00:00.000Z`);
    const start = new Date(
      Date.UTC(localToday.getUTCFullYear(), localToday.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(localToday.getUTCFullYear(), localToday.getUTCMonth() + 1, 0),
    );
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }

  async function loadHistory(nextFilters: FilterState) {
    const period = resolvePeriod(nextFilters);
    if (!period.startDate || !period.endDate) {
      setError('Saisissez une date de début et une date de fin.');
      return;
    }
    if (period.startDate > period.endDate) {
      setError('La date de fin doit être postérieure à la date de début.');
      return;
    }
    const params = new URLSearchParams({ ...period, page: '1', pageSize: '100' });
    if (nextFilters.employee) params.set('employeeId', nextFilters.employee);
    if (nextFilters.status.length)
      params.set('status', nextFilters.status.join(','));
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/attendance/history?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to load attendance history.');
      const first = (await response.json()) as AttendanceHistoryPage;
      const items = [...first.items];
      for (let page = 2; page <= first.totalPages; page += 1) {
        const nextResponse = await fetch(`/api/attendance/history?${new URLSearchParams({ ...period, page: String(page), pageSize: '100', ...(nextFilters.employee ? { employeeId: nextFilters.employee } : {}), ...(nextFilters.status.length ? { status: nextFilters.status.join(',') } : {}) })}`, { cache: 'no-store' });
        if (!nextResponse.ok) throw new Error('Unable to load attendance history.');
        items.push(...((await nextResponse.json()) as AttendanceHistoryPage).items);
      }
      setHistory({ ...first, items, page: 1, total: items.length, totalPages: 1 });
      setDisplayPage(1);
    } catch {
      setError("Impossible de charger l'historique des pointages.");
    } finally {
      setLoading(false);
    }
  }

  function downloadVisiblePeriod() {
    const period = resolvePeriod(filters);
    if (!period.startDate || !period.endDate) {
      setError('Saisissez une date de début et une date de fin.');
      return;
    }
    if (period.startDate > period.endDate) {
      setError('La date de fin doit être postérieure à la date de début.');
      return;
    }
    if (filters.department || filters.status.length > 0) {
      setError("L’export CSV prend en charge la période et le filtre employé. Retirez le filtre département/statut pour exporter un périmètre cohérent.");
      return;
    }
    setError(null);
    const params = new URLSearchParams({ format: 'csv' });
    if (filters.period === 'this-month') {
      params.set('month', period.startDate.slice(0, 7));
    } else {
      params.set('mode', 'custom');
      params.set('startDate', period.startDate);
      params.set('endDate', period.endDate);
    }
    if (filters.employee) params.set('employeeId', filters.employee);
    void (async () => {
      try {
        const response = await fetch(`/api/attendance/exports/monthly?${params}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Export impossible.');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `pointages-${period.startDate}-${period.endDate}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch {
        setError("Impossible de générer l'export CSV.");
      }
    })();
  }

  return (
    <section className="admin-reveal admin-reveal-delay-1 grid gap-4">
      <AttendanceHistoryFilters
        departments={departments}
        employees={employees}
        filters={filters}
        onApply={(nextFilters) => {
          setFilters(nextFilters);
          void loadHistory(nextFilters);
        }}
      />

      <AttendancePeriodSummary records={filteredRecords} />

      {error ? (
        <div
          aria-live="polite"
          className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          onClick={downloadVisiblePeriod}
          type="button"
          variant="secondary"
        >
          Exporter la période affichée (CSV)
        </Button>
      </div>

      {loading ? (
        <p className="text-sm font-semibold text-slate-500">
          Mise à jour de l’historique…
        </p>
      ) : null}
      <AttendanceHistoryTable
        filters={filters}
        records={paginatedRecords}
        timeZone={history.organizationTimezone ?? undefined}
      />
      {Math.ceil(filteredRecords.length / pageSize) > 1 ? (
        <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
          <button
            className="rounded-xl border px-3 py-2 disabled:opacity-40"
            disabled={loading || displayPage <= 1}
            onClick={() => setDisplayPage((page) => page - 1)}
            type="button"
          >
            Précédent
          </button>
          <span>
            Page {displayPage} / {Math.ceil(filteredRecords.length / pageSize)} · {filteredRecords.length}{' '}
            résultats
          </span>
          <button
            className="rounded-xl border px-3 py-2 disabled:opacity-40"
            disabled={loading || displayPage >= Math.ceil(filteredRecords.length / pageSize)}
            onClick={() => setDisplayPage((page) => page + 1)}
            type="button"
          >
            Suivant
          </button>
        </div>
      ) : null}
    </section>
  );
}
