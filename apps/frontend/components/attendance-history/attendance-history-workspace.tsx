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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceRecord, EmployeeRecord } from '@/lib/api';
import { cn } from '@/lib/utils';

type AttendanceHistoryWorkspaceProps = {
  departments: string[];
  employees: EmployeeRecord[];
  records: AttendanceRecord[];
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
    <div className={cn('rounded-[22px] border p-4 shadow-sm', className)}>
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
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
    <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="outline">Historique RH</Badge>
            <CardTitle className="mt-2 text-xl text-slate-950">
              Résumé de la période
            </CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Vue synthétique des pointages affichés avec les filtres actifs.
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-600 shadow-sm">
            {records.length} pointage(s)
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
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
  records,
}: AttendanceHistoryWorkspaceProps) {
  const [filters, setFilters] = useState<FilterState>(
    defaultAttendanceHistoryFilters,
  );
  const filteredRecords = useMemo(
    () => filterAttendanceHistoryRecords(records, filters),
    [filters, records],
  );

  return (
    <section className="admin-reveal admin-reveal-delay-1 grid gap-4">
      <AttendanceHistoryFilters
        departments={departments}
        employees={employees}
        filters={filters}
        onApply={setFilters}
      />

      <AttendancePeriodSummary records={filteredRecords} />

      <AttendanceHistoryTable filters={filters} records={records} />
    </section>
  );
}
