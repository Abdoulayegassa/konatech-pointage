'use client';

import { useEffect, useState } from 'react';

function formatDate(value: Date) {
  return value.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value: Date, includeSeconds = true) {
  return value.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  });
}

export function AttendanceLiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="rounded-[24px] border border-slate-200/75 bg-white/90 px-4 py-5 text-center shadow-[0_18px_42px_rgba(15,45,58,0.08)] sm:rounded-[28px] sm:px-5 sm:py-6">
      <div className="flex items-center justify-center">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          Heure actuelle
        </p>
      </div>
      <p className="mt-3 font-mono text-[4rem] font-black leading-none text-slate-950 sm:text-[4.5rem]">
        {now ? formatTime(now) : '--:--:--'}
      </p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-success" />
        <p className="text-sm font-extrabold text-slate-600">Synchronisé</p>
      </div>
      <p className="mt-2 text-sm font-semibold capitalize leading-5 text-slate-500">
        {now ? formatDate(now) : 'date locale'}
      </p>
    </div>
  );
}
