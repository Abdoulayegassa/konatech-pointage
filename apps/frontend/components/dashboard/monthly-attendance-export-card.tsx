'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';

const monthOptions = [
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Fevrier' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Aout' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Decembre' },
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
};

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

export function MonthlyAttendanceExportCard() {
  const defaults = getDefaultMonthYear();
  const [month, setMonth] = useState(defaults.month);
  const [year, setYear] = useState(defaults.year);
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
        setEmployees(payload);
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
      const monthValue = Number(month);
      const yearValue = Number(year);

      if (!Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
        setError('Selectionnez un mois valide.');
        return;
      }

      if (
        !Number.isInteger(yearValue) ||
        yearValue < 2000 ||
        yearValue > 2100
      ) {
        setError('Saisissez une annee valide entre 2000 et 2100.');
        return;
      }

      const searchParams = new URLSearchParams({
        month: String(monthValue),
        year: String(yearValue),
        format: 'pdf',
      });

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
            "Impossible de generer l'export mensuel.",
          ),
        );
        return;
      }

      const exportBlob = await response.blob();
      const selectedMonth =
        monthOptions.find((option) => option.value === monthValue)?.label ??
        'Mois';
      const selectedEmployee = employees.find(
        (employee) => employee.id === employeeId,
      );
      const scopeLabel =
        employeeId === 'all'
          ? 'equipe'
          : selectedEmployee
            ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
            : 'employe';
      const fallbackFileName = `rapport-presence-${normalizeDownloadSegment(scopeLabel)}-${normalizeDownloadSegment(selectedMonth)}-${yearValue}.pdf`;
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
        `Rapport PDF telecharge pour ${selectedMonth} ${yearValue}${employeeScope}.`,
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">Export mensuel</Badge>
              <Badge variant="success">PDF</Badge>
            </div>
            <div className="space-y-1">
              <CardTitle>Exporter le rapport mensuel</CardTitle>
              <p className="max-w-xl text-sm leading-5 text-slate-600">
                PDF par equipe ou par employe.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-3 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-sm font-medium text-accent">
              Telechargement immediat
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Periode
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-600">Mois et annee.</p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Perimetre
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-600">
              Equipe ou employe.
            </p>
          </div>
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/85 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Format
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-600">PDF pret a partager.</p>
          </div>
        </div>

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

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4">
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
                  <span className={labelClassName}>Annee</span>
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

              <label className="mt-4 block">
                <span className={labelClassName}>Perimetre</span>
                <select
                  className={inputClassName}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  value={employeeId}
                >
                  <option value="all">Toute l equipe</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName} -{' '}
                      {employee.employeeIdentifier}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-[24px] border border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.92))] p-4">
              <div className="space-y-4">
                <div>
                  <p className={labelClassName}>Format actif</p>
                  <div className="mt-2 rounded-[22px] border border-white/70 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          Rapport PDF premium
                        </p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          PDF direct dans cette vue.
                        </p>
                      </div>
                      <Badge variant="success">PDF</Badge>
                    </div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/70 bg-white/85 p-4 text-sm leading-5 text-slate-600">
                  Presences, retards, absences, heures et plannings inchanges.
                </div>

                <div className="rounded-[20px] border border-accent/15 bg-accent/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                    Resultat
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-700">
                    Telechargement immediat avec nom de fichier lisible.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50/85 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Action d export</p>
              <p className="mt-1 text-sm leading-5 text-slate-600">
                Generation avec les filtres choisis.
              </p>
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={isExporting}
              type="submit"
            >
              {isExporting ? 'Generation...' : 'Telecharger le rapport PDF'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
