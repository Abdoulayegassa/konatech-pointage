'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';
import type { SiteAttendanceReport } from '@/lib/api';

type Mode = 'monthly' | 'custom';
function monthParts(timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return { year: parts.find((part) => part.type === 'year')?.value ?? '2026', month: parts.find((part) => part.type === 'month')?.value ?? '1' };
}
function datePart(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function filenameFrom(response: Response, fallback: string) { return response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback; }
function safeFilenamePart(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'; }
function isSiteAttendanceReport(value: unknown): value is SiteAttendanceReport {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !('scope' in value) || !('siteId' in value) || !('siteName' in value) ||
      !('organizationName' in value) || !('rows' in value) || !('period' in value)) return false;
  const period = value.period;
  return value.scope === 'SITE' && typeof value.siteId === 'string' &&
    typeof value.siteName === 'string' && typeof value.organizationName === 'string' &&
    Array.isArray(value.rows) && !!period && typeof period === 'object' &&
    'startDate' in period && typeof period.startDate === 'string' &&
    'endDate' in period && typeof period.endDate === 'string';
}

export function SiteReportWorkspace({ siteId, siteName, organizationName, timeZone }: {
  siteId: string; siteName: string; organizationName: string; timeZone?: string;
}) {
  const current = monthParts(timeZone);
  const [mode, setMode] = useState<Mode>('monthly');
  const [month, setMonth] = useState(current.month);
  const [year, setYear] = useState(current.year);
  const [startDate, setStartDate] = useState(() => datePart(new Date(Date.UTC(Number(current.year), Number(current.month) - 1, 1))));
  const [endDate, setEndDate] = useState(() => datePart(new Date(Date.UTC(Number(current.year), Number(current.month), 0))));
  const [report, setReport] = useState<SiteAttendanceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function query(format?: 'csv' | 'pdf') {
    const params = new URLSearchParams({ mode });
    if (mode === 'monthly') { params.set('month', month); params.set('year', year); }
    else { params.set('startDate', startDate); params.set('endDate', endDate); }
    if (format) params.set('format', format);
    return params;
  }

  async function loadReport() {
    setBusy(true); setError(null); setReport(null);
    try {
      const response = await fetch(`/api/attendance-sites/${encodeURIComponent(siteId)}/reports?${query()}`, { cache: 'no-store' });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getClientErrorMessage(payload, 'Impossible de charger le rapport du site.'));
      if (!isSiteAttendanceReport(payload)) throw new Error('Le serveur a retourné un rapport incomplet ou dont le périmètre est invalide.');
      const data = payload;
      if (data.siteId !== siteId) throw new Error('Le serveur a retourné un rapport dont le périmètre ne correspond pas au site demandé.');
      setReport(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Impossible de charger le rapport du site.'); }
    finally { setBusy(false); }
  }

  async function download(format: 'csv' | 'pdf') {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/attendance-sites/${encodeURIComponent(siteId)}/reports/export?${query(format)}`, { cache: 'no-store' });
      if (!response.ok) { const payload: unknown = await response.json().catch(() => ({})); throw new Error(getClientErrorMessage(payload, `Impossible de télécharger le ${format.toUpperCase()}.`)); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = filenameFrom(response, `rapport-${safeFilenamePart(siteName)}-${format}`); document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Échec du téléchargement.'); }
    finally { setBusy(false); }
  }

  return <main className="space-y-5"><header><p className="text-xs font-black uppercase tracking-wider text-slate-500">{organizationName} · Périmètre SITE</p><h2 className="text-2xl font-black">Rapport — {siteName}</h2><p className="text-sm text-slate-600">Les périodes, calculs et exports sont résolus par le backend.</p></header>
    <Card><CardHeader><CardTitle>Période du rapport</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-3" role="group" aria-label="Type de période"><label className="flex items-center gap-2"><input checked={mode === 'monthly'} onChange={() => setMode('monthly')} type="radio" name="report-mode" />Mensuelle</label><label className="flex items-center gap-2"><input checked={mode === 'custom'} onChange={() => setMode('custom')} type="radio" name="report-mode" />Personnalisée</label></div>
      {mode === 'monthly' ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Mois<input aria-label="Mois" className="mt-1 block h-11 w-full rounded-xl border px-3" max="12" min="1" onChange={(event) => setMonth(event.target.value)} type="number" value={month} /></label><label className="text-sm font-semibold">Année<input aria-label="Année" className="mt-1 block h-11 w-full rounded-xl border px-3" max="2100" min="2000" onChange={(event) => setYear(event.target.value)} type="number" value={year} /></label></div> : <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Début<input className="mt-1 block h-11 w-full rounded-xl border px-3" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></label><label className="text-sm font-semibold">Fin<input className="mt-1 block h-11 w-full rounded-xl border px-3" onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></label></div>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || (mode === 'custom' && (!startDate || !endDate || endDate < startDate))} onClick={loadReport} type="button">{busy ? 'Chargement…' : 'Afficher le rapport'}</Button><Button disabled={busy || (mode === 'custom' && (!startDate || !endDate || endDate < startDate))} onClick={() => void download('csv')} type="button" variant="secondary">Télécharger CSV</Button><Button disabled={busy || (mode === 'custom' && (!startDate || !endDate || endDate < startDate))} onClick={() => void download('pdf')} type="button" variant="secondary">Télécharger PDF</Button></div>
      {error ? <p className="text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
    </CardContent></Card>
    {report ? <Card><CardHeader><CardTitle>{report.organizationName} · {report.siteName} · {report.periodLabel}</CardTitle><p className="text-xs text-slate-500">Du {report.period.startDate} au {report.period.endDate} · {report.scope}</p></CardHeader><CardContent>{report.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{['Employé', 'Présences', 'Absences', 'Retards', 'Départs anticipés', 'Heures travaillées'].map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{report.rows.map((row) => <tr className="border-t" key={row.employeeIdentifier}><td className="p-2">{row.fullName}<span className="block text-xs text-slate-500">{row.employeeIdentifier}</span></td><td className="p-2">{row.presenceDays}</td><td className="p-2">{row.absentDays}</td><td className="p-2">{row.lateDays}</td><td className="p-2">{row.earlyExitDays}</td><td className="p-2">{row.totalWorkedHours}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-600">Aucune donnée pour cette période.</p>}</CardContent></Card> : null}
  </main>;
}
