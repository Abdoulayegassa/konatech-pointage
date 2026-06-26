import { CalendarDayBadge, calendarDayMeta } from './calendar-day-badge';

const legendItems = [
  'WORKING_DAY',
  'WEEKEND',
  'PUBLIC_HOLIDAY',
  'COMPANY_HOLIDAY',
] as const;

export function CalendarLegend() {
  return (
    <section
      aria-label="Légende du calendrier RH"
      className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm"
    >
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
        Légende
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {legendItems.map((type) => (
          <div
            className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2"
            key={type}
          >
            <CalendarDayBadge type={type} />
            <span className="truncate text-xs font-bold text-slate-700">
              {calendarDayMeta[type].label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
