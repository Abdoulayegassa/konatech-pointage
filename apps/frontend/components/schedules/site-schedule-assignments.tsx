'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteEmployeeRecord, SiteScheduleRecord } from '@/lib/api';
import { getClientErrorMessage } from '@/lib/client-error';

export function SiteScheduleAssignments({
  employees,
  schedules,
}: {
  employees: SiteEmployeeRecord[];
  schedules: SiteScheduleRecord[];
}) {
  const router = useRouter();
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  async function assign(employee: SiteEmployeeRecord, scheduleId: string) {
    setSavingEmployeeId(employee.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/employees/${encodeURIComponent(employee.id)}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: scheduleId || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(data, 'Impossible de modifier l’affectation du planning.'),
        });
        return;
      }
      setFeedback({ tone: 'success', message: `Affectation mise à jour pour ${employee.firstName} ${employee.lastName}.` });
      router.refresh();
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de modifier l’affectation. Vérifiez votre connexion puis réessayez.' });
    } finally {
      setSavingEmployeeId(null);
    }
  }

  return <section className="space-y-3 rounded-2xl border bg-white p-5">
    <header>
      <h3 className="text-lg font-bold">Affectations des employés du site</h3>
      <p className="text-sm text-slate-600">Seuls les employés actuellement affectés à ce site sont affichés. Les changements conservent la date d’effet et l’historique gérés par le serveur.</p>
    </header>
    {feedback ? <p role="status" className={feedback.tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-green-700'}>{feedback.message}</p> : null}
    {employees.length ? <div className="divide-y">
      {employees.map((employee) => <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" key={employee.id}>
        <div>
          <p className="font-semibold">{employee.firstName} {employee.lastName}</p>
          <p className="text-xs text-slate-500">{employee.employeeIdentifier}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Planning de {employee.firstName} {employee.lastName}</span>
          <select
            aria-label={`Planning de ${employee.firstName} ${employee.lastName}`}
            className="min-h-10 min-w-56 rounded-lg border px-3"
            disabled={savingEmployeeId === employee.id}
            onChange={(event) => void assign(employee, event.target.value)}
            value={employee.currentSchedule?.id ?? ''}
          >
            <option value="">Aucun planning</option>
            {schedules.filter((schedule) => schedule.isActive || schedule.id === employee.currentSchedule?.id).map((schedule) => <option disabled={!schedule.isActive} key={schedule.id} value={schedule.id}>{schedule.name} · {schedule.startTime}–{schedule.endTime}{schedule.isActive ? '' : ' (inactif)'}</option>)}
          </select>
          {savingEmployeeId === employee.id ? <span aria-live="polite">Enregistrement…</span> : null}
        </label>
      </div>)}
    </div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Aucun employé n’est actuellement affecté à ce site.</p>}
  </section>;
}
