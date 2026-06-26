import { type CalendarDayRecord } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CalendarDayBadge, calendarDayMeta } from './calendar-day-badge';

type CalendarDayCellProps = {
  day: CalendarDayRecord;
  isSelected: boolean;
  onSelect: (day: CalendarDayRecord) => void;
  variant?: 'month' | 'week';
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

function getVisibleLabel(day: CalendarDayRecord) {
  if (day.type === 'PUBLIC_HOLIDAY' || day.type === 'COMPANY_HOLIDAY') {
    return day.label;
  }

  return calendarDayMeta[day.type].shortLabel;
}

export function CalendarDayCell({
  day,
  isSelected,
  onSelect,
  variant = 'month',
}: CalendarDayCellProps) {
  const meta = calendarDayMeta[day.type];
  const hasEvent = day.entries.length > 0;

  if (variant === 'week') {
    return (
      <button
        aria-label={`Ouvrir le détail RH du ${formatLongDate(day.date)} - ${meta.label}`}
        className={cn(
          'grid w-full min-w-0 gap-3 rounded-[18px] border p-3 text-left shadow-sm outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent/30 active:opacity-80 sm:grid-cols-[150px_minmax(0,1fr)_auto]',
          'hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(15,45,58,0.10)]',
          meta.borderClassName,
          meta.fillClassName,
          isSelected && 'ring-2 ring-accent/35',
        )}
        onClick={() => onSelect(day)}
        type="button"
      >
        <div>
          <p className="text-sm font-black capitalize text-slate-950">
            {formatLongDate(day.date)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {day.isoWeekLabel}
          </p>
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-black text-slate-950">
            {getVisibleLabel(day)}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {day.description || meta.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasEvent ? (
            <span
              aria-hidden="true"
              className={cn('h-2.5 w-2.5 rounded-full', meta.dotClassName)}
            />
          ) : null}
          <CalendarDayBadge type={day.type} />
        </div>
      </button>
    );
  }

  return (
    <button
      aria-label={`Ouvrir le détail RH du ${formatLongDate(day.date)} - ${meta.label}`}
      className={cn(
        'group flex min-h-[58px] w-full min-w-0 flex-col rounded-[14px] border p-1.5 text-left shadow-sm outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent/30 active:opacity-80 sm:min-h-[82px] sm:p-2.5',
        'hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_12px_24px_rgba(15,45,58,0.10)]',
        meta.borderClassName,
        meta.fillClassName,
        isSelected && 'border-accent ring-2 ring-accent/35',
      )}
      onClick={() => onSelect(day)}
      type="button"
    >
      <div className="flex items-start justify-between gap-1">
        <span className={cn('text-sm font-black sm:text-base', meta.textClassName)}>
          {new Date(day.date).getUTCDate()}
        </span>
        <CalendarDayBadge type={day.type} />
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        {hasEvent ? (
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 shrink-0 rounded-full', meta.dotClassName)}
          />
        ) : null}
        <p className="min-w-0 truncate text-[11px] font-bold leading-4 text-slate-700 sm:text-xs">
          {getVisibleLabel(day)}
        </p>
      </div>
    </button>
  );
}
