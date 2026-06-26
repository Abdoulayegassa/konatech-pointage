'use client';

import { useRouter } from 'next/navigation';

type CalendarMonthSelectorProps = {
  month: string;
};

export function CalendarMonthSelector({ month }: CalendarMonthSelectorProps) {
  const router = useRouter();

  return (
    <label className="flex w-full flex-col gap-2 sm:max-w-[220px]">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
        Mois
      </span>
      <input
        className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
        defaultValue={month}
        max="2099-12"
        min="2000-01"
        onChange={(event) => {
          const nextMonth = event.currentTarget.value;

          if (nextMonth) {
            router.replace(`/calendar?month=${encodeURIComponent(nextMonth)}`);
          }
        }}
        type="month"
      />
    </label>
  );
}
