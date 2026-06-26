'use client';

import { useEffect } from 'react';
import { type CalendarDayRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDayBadge, calendarDayMeta } from './calendar-day-badge';

type CalendarDayDrawerProps = {
  day: CalendarDayRecord | null;
  onClose: () => void;
};

function formatLongDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatAuditDate(value?: string | null) {
  if (!value) {
    return 'Non disponible';
  }

  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getImpact(day: CalendarDayRecord) {
  if (day.type === 'WORKING_DAY') {
    return {
      title: 'Jour travaillé normal',
      description: 'Cette journée est considérée comme travaillée.',
    };
  }

  return {
    title: 'Jour non travaillé',
    description: 'Les absences sont ignorées pour cette journée.',
  };
}

function getDescription(day: CalendarDayRecord) {
  if (day.description) {
    return day.description;
  }

  if (day.entries[0]?.name) {
    return day.entries[0].name;
  }

  if (day.type === 'WORKING_DAY') {
    return 'Jour ouvré';
  }

  return calendarDayMeta[day.type].label;
}

export function CalendarDayDrawer({ day, onClose }: CalendarDayDrawerProps) {
  useEffect(() => {
    if (!day) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [day, onClose]);

  if (!day) {
    return null;
  }

  const meta = calendarDayMeta[day.type];
  const impact = getImpact(day);
  const entry = day.entries[0];

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex bg-slate-950/45"
      role="dialog"
    >
      <button
        aria-label="Fermer le détail de la journée"
        className="hidden flex-1 cursor-default lg:block"
        onClick={onClose}
        type="button"
      />
      <aside className="ml-auto flex h-full w-full max-w-full flex-col bg-white shadow-2xl sm:max-w-[460px]">
        <div className={cn('border-b p-4 sm:p-5', meta.fillClassName)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Badge variant="outline">Journée RH</Badge>
              <h2 className="mt-2 text-xl font-black text-slate-950">
                {formatLongDate(day.date)}
              </h2>
            </div>
            <Button onClick={onClose} type="button" variant="secondary">
              Fermer
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <section className="rounded-[20px] border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Classification RH
            </p>
            <div className="mt-3 flex items-center gap-2">
              <CalendarDayBadge type={day.type} />
              <p className="text-sm font-black text-slate-950">{meta.label}</p>
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Description
            </p>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-800">
              {getDescription(day)}
            </p>
          </section>

          <section
            className={cn(
              'rounded-[20px] border p-4',
              meta.borderClassName,
              meta.fillClassName,
            )}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Impact RH
            </p>
            <p className="mt-2 text-sm font-black text-slate-950">
              {impact.title}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
              {impact.description}
            </p>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Audit
            </p>
            <dl className="mt-3 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Type</dt>
                <dd className="font-black text-slate-950">{meta.label}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">Date de création</dt>
                <dd className="text-right font-bold text-slate-800">
                  {formatAuditDate(
                    (entry as { createdAt?: string | null } | undefined)
                      ?.createdAt,
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">
                  Dernière mise à jour
                </dt>
                <dd className="text-right font-bold text-slate-800">
                  {formatAuditDate(
                    (entry as { updatedAt?: string | null } | undefined)
                      ?.updatedAt,
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}
