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

function formatTime(value: Date) {
  return value.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
    <div className="rounded-[30px] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.88))] px-5 py-6 text-center shadow-[0_20px_46px_rgba(15,45,58,0.09)] sm:p-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        Heure actuelle
      </p>
      <p className="mt-4 font-mono text-[3.35rem] font-black leading-none text-slate-950 sm:text-[4.6rem]">
        {now ? formatTime(now) : '--:--:--'}
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-success" />
        <p className="text-sm font-semibold text-slate-600">Synchronisé</p>
      </div>
      <p className="mt-2 text-sm capitalize leading-6 text-slate-500">
        {now ? formatDate(now) : 'date locale'}
      </p>
    </div>
  );
}
