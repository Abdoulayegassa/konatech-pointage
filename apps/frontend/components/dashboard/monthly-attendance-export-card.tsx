'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';

const monthOptions = [
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Décembre' },
] as const;

const inputClassName =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition duration-300 placeholder:text-slate-400 focus:border-accent/40 focus:ring-4 focus:ring-accent/10';

const labelClassName =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';

type ExportEmployeeOption = {
  id: string;
  employeeIdentifier: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
};

type ReportMode = 'monthly' | 'custom';

function getDefaultMonthYear() {
  const now = new Date();

  return {
    month: String(now.getUTCMonth() + 1),
    year: String(now.getUTCFullYear()),
  };
}

function getFileName(
  contentDisposition: string | null,
  fallbackFileName: string,
) {
  if (!contentDisposition) {
    return fallbackFileName;
  }

  const match = contentDisposition.match(/filename="?(?<name>[^"]+)"?/i);

  return match?.groups?.name ?? fallbackFileName;
}

function normalizeDownloadSegment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDateInputValue(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function getDefaultCustomPeriod() {
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  return {
    startDate: formatDateInputValue(startDate),
    endDate: formatDateInputValue(endDate),
  };
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split('-');

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function MonthlyAttendanceExportCard() {
  // Monthly HR PDF source of truth is the backend premium renderer.
  // This component only selects filters and downloads the generated file.
  const defaults = getDefaultMonthYear();
  const customDefaults = getDefaultCustomPeriod();
  const [mode, setMode] = useState<ReportMode>('monthly');
  const [month, setMonth] = useState(defaults.month);
  const [year, setYear] = useState(defaults.year);
  const [startDate, setStartDate] = useState(customDefaults.startDate);
  const [endDate, setEndDate] = useState(customDefaults.endDate);
  const [employeeId, setEmployeeId] = useState('all');
  const [employees, setEmployees] = useState<ExportEmployeeOption[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadEmployees() {
      const response = await fetch('/api/employees', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ExportEmployeeOption[];

      if (!ignore) {
        setEmployees(payload.filter((employee) => employee.isActive));
      }
    }

    void loadEmployees();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsExporting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const searchParams = new URLSearchParams({
        format: 'pdf',
      });

      let fallbackPeriodLabel = '';
      let selectedPeriodLabel = '';

      if (mode === 'custom') {
        const startValue = startDate.trim();
        const endValue = endDate.trim();

        if (!startValue || !endValue) {
          setError('Saisissez une date de début et une date de fin.');
          return;
        }

        const start = new Date(`${startValue}T00:00:00.000Z`);
        const end = new Date(`${endValue}T00:00:00.000Z`);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          setError('Saisissez une période personnalisée valide.');
          return;
        }

        if (end < start) {
          setError('La date de fin doit être postérieure à la date de début.');
          return;
        }

        searchParams.set('mode', 'custom');
        searchParams.set('startDate', startValue);
        searchParams.set('endDate', endValue);
        fallbackPeriodLabel = `Du ${formatDisplayDate(startValue)} au ${formatDisplayDate(endValue)}`;
        selectedPeriodLabel = `Du ${formatDisplayDate(startValue)} au ${formatDisplayDate(endValue)}`;
      } else {
        const monthValue = Number(month);
        const yearValue = Number(year);

        if (
          !Number.isInteger(monthValue) ||
          monthValue < 1 ||
          monthValue > 12
        ) {
          setError('Sélectionnez un mois valide.');
          return;
        }

        if (
          !Number.isInteger(yearValue) ||
          yearValue < 2000 ||
          yearValue > 2100
        ) {
          setError('Saisissez une année valide entre 2000 et 2100.');
          return;
        }

        searchParams.set('month', String(monthValue));
        searchParams.set('year', String(yearValue));
        const monthLabel =
          monthOptions.find((option) => option.value === monthValue)?.label ??
          'Mois';
        fallbackPeriodLabel = `${monthLabel} ${yearValue}`;
        selectedPeriodLabel = fallbackPeriodLabel;
      }

      if (employeeId !== 'all') {
        searchParams.set('employeeId', employeeId);
      }

      const response = await fetch(
        `/api/attendance/exports/monthly?${searchParams.toString()}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as
          | { error?: string }
          | unknown;

        setError(
          getClientErrorMessage(
            payload,
            'Impossible de générer le rapport.',
          ),
        );
        return;
      }

      const exportBlob = await response.blob();
      const selectedEmployee = employees.find(
        (employee) => employee.id === employeeId,
      );
      const scopeLabel =
        employeeId === 'all'
          ? 'equipe'
          : selectedEmployee
            ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
            : 'employe';
      const fallbackFileName = `rapport-presence-${normalizeDownloadSegment(scopeLabel)}-${normalizeDownloadSegment(fallbackPeriodLabel)}.pdf`;
      const fileName = getFileName(
        response.headers.get('content-disposition'),
        fallbackFileName,
      );
      const downloadUrl = window.URL.createObjectURL(exportBlob);
      const downloadLink = document.createElement('a');

      downloadLink.href = downloadUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(downloadUrl);

      const employeeScope = selectedEmployee
        ? ` - ${selectedEmployee.firstName} ${selectedEmployee.lastName}`
        : '';
      setSuccessMessage(
        `Rapport PDF téléchargé pour ${selectedPeriodLabel}${employeeScope}.`,
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-3 border-b border-slate-200/70 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">
                {mode === 'custom' ? 'Export personnalisé' : 'Export mensuel'}
              </Badge>
              <Badge variant="success">PDF</Badge>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl">
                {mode === 'custom'
                  ? 'Rapport RH personnalisé'
                  : 'Rapport mensuel RH'}
              </CardTitle>
              <p className="max-w-xl text-sm leading-5 text-slate-600">
                {mode === 'custom'
                  ? 'Export PDF sur une période libre, par équipe ou par employé.'
                  : 'Export PDF par équipe ou par employé.'}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-3 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-sm font-medium text-accent">
              Téléchargement immédiat
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {error ? (
          <div className="rounded-[20px] border border-accent/15 bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-[20px] border border-success/15 bg-success/10 px-4 py-3 text-sm font-medium text-success">
            {successMessage}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="grid gap-4">
                <label className="block">
                  <span className={labelClassName}>Mode de période</span>
                  <select
                    className={inputClassName}
                    onChange={(event) =>
                      setMode(event.target.value === 'custom' ? 'custom' : 'monthly')
                    }
                    value={mode}
                  >
                    <option value="monthly">Mensuel</option>
                    <option value="custom">Période personnalisée</option>
                  </select>
                </label>

                {mode === 'monthly' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClassName}>Mois</span>
                      <select
                        className={inputClassName}
                        onChange={(event) => setMonth(event.target.value)}
                        value={month}
                      >
                        {monthOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className={labelClassName}>Année</span>
                      <input
                        className={inputClassName}
                        inputMode="numeric"
                        max={2100}
                        min={2000}
                        onChange={(event) => setYear(event.target.value)}
                        type="number"
                        value={year}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClassName}>Date de début</span>
                      <input
                        className={inputClassName}
                        onChange={(event) => setStartDate(event.target.value)}
                        type="date"
                        value={startDate}
                      />
                    </label>

                    <label className="block">
                      <span className={labelClassName}>Date de fin</span>
                      <input
                        className={inputClassName}
                        onChange={(event) => setEndDate(event.target.value)}
                        type="date"
                        value={endDate}
                      />
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className={labelClassName}>Périmètre</span>
                  <select
                    className={inputClassName}
                    onChange={(event) => setEmployeeId(event.target.value)}
                    value={employeeId}
                  >
                    <option value="all">Toute l'équipe</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName} -{' '}
                        {employee.employeeIdentifier}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 rounded-[22px] border border-accent/15 bg-accent/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">
                      {mode === 'custom'
                        ? 'Synthèse RH personnalisée'
                        : 'Synthèse RH mensuelle'}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">
                      {mode === 'custom'
                        ? "Période libre, absences et commentaires recalculés sur l'intervalle choisi."
                        : 'Présences, retards, absences, heures et plannings.'}
                    </p>
                  </div>
                  <Badge variant="success">PDF</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[22px] border border-slate-200 bg-slate-50/85 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Action d'export
              </p>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Génération avec les filtres choisis.
              </p>
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={isExporting}
              type="submit"
            >
              {isExporting ? 'Génération...' : 'Télécharger le rapport'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
