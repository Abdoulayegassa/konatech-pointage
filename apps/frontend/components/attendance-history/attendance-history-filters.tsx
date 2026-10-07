'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type EmployeeFilterOption = {
  id: string;
  employeeIdentifier: string;
  firstName: string;
  lastName: string;
  department: string | null;
};

type AttendanceHistoryFiltersProps = {
  departments: string[];
  employees: EmployeeFilterOption[];
  filters: FilterState;
  onApply: (filters: FilterState) => void;
};

export type FilterState = {
  period: string;
  startDate: string;
  endDate: string;
  employee: string;
  department: string;
  status: string[];
  query: string;
};

export const defaultAttendanceHistoryFilters: FilterState = {
  period: 'this-month',
  startDate: '',
  endDate: '',
  employee: '',
  department: '',
  status: [],
  query: '',
};

const periodOptions = [
  { label: "Aujourd'hui", value: 'today' },
  { label: 'Cette semaine', value: 'this-week' },
  { label: 'Ce mois', value: 'this-month' },
  { label: 'Période personnalisée', value: 'custom' },
];

const statusOptions = [
  { label: 'Présent', value: 'present' },
  { label: 'Retard', value: 'late' },
  { label: 'Absent', value: 'absent' },
  { label: 'Travail jour non ouvré', value: 'non-working-day-work' },
  { label: 'Départ anticipé', value: 'early-exit' },
  { label: 'Heures supplémentaires', value: 'overtime' },
  { label: 'Pointage incomplet', value: 'incomplete' },
];

const inputClassName =
  'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10 placeholder:text-slate-400';

const labelClassName =
  'text-xs font-medium text-slate-600';

function toggleStatus(currentStatuses: string[], nextStatus: string) {
  if (currentStatuses.includes(nextStatus)) {
    return currentStatuses.filter((status) => status !== nextStatus);
  }

  return [...currentStatuses, nextStatus];
}

export function AttendanceHistoryFilters({
  departments,
  employees,
  filters: appliedFilters,
  onApply,
}: AttendanceHistoryFiltersProps) {
  const [filters, setFilters] = useState<FilterState>(appliedFilters);
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        label: `${employee.firstName} ${employee.lastName} - ${employee.employeeIdentifier}`,
        value: employee.id,
      })),
    [employees],
  );

  function updateFilter<Key extends keyof FilterState>(
    key: Key,
    value: FilterState[Key],
  ) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [key]: value,
    }));
  }

  function applyFilters() {
    onApply(filters);
  }

  function resetFilters() {
    setFilters(defaultAttendanceHistoryFilters);
    onApply(defaultAttendanceHistoryFilters);
  }

  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-none">
      <CardContent className="space-y-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className={labelClassName}>Période</span>
            <select
              className={cn(inputClassName, 'appearance-none')}
              onChange={(event) => updateFilter('period', event.target.value)}
              value={filters.period}
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClassName}>Recherche employé</span>
            <input aria-label="Rechercher dans les pointages" className={inputClassName} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Nom, email ou identifiant" type="search" value={filters.query} />
          </label>

          {filters.period === 'custom' ? (
            <>
              <label className="block">
                <span className={labelClassName}>Du</span>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateFilter('startDate', event.target.value)
                  }
                  type="date"
                  value={filters.startDate}
                />
              </label>
              <label className="block">
                <span className={labelClassName}>Au</span>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateFilter('endDate', event.target.value)
                  }
                  type="date"
                  value={filters.endDate}
                />
              </label>
            </>
          ) : null}

          <label className="block">
            <span className={labelClassName}>Employé</span>
            <select
              className={cn(inputClassName, 'appearance-none')}
              onChange={(event) => updateFilter('employee', event.target.value)}
              value={filters.employee}
            >
              <option value="">Tous les employés</option>
              {employeeOptions.map((employee) => (
                <option key={employee.value} value={employee.value}>
                  {employee.label}
                </option>
              ))}
            </select>
          </label>

        </div>

        <details className="rounded-lg border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Filtres avancés · Département et statut ({filters.status.length})</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
            <label className="block"><span className={labelClassName}>Département</span><select className={cn(inputClassName, 'appearance-none')} onChange={(event) => updateFilter('department', event.target.value)} value={filters.department}><option value="">Tous les départements</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            <fieldset><legend className={labelClassName}>Statut</legend><div className="mt-1 flex flex-wrap gap-2">{statusOptions.map((status) => { const isSelected = filters.status.includes(status.value); return <label className={cn('flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm', isSelected ? 'border-orange-200 bg-orange-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600')} key={status.value}><input checked={isSelected} className="h-4 w-4 accent-[hsl(var(--primary))]" onChange={() => updateFilter('status', toggleStatus(filters.status, status.value))} type="checkbox" /><span>{status.label}</span></label>; })}</div></fieldset>
          </div>
        </details>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={resetFilters} size="sm" type="button" variant="secondary">Réinitialiser</Button>
          <Button onClick={applyFilters} size="sm" type="button">Appliquer</Button>
        </div>
      </CardContent>
    </Card>
  );
}
