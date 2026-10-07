'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceSite, SiteAttendanceSettings, WorkDay } from '@/lib/api';
import { getClientErrorMessage } from '@/lib/client-error';

type Choice = 'inherit' | 'required' | 'not-required';
const choiceFromValue = (value: boolean | null): Choice =>
  value === null ? 'inherit' : value ? 'required' : 'not-required';
const valueFromChoice = (value: Choice) =>
  value === 'inherit' ? null : value === 'required';
const workDayOptions: { value: WorkDay; label: string }[] = [
  { value: 'MONDAY', label: 'Lundi' }, { value: 'TUESDAY', label: 'Mardi' },
  { value: 'WEDNESDAY', label: 'Mercredi' }, { value: 'THURSDAY', label: 'Jeudi' },
  { value: 'FRIDAY', label: 'Vendredi' }, { value: 'SATURDAY', label: 'Samedi' },
  { value: 'SUNDAY', label: 'Dimanche' },
];

export function SiteAttendanceSettingsPanel({ sites, initialSiteId }: { sites: AttendanceSite[]; initialSiteId?: string }) {
  const activeSites = sites.filter((site) => site.isActive);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const siteId = initialSiteId ?? selectedSiteId;
  const [settings, setSettings] = useState<SiteAttendanceSettings | null>(null);
  const [gps, setGps] = useState<Choice>('inherit');
  const [selfie, setSelfie] = useState<Choice>('inherit');
  const [lateness, setLateness] = useState('');
  const [workDaysOverride, setWorkDaysOverride] = useState(false);
  const [workDays, setWorkDays] = useState<WorkDay[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSettings(null);
    setFeedback(null);
    setGps('inherit');
    setSelfie('inherit');
    setLateness('');
    setWorkDaysOverride(false);
    setWorkDays([]);
    if (!siteId) return;
    let cancelled = false;
    fetch(`/api/attendance-sites/${siteId}/settings`, { cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => {
        if (cancelled) return;
        if (!response.ok) {
          setSettings(null);
          setFeedback(getClientErrorMessage(data, 'Impossible de charger les réglages du site.'));
          return;
        }
        const next = data as SiteAttendanceSettings;
        setSettings(next);
        setGps(choiceFromValue(next.gpsRequired));
        setSelfie(choiceFromValue(next.selfieRequired));
        setLateness(next.defaultLatenessMarginMinutes === null ? '' : String(next.defaultLatenessMarginMinutes));
        setWorkDaysOverride(next.defaultWorkDays !== null);
        setWorkDays(next.defaultWorkDays ?? []);
      })
      .catch(() => !cancelled && setFeedback('Le serveur est momentanément indisponible.'));
    return () => { cancelled = true; };
  }, [siteId]);

  async function save() {
    if (!siteId) return;
    const margin = lateness.trim() === '' ? null : Number(lateness);
    if (margin !== null && (!Number.isInteger(margin) || margin < 0 || margin > 1440)) {
      setFeedback('La marge doit être un entier entre 0 et 1 440 minutes.');
      return;
    }
    setSaving(true); setFeedback(null);
    try {
      const response = await fetch(`/api/attendance-sites/${siteId}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpsRequired: valueFromChoice(gps), selfieRequired: valueFromChoice(selfie), defaultLatenessMarginMinutes: margin, defaultWorkDays: workDaysOverride ? workDays : null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setFeedback(getClientErrorMessage(data, 'Impossible de mettre à jour les réglages du site.')); return; }
      setSettings(data as SiteAttendanceSettings); setFeedback('Réglages du site enregistrés.');
    } catch { setFeedback('Le serveur est momentanément indisponible.'); }
    finally { setSaving(false); }
  }

  return (
    <Card className="mt-5 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
      <CardHeader className="border-b border-slate-200/70">
        <CardTitle>Réglages de pointage par site</CardTitle>
        <p className="text-sm font-medium text-slate-600">Les valeurs « Hériter » conservent la politique de l’organisation.</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        {initialSiteId ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold">Site : {sites.find((site) => site.id === initialSiteId)?.name ?? 'Site sélectionné'}</p> : <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" disabled={saving} onChange={(event) => setSelectedSiteId(event.target.value)} value={siteId}>
          <option value="">Sélectionner un site actif</option>
          {activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>}
        {siteId ? <>
          <label className="block text-sm font-semibold text-slate-700">GPS
            <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3" onChange={(event) => setGps(event.target.value as Choice)} value={gps}>
              <option value="inherit">Hériter</option><option value="required">Requis</option><option value="not-required">Non requis</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Selfie
            <select className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3" onChange={(event) => setSelfie(event.target.value as Choice)} value={selfie}>
              <option value="inherit">Hériter</option><option value="required">Requis</option><option value="not-required">Non requis</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Marge par défaut (minutes)
            <input className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3" inputMode="numeric" min="0" max="1440" onChange={(event) => setLateness(event.target.value)} type="number" value={lateness} />
          </label>
          <fieldset className="rounded-xl border p-3"><legend className="px-1 text-sm font-semibold text-slate-700">Jours travaillés</legend>
            <label className="flex items-center gap-2 text-sm"><input checked={!workDaysOverride} onChange={() => setWorkDaysOverride(false)} type="radio" name={`workdays-${siteId}`} />Hériter de l’organisation</label>
            <label className="mt-2 flex items-center gap-2 text-sm"><input checked={workDaysOverride} onChange={() => setWorkDaysOverride(true)} type="radio" name={`workdays-${siteId}`} />Définir pour ce site</label>
            {workDaysOverride ? <div className="mt-2 grid grid-cols-2 gap-2">{workDayOptions.map((day) => <label className="flex items-center gap-2 text-sm" key={day.value}><input checked={workDays.includes(day.value)} onChange={(event) => setWorkDays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} type="checkbox" />{day.label}</label>)}</div> : null}
            {workDaysOverride && workDays.length === 0 ? <p className="mt-2 text-xs text-amber-800">Sélectionnez au moins un jour travaillé.</p> : null}
          </fieldset>
          {feedback ? <p className="text-sm font-semibold text-slate-600" role="status">{feedback}</p> : null}
          <Button className="w-full" disabled={saving || !settings || (workDaysOverride && workDays.length === 0)} onClick={save} type="button">{saving ? 'Enregistrement...' : 'Enregistrer les réglages'}</Button>
        </> : null}
      </CardContent>
    </Card>
  );
}
