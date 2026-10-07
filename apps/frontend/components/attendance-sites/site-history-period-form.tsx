'use client';

import { useState } from 'react';
import { FieldLabel, Input, Select } from '@/components/ui/form-controls';

export function SiteHistoryPeriodForm({ action, mode, month, startDate, endDate }: {
  action: string;
  mode: 'monthly' | 'custom';
  month: string;
  startDate: string;
  endDate: string;
}) {
  const [period, setPeriod] = useState(mode);
  return <form action={action} className="flex flex-wrap items-end gap-3 rounded-card border bg-white p-3">
    <div className="grid gap-1"><FieldLabel htmlFor="history-period">Période</FieldLabel><Select id="history-period" name="period" onChange={(event) => setPeriod(event.target.value as 'monthly' | 'custom')} value={period}><option value="monthly">Mois</option><option value="custom">Période personnalisée</option></Select></div>
    {period === 'custom' ? <><div className="grid gap-1"><FieldLabel htmlFor="history-start">Du</FieldLabel><Input id="history-start" name="startDate" type="date" defaultValue={startDate} required /></div><div className="grid gap-1"><FieldLabel htmlFor="history-end">Au</FieldLabel><Input id="history-end" name="endDate" type="date" defaultValue={endDate} required /></div></> : <div className="grid gap-1"><FieldLabel htmlFor="history-month">Mois</FieldLabel><Input id="history-month" name="month" type="month" defaultValue={month} required /></div>}
    <button className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white" type="submit">Afficher</button>
  </form>;
}
