'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CalendarEntryRecord, CalendarMonthResponse } from '@/lib/api';

type SiteCalendarData = CalendarMonthResponse & {
  site: { id: string; name: string; isActive: boolean };
};

export function SiteCalendarWorkspace({ siteId, initialData }: { siteId: string; initialData: SiteCalendarData }) {
  const [data, setData] = useState(initialData);
  const [month, setMonth] = useState(initialData.month);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CalendarEntryRecord | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(`${initialData.month}-01`);
  const [type, setType] = useState<'PUBLIC_HOLIDAY' | 'COMPANY_HOLIDAY'>('COMPANY_HOLIDAY');
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);

  useEffect(() => {
    setData(initialData);
    setMonth(initialData.month);
  }, [initialData]);

  async function loadMonth(nextMonth: string) {
    setMonth(nextMonth);
    setLoading(true);
    try {
      const response = await fetch(`/api/attendance-sites/${encodeURIComponent(siteId)}/calendar?month=${encodeURIComponent(nextMonth)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Impossible de charger le calendrier du site.');
      setData(payload as SiteCalendarData);
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : 'Impossible de charger le calendrier du site.' });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(entry: CalendarEntryRecord) {
    if (entry.scope !== 'SITE' || entry.inherited) return;
    setEditing(entry);
    setName(entry.name);
    setDate(entry.date.slice(0, 10));
    setType(entry.type === 'PUBLIC_HOLIDAY' ? 'PUBLIC_HOLIDAY' : 'COMPANY_HOLIDAY');
    setFeedback(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/attendance-sites/${encodeURIComponent(siteId)}/calendar/holidays${editing ? `/${encodeURIComponent(editing.id)}` : ''}`,
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), date: new Date(`${date}T00:00:00.000Z`).toISOString(), type }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Impossible d’enregistrer le jour du site.');
      const successMessage = editing ? 'Événement du site mis à jour.' : 'Événement du site créé.';
      setEditing(null);
      setName('');
      await loadMonth(month);
      setFeedback({ success: successMessage });
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : 'Impossible d’enregistrer le jour du site.' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: CalendarEntryRecord) {
    if (entry.scope !== 'SITE' || entry.inherited || !window.confirm(`Supprimer « ${entry.name} » ?`)) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/attendance-sites/${encodeURIComponent(siteId)}/calendar/holidays/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Impossible de supprimer l’événement du site.');
      await loadMonth(month);
      setFeedback({ success: 'Événement du site supprimé.' });
    } catch (error) {
      setFeedback({ error: error instanceof Error ? error.message : 'Impossible de supprimer l’événement du site.' });
    } finally {
      setSaving(false);
    }
  }

  const inherited = data.entries.filter((entry) => entry.inherited);
  const local = data.entries.filter((entry) => !entry.inherited);
  const renderEntry = (entry: CalendarEntryRecord, editable: boolean) => (
    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3">
      <div><p className="font-bold text-slate-900">{entry.name}</p><p className="text-sm text-slate-600">{new Date(entry.date).toLocaleDateString('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })} · {entry.type === 'PUBLIC_HOLIDAY' ? 'Jour férié public' : 'Fermeture'}</p></div>
      {editable ? <div className="flex gap-2"><button className="text-sm font-semibold text-primary underline" onClick={() => startEdit(entry)} type="button">Modifier</button><button className="text-sm font-semibold text-red-700 underline" disabled={saving} onClick={() => void remove(entry)} type="button">Supprimer</button></div> : <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">Organisation · hérité</span>}
    </li>
  );

  return <section className="space-y-5 rounded-3xl border bg-slate-50 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-accent">Site actif</p><h2 className="text-2xl font-black">Calendrier — {data.site.name}</h2></div><label className="text-sm font-semibold">Mois <input aria-label="Mois" className="ml-2 rounded-lg border bg-white p-2" onChange={(event) => void loadMonth(event.target.value)} type="month" value={month} /></label></header>
    {!data.site.isActive && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Site inactif : consultation seulement.</p>}
    {feedback?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{feedback.error}</p>}
    {feedback?.success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{feedback.success}</p>}
    {loading ? <p role="status" className="p-4 text-sm font-semibold">Chargement du calendrier…</p> : <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-3"><h3 className="font-black">Événements de l’organisation</h3><p className="text-sm text-slate-600">Ces jours s’appliquent à tous les sites et sont en lecture seule ici.</p>{inherited.length ? <ul className="space-y-2">{inherited.map((entry) => renderEntry(entry, false))}</ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">Aucun événement d’organisation ce mois-ci.</p>}</section>
      <section className="space-y-3"><h3 className="font-black">Événements de {data.site.name}</h3>{local.length ? <ul className="space-y-2">{local.map((entry) => renderEntry(entry, true))}</ul> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-600">Aucun événement local ce mois-ci.</p>}
        {data.site.isActive && <form className="space-y-3 rounded-2xl border bg-white p-4" onSubmit={(event) => void save(event)}><h4 className="font-bold">{editing ? 'Modifier l’événement local' : 'Ajouter une fermeture locale'}</h4><label className="block text-sm font-semibold">Nom<input className="mt-1 block w-full rounded-lg border p-2" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label><label className="block text-sm font-semibold">Date<input className="mt-1 block w-full rounded-lg border p-2" onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></label><label className="block text-sm font-semibold">Type<select className="mt-1 block w-full rounded-lg border p-2" onChange={(event) => setType(event.target.value as typeof type)} value={type}><option value="COMPANY_HOLIDAY">Fermeture du site</option><option value="PUBLIC_HOLIDAY">Jour férié public</option></select></label><div className="flex gap-3"><button className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button className="rounded-lg border px-4 py-2 font-semibold" onClick={() => { setEditing(null); setName(''); }} type="button">Annuler</button>}</div></form>}
      </section>
    </div>}
  </section>;
}
