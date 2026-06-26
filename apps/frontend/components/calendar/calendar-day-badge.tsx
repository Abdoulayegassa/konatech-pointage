import { type CalendarDayType } from '@/lib/api';
import { cn } from '@/lib/utils';

export const calendarDayMeta: Record<
  CalendarDayType,
  {
    code: string;
    label: string;
    shortLabel: string;
    badgeClassName: string;
    borderClassName: string;
    dotClassName: string;
    fillClassName: string;
    textClassName: string;
  }
> = {
  WORKING_DAY: {
    code: 'JT',
    label: 'Jour travaillé',
    shortLabel: 'Jour ouvré',
    badgeClassName: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    borderClassName: 'border-emerald-300',
    dotClassName: 'bg-emerald-500',
    fillClassName: 'bg-emerald-50',
    textClassName: 'text-emerald-900',
  },
  WEEKEND: {
    code: 'WE',
    label: 'Week-end',
    shortLabel: 'Week-end',
    badgeClassName: 'border-slate-300 bg-slate-100 text-slate-700',
    borderClassName: 'border-slate-300',
    dotClassName: 'bg-slate-500',
    fillClassName: 'bg-slate-100',
    textClassName: 'text-slate-800',
  },
  PUBLIC_HOLIDAY: {
    code: 'FP',
    label: 'Jour férié public',
    shortLabel: 'Jour férié',
    badgeClassName: 'border-red-300 bg-red-100 text-red-800',
    borderClassName: 'border-red-300',
    dotClassName: 'bg-red-500',
    fillClassName: 'bg-red-50',
    textClassName: 'text-red-900',
  },
  COMPANY_HOLIDAY: {
    code: 'FE',
    label: 'Jour férié entreprise',
    shortLabel: 'Férié entreprise',
    badgeClassName: 'border-blue-300 bg-blue-100 text-blue-800',
    borderClassName: 'border-blue-300',
    dotClassName: 'bg-blue-500',
    fillClassName: 'bg-blue-50',
    textClassName: 'text-blue-900',
  },
  LEAVE: {
    code: 'CG',
    label: 'Congés',
    shortLabel: 'Congés',
    badgeClassName: 'border-purple-300 bg-purple-100 text-purple-800',
    borderClassName: 'border-purple-300',
    dotClassName: 'bg-purple-500',
    fillClassName: 'bg-purple-50',
    textClassName: 'text-purple-900',
  },
  EXTERNAL_MISSION: {
    code: 'ME',
    label: 'Mission externe',
    shortLabel: 'Mission',
    badgeClassName: 'border-orange-300 bg-orange-100 text-orange-800',
    borderClassName: 'border-orange-300',
    dotClassName: 'bg-orange-500',
    fillClassName: 'bg-orange-50',
    textClassName: 'text-orange-900',
  },
};

type CalendarDayBadgeProps = {
  type: CalendarDayType;
  variant?: 'code' | 'label';
  className?: string;
};

export function CalendarDayBadge({
  type,
  variant = 'code',
  className,
}: CalendarDayBadgeProps) {
  const meta = calendarDayMeta[type];

  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-full border px-2 text-[10px] font-black leading-none',
        meta.badgeClassName,
        className,
      )}
      title={meta.label}
    >
      {variant === 'code' ? meta.code : meta.label}
    </span>
  );
}
