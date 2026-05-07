'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  CreateSchedulePayload,
  ScheduleRecord,
  UpdateSchedulePayload,
  WorkDay,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';
import {
  createEmptyScheduleFormValues,
  getEmployeePreview,
  getScheduleStatusMeta,
  getScheduleUsageMeta,
  inputClassName,
  labelClassName,
  mapScheduleToFormValues,
  mergeScheduleRecord,
  sortWorkDays,
  toMinutes,
  WORK_DAY_OPTIONS,
  type FeedbackState,
  type FormMode,
  type RowActionState,
  type ScheduleFormValues,
} from './schedule-manager.helpers';

type AdminSchedulesManagerProps = {
  initialSchedules: ScheduleRecord[];
};

type StatusFilter = 'all' | 'active' | 'inactive';
type UsageFilter = 'all' | 'assigned' | 'unassigned';
type DayFilter = 'all' | WorkDay;

function formatDayLabel(day: WorkDay) {
  return WORK_DAY_OPTIONS.find((option) => option.value === day)?.label ?? day;
}

function formatDayShortLabel(day: WorkDay) {
  return (
    WORK_DAY_OPTIONS.find((option) => option.value === day)?.shortLabel ?? day
  );
}

function formatTimeRange(
  schedule: Pick<ScheduleRecord, 'startTime' | 'endTime'>,
) {
  return `${schedule.startTime} - ${schedule.endTime}`;
}

export function AdminSchedulesManager({
  initialSchedules,
}: AdminSchedulesManagerProps) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(
    null,
  );
  const [formValues, setFormValues] = useState<ScheduleFormValues>(
    createEmptyScheduleFormValues(),
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rowAction, setRowAction] = useState<RowActionState>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');

  const activeSchedules = schedules.filter(
    (schedule) => schedule.isActive,
  ).length;
  const inactiveSchedules = schedules.length - activeSchedules;
  const assignedEmployees = schedules.reduce(
    (total, schedule) => total + schedule.employees.length,
    0,
  );
  const utilizedSchedules = schedules.filter(
    (schedule) => schedule.employees.length > 0,
  ).length;
  const unassignedSchedules = schedules.length - utilizedSchedules;
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          schedule.name,
          schedule.startTime,
          schedule.endTime,
          String(schedule.latenessMarginMinutes),
          getEmployeePreview(schedule),
          ...schedule.workDays.map((day) => formatDayLabel(day)),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? schedule.isActive : !schedule.isActive);
      const matchesUsage =
        usageFilter === 'all' ||
        (usageFilter === 'assigned'
          ? schedule.employees.length > 0
          : schedule.employees.length === 0);
      const matchesDay =
        dayFilter === 'all' || schedule.workDays.includes(dayFilter);

      return matchesSearch && matchesStatus && matchesUsage && matchesDay;
    });
  }, [dayFilter, normalizedSearch, schedules, statusFilter, usageFilter]);

  const visibleSchedules = filteredSchedules.length;
  const averageAssignments =
    schedules.length === 0
      ? 0
      : Math.round(assignedEmployees / schedules.length);
  const isFilterActive =
    normalizedSearch.length > 0 ||
    statusFilter !== 'all' ||
    usageFilter !== 'all' ||
    dayFilter !== 'all';
  const editingSchedule =
    schedules.find((schedule) => schedule.id === editingScheduleId) ?? null;

  function updateFormValue<Key extends keyof ScheduleFormValues>(
    key: Key,
    value: ScheduleFormValues[Key],
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleWorkDay(day: WorkDay) {
    setFormValues((current) => ({
      ...current,
      workDays: current.workDays.includes(day)
        ? sortWorkDays(current.workDays.filter((value) => value !== day))
        : sortWorkDays([...current.workDays, day]),
    }));
  }

  function clearFilters() {
    setSearchQuery('');
    setStatusFilter('all');
    setUsageFilter('all');
    setDayFilter('all');
  }

  function resetForm() {
    setFormMode('create');
    setEditingScheduleId(null);
    setFormValues(createEmptyScheduleFormValues());
  }

  async function startEdit(scheduleId: string) {
    setRowAction({
      scheduleId,
      type: 'edit',
    });
    setFeedback(null);

    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as
        | ScheduleRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            'Impossible de charger le planning.',
          ),
        });
        return;
      }

      const schedule = data as ScheduleRecord;

      setFormMode('edit');
      setEditingScheduleId(schedule.id);
      setFormValues(mapScheduleToFormValues(schedule));
    } finally {
      setRowAction(null);
    }
  }

  async function toggleStatus(schedule: ScheduleRecord) {
    setRowAction({
      scheduleId: schedule.id,
      type: 'status',
    });
    setFeedback(null);

    try {
      const response = await fetch(`/api/schedules/${schedule.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: !schedule.isActive,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | ScheduleRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            'Impossible de mettre a jour le statut du planning.',
          ),
        });
        return;
      }

      const updatedSchedule = data as ScheduleRecord;

      setSchedules((current) =>
        current.map((item) =>
          item.id === updatedSchedule.id ? updatedSchedule : item,
        ),
      );
      setFeedback({
        tone: 'success',
        message: updatedSchedule.isActive
          ? 'Planning reactive avec succes.'
          : 'Planning desactive avec succes.',
      });

      if (editingScheduleId === updatedSchedule.id) {
        setFormValues(mapScheduleToFormValues(updatedSchedule));
      }
    } finally {
      setRowAction(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const trimmedName = formValues.name.trim();
      const latenessMarginMinutes = Number(formValues.latenessMarginMinutes);

      if (!trimmedName) {
        setFeedback({
          tone: 'error',
          message: 'Le nom du planning est requis.',
        });
        return;
      }

      if (!Number.isInteger(latenessMarginMinutes)) {
        setFeedback({
          tone: 'error',
          message: 'La marge de retard doit etre un nombre entier.',
        });
        return;
      }

      if (latenessMarginMinutes < 0 || latenessMarginMinutes > 180) {
        setFeedback({
          tone: 'error',
          message: 'La marge de retard doit rester entre 0 et 180 minutes.',
        });
        return;
      }

      if (formValues.workDays.length === 0) {
        setFeedback({
          tone: 'error',
          message: 'Selectionnez au moins un jour actif.',
        });
        return;
      }

      if (toMinutes(formValues.endTime) <= toMinutes(formValues.startTime)) {
        setFeedback({
          tone: 'error',
          message:
            "L'heure de fin doit etre posterieure a l'heure de debut pour le meme jour.",
        });
        return;
      }

      if (formMode === 'edit' && !editingScheduleId) {
        setFeedback({
          tone: 'error',
          message: 'Aucun planning charge pour la mise a jour.',
        });
        return;
      }

      const payload: CreateSchedulePayload | UpdateSchedulePayload = {
        name: trimmedName,
        startTime: formValues.startTime,
        endTime: formValues.endTime,
        latenessMarginMinutes,
        isActive: formValues.isActive,
        workDays: sortWorkDays(formValues.workDays),
      };

      const response = await fetch(
        formMode === 'create'
          ? '/api/schedules'
          : `/api/schedules/${editingScheduleId}`,
        {
          method: formMode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json().catch(() => ({}))) as
        | ScheduleRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            formMode === 'create'
              ? 'Impossible de creer le planning.'
              : 'Impossible de mettre a jour le planning.',
          ),
        });
        return;
      }

      const savedSchedule = data as ScheduleRecord;

      setSchedules((current) =>
        mergeScheduleRecord(current, savedSchedule, formMode),
      );
      setFeedback({
        tone: 'success',
        message:
          formMode === 'create'
            ? 'Planning cree avec succes.'
            : 'Planning mis a jour avec succes.',
      });
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  }

  const statCards = [
    {
      label: 'Actifs',
      value: activeSchedules,
      meta: `${inactiveSchedules} inactif(s)`,
      className:
        'border-success/15 bg-[linear-gradient(180deg,rgba(25,135,84,0.07),rgba(255,255,255,0.98))]',
    },
    {
      label: 'Non utilises',
      value: unassignedSchedules,
      meta: `${utilizedSchedules} en service`,
      className:
        'border-accent/15 bg-[linear-gradient(180deg,rgba(244,110,40,0.09),rgba(255,255,255,0.98))]',
    },
    {
      label: 'Affectations',
      value: assignedEmployees,
      meta: `${averageAssignments} / planning`,
      className:
        'border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.08),rgba(255,255,255,0.98))]',
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.42fr)_minmax(330px,0.58fr)]">
      <Card className="admin-reveal admin-reveal-delay-1 overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />

        <CardHeader className="space-y-5 border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-accent/15 text-accent" variant="warning">
                  Schedule registry
                </Badge>
                <Badge variant="outline">
                  {visibleSchedules} resultat(s)
                </Badge>
              </div>
              <div className="space-y-1.5">
                <CardTitle className="text-2xl text-slate-950 sm:text-[2rem]">
                  Registre des plannings
                </CardTitle>
                <p className="max-w-2xl text-sm leading-5 text-slate-600">
                  Horaires, jours actifs et charge dans une vue plus directe.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {formMode === 'edit' ? (
                <Button onClick={resetForm} type="button" variant="secondary">
                  Annuler
                </Button>
              ) : null}
              <Button
                className="rounded-2xl bg-accent text-accent-foreground shadow-[0_14px_32px_rgba(244,110,40,0.26)] hover:bg-accent/95"
                onClick={resetForm}
                type="button"
              >
                Nouveau planning
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
              <p className={labelClassName}>Total</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {schedules.length}
              </p>
              <p className="mt-1.5 text-sm text-slate-600">Catalogue.</p>
            </div>

            {statCards.map((card) => (
              <div
                key={card.label}
                className={cn('rounded-[24px] border p-4 shadow-sm', card.className)}
              >
                <p className={labelClassName}>{card.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {card.value}
                </p>
                <p className="mt-1.5 text-sm text-slate-600">{card.meta}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[26px] border border-slate-200/80 bg-white/88 p-4 shadow-sm backdrop-blur sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,0.82fr))]">
              <label className="block">
                <span className={labelClassName}>Recherche</span>
                <input
                  className={inputClassName}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nom, heure, jours..."
                  type="search"
                  value={searchQuery}
                />
              </label>

              <label className="block">
                <span className={labelClassName}>Statut</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  value={statusFilter}
                >
                  <option value="all">Tous</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </label>

              <label className="block">
                <span className={labelClassName}>Utilisation</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    setUsageFilter(event.target.value as UsageFilter)
                  }
                  value={usageFilter}
                >
                  <option value="all">Tous</option>
                  <option value="assigned">Affectes</option>
                  <option value="unassigned">Non affectes</option>
                </select>
              </label>

              <label className="block">
                <span className={labelClassName}>Jour</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    setDayFilter(event.target.value as DayFilter)
                  }
                  value={dayFilter}
                >
                  <option value="all">Tous</option>
                  {WORK_DAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{visibleSchedules} visibles</Badge>
                <Badge variant="outline">{assignedEmployees} affectations</Badge>
              </div>
              <Button
                disabled={!isFilterActive}
                onClick={clearFilters}
                type="button"
                variant="secondary"
              >
                Effacer les filtres
              </Button>
            </div>
          </div>

          {feedback ? (
            <div
              className={
                feedback.tone === 'success'
                  ? 'rounded-[22px] border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success'
                  : 'rounded-[22px] border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent'
              }
            >
              {feedback.message}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={labelClassName}>Lecture</p>
              <p className="mt-1.5 text-base font-semibold text-slate-950">
                {visibleSchedules} planning(s) affiches
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{utilizedSchedules} en service</Badge>
              <Badge variant="outline">{unassignedSchedules} libres</Badge>
            </div>
          </div>

          {filteredSchedules.length === 0 ? (
            <AdminEmptyState
              badge={schedules.length === 0 ? 'Plannings' : 'Filtres actifs'}
              action={
                schedules.length === 0 ? (
                  <Button className="mx-auto" onClick={resetForm} type="button">
                    Creer un planning
                  </Button>
                ) : (
                  <Button
                    className="mx-auto"
                    onClick={clearFilters}
                    type="button"
                    variant="secondary"
                  >
                    Effacer les filtres
                  </Button>
                )
              }
              description={
                schedules.length === 0
                  ? 'Ajoutez votre premier planning.'
                  : 'Ajustez la recherche ou les filtres.'
              }
              detail={
                schedules.length === 0
                  ? 'La liste se mettra a jour automatiquement.'
                  : 'Les filtres sont appliques uniquement dans cette vue.'
              }
              title={
                schedules.length === 0 ? 'Aucun planning' : 'Aucun resultat'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Planning
                      </th>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Horaire
                      </th>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Jours
                      </th>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Affectations
                      </th>
                      <th className="px-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchedules.map((schedule) => {
                      const status = getScheduleStatusMeta(schedule.isActive);
                      const usage = getScheduleUsageMeta(schedule);
                      const isEditing =
                        rowAction?.scheduleId === schedule.id &&
                        rowAction.type === 'edit';
                      const isUpdatingStatus =
                        rowAction?.scheduleId === schedule.id &&
                        rowAction.type === 'status';
                      const isSelected = editingScheduleId === schedule.id;

                      return (
                        <tr key={schedule.id} className="group">
                          <td
                            className={cn(
                              'rounded-l-[22px] border border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm',
                              isSelected && 'border-accent/35 bg-orange-50/45',
                            )}
                          >
                            <div className="space-y-3">
                              <div>
                                <p className="text-base font-semibold text-slate-950">
                                  {schedule.name}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  Cree le{' '}
                                  {new Date(schedule.createdAt).toLocaleDateString(
                                    'fr-FR',
                                  )}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isSelected ? (
                                  <Badge
                                    className="bg-accent/15 text-accent"
                                    variant="warning"
                                  >
                                    En edition
                                  </Badge>
                                ) : null}
                                <Badge variant={status.variant}>
                                  {status.label}
                                </Badge>
                                <Badge variant={usage.variant}>
                                  {usage.label}
                                </Badge>
                              </div>
                            </div>
                          </td>
                          <td className="border border-l-0 border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-950">
                                {formatTimeRange(schedule)}
                              </p>
                              <p className="text-sm text-slate-600">
                                {schedule.latenessMarginMinutes} min de marge
                              </p>
                            </div>
                          </td>
                          <td className="border border-l-0 border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm">
                            <div className="flex flex-wrap gap-2">
                              {schedule.workDays.map((day) => (
                                <Badge key={day} variant="outline">
                                  {formatDayShortLabel(day)}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="border border-l-0 border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-950">
                                {schedule.employees.length} employe(s)
                              </p>
                              <p className="text-sm text-slate-600">
                                {getEmployeePreview(schedule)}
                              </p>
                            </div>
                          </td>
                          <td
                            className={cn(
                              'rounded-r-[22px] border border-l-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm',
                              isSelected && 'border-accent/35 bg-orange-50/45',
                            )}
                          >
                            <div className="flex justify-end gap-2">
                              <Button
                                className="rounded-xl"
                                disabled={Boolean(rowAction)}
                                onClick={() => startEdit(schedule.id)}
                                size="sm"
                                type="button"
                              >
                                {isEditing ? 'Chargement...' : 'Modifier'}
                              </Button>
                              <Button
                                className="rounded-xl"
                                disabled={Boolean(rowAction)}
                                onClick={() => toggleStatus(schedule)}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                {isUpdatingStatus
                                  ? 'Mise a jour...'
                                  : schedule.isActive
                                    ? 'Desactiver'
                                    : 'Activer'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:hidden">
                {filteredSchedules.map((schedule) => {
                  const status = getScheduleStatusMeta(schedule.isActive);
                  const usage = getScheduleUsageMeta(schedule);
                  const isEditing =
                    rowAction?.scheduleId === schedule.id &&
                    rowAction.type === 'edit';
                  const isUpdatingStatus =
                    rowAction?.scheduleId === schedule.id &&
                    rowAction.type === 'status';
                  const isSelected = editingScheduleId === schedule.id;

                  return (
                    <article
                      key={schedule.id}
                      className={cn(
                        'rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm',
                        isSelected && 'border-accent/35 bg-orange-50/40',
                      )}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">
                              {schedule.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {formatTimeRange(schedule)}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {schedule.latenessMarginMinutes} min
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          <Badge variant={usage.variant}>{usage.label}</Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className={labelClassName}>Jours</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {schedule.workDays.map((day) => (
                                <Badge key={day} variant="outline">
                                  {formatDayShortLabel(day)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className={labelClassName}>Affectations</p>
                            <p className="mt-1.5 text-sm font-semibold text-slate-950">
                              {schedule.employees.length} employe(s)
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {getEmployeePreview(schedule)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button
                            className="rounded-2xl sm:flex-1"
                            disabled={Boolean(rowAction)}
                            onClick={() => startEdit(schedule.id)}
                            type="button"
                          >
                            {isEditing ? 'Chargement...' : 'Modifier'}
                          </Button>
                          <Button
                            className="rounded-2xl sm:flex-1"
                            disabled={Boolean(rowAction)}
                            onClick={() => toggleStatus(schedule)}
                            type="button"
                            variant="secondary"
                          >
                            {isUpdatingStatus
                              ? 'Mise a jour...'
                              : schedule.isActive
                                ? 'Desactiver'
                                : 'Activer'}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="admin-reveal admin-reveal-delay-2 self-start overflow-hidden rounded-[30px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_22px_52px_rgba(15,45,58,0.08)] xl:sticky xl:top-6">
        <div className="h-1.5 bg-[linear-gradient(90deg,rgba(16,50,60,0.92),rgba(244,110,40,0.72),rgba(244,110,40,0.95))]" />

        <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={formMode === 'create' ? 'success' : 'warning'}>
              {formMode === 'create' ? 'Creation' : 'Edition'}
            </Badge>
            <Badge variant="outline">
              {formMode === 'create' ? 'Nouveau modele' : 'Modele actif'}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <CardTitle className="text-2xl text-slate-950">
              {formMode === 'create' ? 'Planning' : 'Modifier le planning'}
            </CardTitle>
            <p className="text-sm leading-5 text-slate-600">
              Meme logique API, lecture plus simple.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4 shadow-sm">
            <p className={labelClassName}>Selection</p>
            <p className="mt-1.5 text-base font-semibold text-slate-950">
              {editingSchedule?.name ?? 'Nouveau planning'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {editingSchedule
                ? formatTimeRange(editingSchedule)
                : 'Creation rapide'}
            </p>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Identite</p>
                <p className="text-base font-semibold text-slate-950">
                  Nom du planning
                </p>
              </div>

              <label className="block">
                <span className={labelClassName}>Nom</span>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateFormValue('name', event.target.value)
                  }
                  placeholder="Ex: Morning Office Shift"
                  required
                  value={formValues.name}
                />
              </label>
            </section>

            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Horaire</p>
                <p className="text-base font-semibold text-slate-950">
                  Fenetre et marge
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClassName}>Debut</span>
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      updateFormValue('startTime', event.target.value)
                    }
                    required
                    type="time"
                    value={formValues.startTime}
                  />
                </label>

                <label className="block">
                  <span className={labelClassName}>Fin</span>
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      updateFormValue('endTime', event.target.value)
                    }
                    required
                    type="time"
                    value={formValues.endTime}
                  />
                </label>
              </div>

              <label className="block">
                <span className={labelClassName}>Marge de retard</span>
                <input
                  className={inputClassName}
                  inputMode="numeric"
                  max={180}
                  min={0}
                  onChange={(event) =>
                    updateFormValue('latenessMarginMinutes', event.target.value)
                  }
                  required
                  type="number"
                  value={formValues.latenessMarginMinutes}
                />
              </label>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
                <p className={labelClassName}>Resume</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-950">
                  {formValues.startTime} - {formValues.endTime}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formValues.latenessMarginMinutes || '0'} min de marge
                </p>
              </div>
            </section>

            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Activation</p>
                <p className="text-base font-semibold text-slate-950">
                  Jours actifs et statut
                </p>
              </div>

              <div className="space-y-3">
                <span className={labelClassName}>Jours</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WORK_DAY_OPTIONS.map((day) => {
                    const isChecked = formValues.workDays.includes(day.value);

                    return (
                      <label
                        key={day.value}
                        className={cn(
                          'flex items-center gap-3 rounded-[20px] border px-4 py-3 text-sm transition duration-200',
                          isChecked
                            ? 'border-accent/25 bg-accent/10 text-slate-950 shadow-sm'
                            : 'border-slate-200 bg-slate-50/80 text-slate-600 hover:border-accent/20 hover:bg-white',
                        )}
                      >
                        <input
                          checked={isChecked}
                          className="h-4 w-4 rounded border-border"
                          onChange={() => toggleWorkDay(day.value)}
                          type="checkbox"
                        />
                        <span>{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-600">
                <input
                  checked={formValues.isActive}
                  className="mt-1 h-4 w-4 rounded border-border"
                  onChange={(event) =>
                    updateFormValue('isActive', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-semibold text-slate-950">
                    Planning actif
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Meme statut que l action rapide de la liste.
                  </span>
                </span>
              </label>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
                <p className={labelClassName}>Selection</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-950">
                  {formValues.workDays.length} jour(s) actif(s)
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {sortWorkDays(formValues.workDays)
                    .map((day) => formatDayLabel(day))
                    .join(', ')}
                </p>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="rounded-2xl sm:flex-1"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting
                  ? formMode === 'create'
                    ? 'Creation...'
                    : 'Mise a jour...'
                  : formMode === 'create'
                    ? 'Creer le planning'
                    : 'Enregistrer'}
              </Button>
              <Button
                className="rounded-2xl sm:flex-1"
                disabled={isSubmitting}
                onClick={resetForm}
                type="button"
                variant="secondary"
              >
                Reinitialiser
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
