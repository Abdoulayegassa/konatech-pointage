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
    <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Heure locale
      </p>
      <p className="mt-3 font-mono text-[2.7rem] font-semibold leading-none tracking-tight text-slate-950 sm:text-[3.4rem]">
        {now ? formatTime(now) : '--:--:--'}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        <p className="text-sm font-medium capitalize text-slate-600">
          {now ? formatDate(now) : 'date locale'}
        </p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Horloge synchronisee pour confirmer rapidement votre pointage.
      </p>
    </div>
  );
}
