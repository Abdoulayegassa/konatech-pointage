'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  employee: string;
  department: string;
  status: string[];
};

export const defaultAttendanceHistoryFilters: FilterState = {
  period: 'this-month',
  employee: '',
  department: '',
  status: [],
};

const periodOptions = [
  { label: "Aujourd'hui", value: 'today' },
  { label: 'Cette semaine', value: 'this-week' },
  { label: 'Ce mois', value: 'this-month' },
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
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-900 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition duration-200 placeholder:text-slate-400 focus:border-accent/40 focus:ring-4 focus:ring-accent/10';

const labelClassName =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';

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

  const selectedStatusCount = appliedFilters.status.length;

  return (
    <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="outline">Historique RH</Badge>
            <CardTitle className="mt-2 text-xl text-slate-950">
              Filtres de recherche
            </CardTitle>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Affinez l'historique des pointages selon vos critères.
            </p>
          </div>
          <span className="w-fit rounded-full border border-success/15 bg-success/10 px-3 py-1 text-sm font-bold text-success">
            {selectedStatusCount} statut(s)
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-4">
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
            <span className={labelClassName}>Employé</span>
            <input
              className={inputClassName}
              list="attendance-history-employees"
              onChange={(event) =>
                updateFilter('employee', event.target.value)
              }
              placeholder="Tous les employés"
              value={filters.employee}
            />
            <datalist id="attendance-history-employees">
              {employeeOptions.map((employee) => (
                <option key={employee.value} value={employee.label} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className={labelClassName}>Département</span>
            <select
              className={cn(inputClassName, 'appearance-none')}
              onChange={(event) =>
                updateFilter('department', event.target.value)
              }
              value={filters.department}
            >
              <option value="">Tous les départements</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className={labelClassName}>Statut</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {statusOptions.map((status) => {
                const isSelected = filters.status.includes(status.value);

                return (
                  <label
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2 text-sm font-bold transition duration-200',
                      isSelected
                        ? 'border-accent/20 bg-accent/10 text-slate-950'
                        : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:border-accent/20 hover:bg-white',
                    )}
                    key={status.value}
                  >
                    <input
                      checked={isSelected}
                      className="h-4 w-4 accent-[hsl(var(--accent))]"
                      onChange={() =>
                        updateFilter(
                          'status',
                          toggleStatus(filters.status, status.value),
                        )
                      }
                      type="checkbox"
                    />
                    <span>{status.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-slate-50/85 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950">Recherche RH</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">
              Appliquez les filtres pour mettre à jour le résumé et la table.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={resetFilters} type="button" variant="secondary">
              Réinitialiser
            </Button>
            <Button
              className="bg-success text-white hover:bg-success/95"
              onClick={applyFilters}
              type="button"
            >
              Appliquer les filtres
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
