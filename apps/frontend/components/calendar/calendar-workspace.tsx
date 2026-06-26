'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  type CalendarDayRecord,
  type CalendarDayType,
  type CalendarEntryRecord,
  type CalendarEntryType,
  type CalendarMonthResponse,
  type CreateCalendarEntryPayload,
  type UpdateCalendarEntryPayload,
} from '@/lib/api';
import { getClientErrorMessage } from '@/lib/client-error';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDayBadge, calendarDayMeta } from './calendar-day-badge';
import { CalendarDayCell } from './calendar-day-cell';
import { CalendarDayDrawer } from './calendar-day-drawer';
import { CalendarLegend } from './calendar-legend';

type CalendarWorkspaceProps = {
  initialData: CalendarMonthResponse;
  month: string;
};

type ViewMode = 'month' | 'week';
type FormMode = 'create' | 'edit';
type FeedbackState =
  | {
      tone: 'success';
      message: string;
    }
  | {
      tone: 'error';
      message: string;
    }
  | null;

type CalendarFormValues = {
  name: string;
  date: string;
  description: string;
  type: Extract<CalendarEntryType, 'PUBLIC_HOLIDAY' | 'COMPANY_HOLIDAY'>;
};

const activeHolidayTypes: CalendarFormValues['type'][] = [
  'PUBLIC_HOLIDAY',
  'COMPANY_HOLIDAY',
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatEventDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function createEmptyForm(month: string): CalendarFormValues {
  return {
    name: '',
    date: `${month}-01`,
    description: '',
    type: 'PUBLIC_HOLIDAY',
  };
}

function normalizeEntryDate(value: string) {
  return new Date(value).toISOString();
}

function getDayType(date: string, entries: CalendarEntryRecord[]) {
  if (entries.some((entry) => entry.type === 'PUBLIC_HOLIDAY')) {
    return 'PUBLIC_HOLIDAY' as const;
  }

  if (entries.some((entry) => entry.type === 'COMPANY_HOLIDAY')) {
    return 'COMPANY_HOLIDAY' as const;
  }

  if (entries.some((entry) => entry.type === 'LEAVE')) {
    return 'LEAVE' as const;
  }

  if (entries.some((entry) => entry.type === 'EXTERNAL_MISSION')) {
    return 'EXTERNAL_MISSION' as const;
  }

  const weekday = new Date(date).getUTCDay();

  return weekday === 0 || weekday === 6
    ? ('WEEKEND' as const)
    : ('WORKING_DAY' as const);
}

function getDayLabel(type: CalendarDayType, entries: CalendarEntryRecord[]) {
  return entries[0]?.name || calendarDayMeta[type].label;
}

function rebuildCalendarDays(
  baseDays: CalendarDayRecord[],
  entries: CalendarEntryRecord[],
) {
  const entriesByDate = new Map<string, CalendarEntryRecord[]>();

  for (const entry of entries) {
    const key = normalizeEntryDate(entry.date);
    const bucket = entriesByDate.get(key) ?? [];

    bucket.push(entry);
    entriesByDate.set(key, bucket);
  }

  return baseDays.map((day) => {
    const dayEntries = entriesByDate.get(day.date) ?? [];
    const type = getDayType(day.date, dayEntries);

    return {
      ...day,
      type,
      label: getDayLabel(type, dayEntries),
      description: dayEntries[0]?.description ?? null,
      isNonWorkingDay: type !== 'WORKING_DAY',
      entries: dayEntries,
    };
  });
}

function buildSummary(days: CalendarDayRecord[]) {
  return days.reduce(
    (summary, day) => {
      if (day.type === 'WORKING_DAY') {
        summary.workingDays += 1;
      } else if (day.type === 'WEEKEND') {
        summary.weekends += 1;
      } else if (day.type === 'PUBLIC_HOLIDAY') {
        summary.publicHolidays += 1;
      } else if (day.type === 'COMPANY_HOLIDAY') {
        summary.companyHolidays += 1;
      }

      return summary;
    },
    {
      workingDays: 0,
      weekends: 0,
      publicHolidays: 0,
      companyHolidays: 0,
    },
  );
}

function groupWeeks(days: CalendarDayRecord[]) {
  const groups = new Map<string, CalendarDayRecord[]>();

  for (const day of days) {
    const bucket = groups.get(day.isoWeekLabel) ?? [];

    bucket.push(day);
    groups.set(day.isoWeekLabel, bucket);
  }

  return [...groups.entries()].map(([weekLabel, weekDays]) => ({
    weekLabel,
    weekDays,
  }));
}

export function CalendarWorkspace({
  initialData,
  month,
}: CalendarWorkspaceProps) {
  const [entries, setEntries] = useState(initialData.entries);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<CalendarFormValues>(
    createEmptyForm(month),
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<CalendarDayRecord | null>(
    null,
  );

  useEffect(() => {
    setEntries(initialData.entries);
    setFeedback(null);
    setFormMode('create');
    setEditingId(null);
    setFormValues(createEmptyForm(month));
    setViewMode('month');
    setIsDrawerOpen(false);
    setSelectedDay(null);
  }, [initialData.entries, month]);

  useEffect(() => {
    if (!isDrawerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDrawer();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  const calendarDays = useMemo(
    () => rebuildCalendarDays(initialData.days, entries),
    [entries, initialData.days],
  );
  const summary = useMemo(() => buildSummary(calendarDays), [calendarDays]);
  const activeEntries = useMemo(
    () =>
      entries
        .filter((entry) =>
          activeHolidayTypes.includes(entry.type as CalendarFormValues['type']),
        )
        .sort(
          (first, second) =>
            new Date(first.date).getTime() - new Date(second.date).getTime(),
        ),
    [entries],
  );
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    const todayKey = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    );

    return activeEntries
      .filter((entry) => new Date(entry.date).getTime() >= todayKey)
      .slice(0, 5);
  }, [activeEntries]);
  const weeks = useMemo(() => groupWeeks(calendarDays), [calendarDays]);
  const editingEntry = entries.find((entry) => entry.id === editingId) ?? null;

  function resetForm() {
    setFormMode('create');
    setEditingId(null);
    setFormValues(createEmptyForm(month));
    setFeedback(null);
  }

  function openCreateDrawer() {
    resetForm();
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    setIsDrawerOpen(false);
    resetForm();
  }

  function startEdit(entry: CalendarEntryRecord) {
    setFormMode('edit');
    setEditingId(entry.id);
    setFormValues({
      name: entry.name,
      date: entry.date.slice(0, 10),
      description: entry.description ?? '',
      type: entry.type as CalendarFormValues['type'],
    });
    setFeedback(null);
    setIsDrawerOpen(true);
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload: CreateCalendarEntryPayload | UpdateCalendarEntryPayload = {
        name: formValues.name.trim(),
        date: new Date(`${formValues.date}T00:00:00.000Z`).toISOString(),
        description: formValues.description.trim() || null,
        type: formValues.type,
      };

      const response = await fetch(
        formMode === 'create'
          ? '/api/calendar/holidays'
          : `/api/calendar/holidays/${editingId}`,
        {
          method: formMode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => ({}))) as
        | CalendarEntryRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            formMode === 'create'
              ? 'Impossible de créer le jour RH.'
              : 'Impossible de mettre à jour le jour RH.',
          ),
        });
        return;
      }

      const savedEntry = data as CalendarEntryRecord;

      setEntries((current) =>
        formMode === 'create'
          ? [...current, savedEntry]
          : current.map((entry) =>
              entry.id === savedEntry.id ? savedEntry : entry,
            ),
      );
      setFeedback({
        tone: 'success',
        message:
          formMode === 'create'
            ? 'Jour RH créé avec succès.'
            : 'Jour RH mis à jour avec succès.',
      });
      setIsDrawerOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteEntry(entry: CalendarEntryRecord) {
    const shouldDelete = window.confirm(
      `Supprimer ${entry.name} du ${formatDate(entry.date)} ?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/calendar/holidays/${entry.id}`, {
        method: 'DELETE',
      });
      const data = (await response.json().catch(() => ({}))) as
        | CalendarEntryRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            'Impossible de supprimer le jour RH.',
          ),
        });
        return;
      }

      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setFeedback({
        tone: 'success',
        message: 'Jour RH supprimé avec succès.',
      });

      if (editingId === entry.id) {
        closeDrawer();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)]">
      <Card className="min-w-0 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
        <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Badge variant="outline">Calendrier RH</Badge>
              <CardTitle className="mt-2 text-xl text-slate-950">
                {viewMode === 'month' ? 'Vue mensuelle' : 'Vue hebdomadaire'}
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                Les jours fériés publics et internes sont centralisés ici. Les
                congés et missions restent réservés aux prochains workflows RH.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="grid grid-cols-2 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                {(['month', 'week'] as const).map((mode) => (
                  <Button
                    key={mode}
                    className={cn(
                      'rounded-full px-3 py-2 text-xs sm:px-4 sm:text-sm',
                      viewMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-slate-600 shadow-none hover:bg-slate-50',
                    )}
                    onClick={() => setViewMode(mode)}
                    type="button"
                    variant="ghost"
                  >
                    {mode === 'month' ? 'Vue mensuelle' : 'Vue hebdomadaire'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Jours travaillés',
                value: summary.workingDays,
                className: 'border-success/20 bg-emerald-50 text-success',
              },
              {
                label: 'Week-ends',
                value: summary.weekends,
                className: 'border-slate-200 bg-slate-100 text-slate-700',
              },
              {
                label: 'Jours fériés publics',
                value: summary.publicHolidays,
                className: 'border-red-200 bg-red-50 text-red-700',
              },
              {
                label: 'Jours fériés entreprise',
                value: summary.companyHolidays,
                className: 'border-blue-200 bg-blue-50 text-blue-700',
              },
            ].map((item) => (
              <div
                className={cn('rounded-[22px] border p-4', item.className)}
                key={item.label}
              >
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-black">{item.value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Badge variant="outline">Prochains événements RH</Badge>
                <h2 className="mt-2 text-lg font-black text-slate-950">
                  Échéances à suivre
                </h2>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {upcomingEvents.length === 0 ? (
                <p className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-600">
                  Aucun événement RH à venir.
                </p>
              ) : (
                upcomingEvents.map((entry) => {
                  const tone = calendarDayMeta[entry.type as CalendarDayType];

                  return (
                    <article
                      className={cn(
                        'grid gap-3 rounded-[18px] border p-3 sm:grid-cols-[150px_minmax(0,1fr)]',
                        tone.borderClassName,
                        tone.fillClassName,
                      )}
                      key={entry.id}
                    >
                      <p className="text-sm font-black capitalize text-slate-950">
                        {formatEventDate(entry.date)}
                      </p>
                      <div className="min-w-0">
                        <CalendarDayBadge
                          type={entry.type as CalendarDayType}
                          variant="label"
                        />
                        <p className="mt-2 truncate text-sm font-black text-slate-950">
                          {entry.name}
                        </p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-2 sm:p-4">
            {calendarDays.length === 0 ? (
              <p className="rounded-[18px] border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">
                Aucune donnée disponible.
              </p>
            ) : viewMode === 'month' ? (
              <div className="space-y-2 sm:space-y-3">
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 sm:gap-2 sm:text-[11px]">
                  {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(
                    (day) => (
                      <span key={day}>{day}</span>
                    ),
                  )}
                </div>
                <div className="space-y-1.5 sm:space-y-3">
                  {weeks.map((week) => (
                    <div
                      className="grid grid-cols-7 gap-1 sm:gap-2"
                      key={week.weekLabel}
                    >
                      {week.weekDays.map((day) => {
                        return (
                          <CalendarDayCell
                            day={day}
                            isSelected={selectedDay?.date === day.date}
                            key={day.date}
                            onSelect={setSelectedDay}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {weeks.map((week) => (
                  <div
                    className="rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm"
                    key={week.weekLabel}
                  >
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-black text-slate-950">
                        Semaine du {formatDate(week.weekDays[0].date)}
                      </p>
                      <Badge className="w-fit" variant="outline">
                        {week.weekLabel}
                      </Badge>
                    </div>
                    <div className="grid gap-2">
                      {week.weekDays.map((day) => {
                        return (
                          <CalendarDayCell
                            day={day}
                            isSelected={selectedDay?.date === day.date}
                            key={day.date}
                            onSelect={setSelectedDay}
                            variant="week"
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <CalendarLegend />

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <Badge variant="outline">Fonctionnalités à venir</Badge>
            <h2 className="mt-2 text-lg font-black text-slate-950">
              Feuille de route RH
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                'Gestion des congés',
                'Missions externes',
                'Validation RH',
                "Workflow d'approbation",
                'Historique des événements RH',
              ].map((item) => (
                <div
                  className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </section>

          {feedback ? (
            <div
              className={
                feedback.tone === 'success'
                  ? 'rounded-[22px] border border-success/15 bg-success/10 px-4 py-3 text-sm font-bold text-success'
                  : 'rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700'
              }
            >
              {feedback.message}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden rounded-[28px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
        <CardHeader className="border-b border-slate-200/70 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="outline">Jours RH</Badge>
              <CardTitle className="mt-2 text-xl text-slate-950">
                Gestion des jours fériés
              </CardTitle>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Créez, modifiez ou supprimez les jours fériés publics et
                d&apos;entreprise.
              </p>
            </div>
            <Button className="w-full sm:w-auto" onClick={openCreateDrawer}>
              + Ajouter un jour RH
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Liste de la période
                </p>
                <p className="mt-1 text-base font-black text-slate-950">
                  {activeEntries.length} jour(s) RH
                </p>
              </div>
              <Badge variant="outline">{month}</Badge>
            </div>

            <div className="mt-4 space-y-3">
              {activeEntries.length === 0 ? (
                <p className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm font-semibold text-slate-600">
                  Aucun jour férié enregistré pour cette période.
                </p>
              ) : (
                activeEntries.map((entry) => {
                  const isEditing = editingId === entry.id;

                  return (
                    <article
                      className={cn(
                        'rounded-[18px] border p-3 shadow-sm',
                        isEditing
                          ? 'border-accent/30 bg-orange-50/50'
                          : 'border-slate-200 bg-slate-50/80',
                      )}
                      key={entry.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-black text-slate-950">
                            {entry.name}
                          </p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            {formatDate(entry.date)}
                          </p>
                          {entry.description ? (
                            <p className="mt-1 break-words text-sm leading-5 text-slate-600">
                              {entry.description}
                            </p>
                          ) : null}
                        </div>
                        <CalendarDayBadge
                          type={entry.type as CalendarDayType}
                          variant="label"
                        />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Button
                          className="h-10 rounded-2xl px-3"
                          onClick={() => startEdit(entry)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Modifier
                        </Button>
                        <Button
                          className="h-10 rounded-2xl px-3"
                          onClick={() => deleteEntry(entry)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Supprimer
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {editingEntry ? (
              <div className="mt-4 rounded-[18px] border border-slate-200 bg-white/90 p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Édition active
                </p>
                <p className="mt-1 text-sm font-bold text-slate-950">
                  {editingEntry.name}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDate(editingEntry.date)}
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {isDrawerOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex bg-slate-950/45"
          role="dialog"
        >
          <button
            aria-label="Fermer le panneau"
            className="hidden flex-1 cursor-default lg:block"
            onClick={closeDrawer}
            type="button"
          />
          <aside className="ml-auto flex h-full w-full max-w-full flex-col bg-white shadow-2xl sm:max-w-[460px]">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <Badge variant="outline">
                {formMode === 'create' ? 'Nouveau jour RH' : 'Modification'}
              </Badge>
              <h2 className="mt-2 text-xl font-black text-slate-950">
                {formMode === 'create'
                  ? 'Ajouter un jour RH'
                  : 'Modifier le jour RH'}
              </h2>
            </div>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={submitEntry}
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Nom
                  </span>
                  <input
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    value={formValues.name}
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Date
                  </span>
                  <input
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                    required
                    type="date"
                    value={formValues.date}
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Type
                  </span>
                  <select
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        type: event.target.value as CalendarFormValues['type'],
                      }))
                    }
                    value={formValues.type}
                  >
                    <option value="PUBLIC_HOLIDAY">Jour férié public</option>
                    <option value="COMPANY_HOLIDAY">
                      Jour férié entreprise
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Description
                  </span>
                  <textarea
                    className="mt-1.5 min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-accent focus:ring-4 focus:ring-accent/10"
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    value={formValues.description}
                  />
                </label>
              </div>

              <div className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-2 sm:p-5">
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting
                    ? formMode === 'create'
                      ? 'Création...'
                      : 'Mise à jour...'
                    : formMode === 'create'
                      ? 'Créer'
                      : 'Enregistrer'}
                </Button>
                <Button
                  disabled={isSubmitting}
                  onClick={closeDrawer}
                  type="button"
                  variant="secondary"
                >
                  Annuler
                </Button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      <CalendarDayDrawer
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
      />
    </section>
  );
}
