'use client';

import { useEffect, useState } from 'react';
import { EmployeeAttendanceActions } from './employee-attendance-actions';
import { OfflineAttendanceStatus } from './offline-attendance-status';
import {
  cleanupOfflineAttendanceQueue,
  deriveOfflineAttendanceActions,
  isOfflineContextValidForCapture,
  OFFLINE_ATTENDANCE_QUEUE_EVENT,
  readActiveOfflineAttendanceBootstrap,
  readOfflineAttendanceQueue,
  type OfflineAttendanceBootstrap,
} from '@/lib/offline-attendance-queue';

type OfflinePageState = {
  bootstrap: OfflineAttendanceBootstrap | null;
  online: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  blocked: boolean;
  contextValid: boolean;
  shellReadiness: 'preparing' | 'ready' | 'unavailable';
};

const EMPTY_STATE: OfflinePageState = {
  bootstrap: null,
  online: true,
  canCheckIn: false,
  canCheckOut: false,
  blocked: false,
  contextValid: false,
  shellReadiness: 'preparing',
};

export function OfflineAttendancePage({
  onlinePath,
}: {
  onlinePath: '/attendance-entry' | '/my-attendance';
}) {
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    const refresh = () => {
      const bootstrap = readActiveOfflineAttendanceBootstrap(window.localStorage);
      const online = navigator.onLine;
      const shellValue = document.documentElement.dataset.offlineShellReadiness;
      const shellReadiness = shellValue === 'ready' || shellValue === 'unavailable'
        ? shellValue
        : 'preparing';
      if (!bootstrap) {
        setState({ ...EMPTY_STATE, online, shellReadiness });
        return;
      }
      cleanupOfflineAttendanceQueue(window.localStorage);
      const actions = deriveOfflineAttendanceActions(
        bootstrap,
        readOfflineAttendanceQueue(window.localStorage),
      );
      const contextValid = isOfflineContextValidForCapture(bootstrap, new Date());
      setState({ bootstrap, online, ...actions, contextValid, shellReadiness });
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, refresh);
    window.addEventListener('inout:offline-shell-readiness', refresh);
    const expiryTimer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(expiryTimer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, refresh);
      window.removeEventListener('inout:offline-shell-readiness', refresh);
    };
  }, []);

  const bootstrap = state.bootstrap;
  const offlineReadiness = !state.online &&
    (!bootstrap || !state.contextValid || state.shellReadiness !== 'ready')
    ? 'unavailable'
    : !bootstrap || !state.contextValid || state.shellReadiness === 'preparing'
      ? 'preparing'
      : state.shellReadiness;
  return (
    <main className="min-h-[100dvh] bg-[#fffdfb] px-4 py-6 text-[#10323c]">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">InOut · Pointage employé</p>
          {bootstrap ? (
            <>
              <h1 className="mt-2 text-2xl font-black">{bootstrap.employeeName}</h1>
              <p className="mt-1 text-sm text-slate-600">Site : {bootstrap.siteName}</p>
            </>
          ) : (
            <h1 className="mt-2 text-2xl font-black">Pointage hors connexion</h1>
          )}
          <p aria-live="polite" className="mt-3 text-sm font-semibold">
            {state.online ? 'Connexion disponible' : 'Vous êtes hors connexion.'}
          </p>
          <p
            aria-live="polite"
            className="mt-1 text-xs font-bold uppercase tracking-wide"
            data-offline-readiness={offlineReadiness}
            role="status"
          >
            {offlineReadiness === 'ready'
              ? 'Mode hors connexion prêt sur cet appareil.'
              : offlineReadiness === 'preparing'
                ? 'Préparation du mode hors connexion en cours.'
                : 'Mode hors connexion indisponible.'}
          </p>
        </header>

        {!bootstrap ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5" role="status">
            <h2 className="font-black">Préparation en ligne requise</h2>
            <p className="mt-2 text-sm leading-6">
              Ouvrez votre espace de pointage avec une connexion et attendez la préparation du contexte sécurisé avant de vous déconnecter.
            </p>
            {state.online ? <a className="mt-4 inline-block font-bold underline" href={onlinePath}>Ouvrir mon pointage</a> : null}
          </section>
        ) : !state.contextValid ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5" role="status">
            <h2 className="font-black">Pointage hors connexion indisponible</h2>
            <p className="mt-2 text-sm leading-6">
              Le contexte sécurisé a expiré. Reconnectez-vous pour le renouveler. Les pointages déjà en attente restent conservés sur cet appareil.
            </p>
          </section>
        ) : state.blocked ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5" role="status">
            <h2 className="font-black">Un pointage précédent doit être résolu</h2>
            <p className="mt-2 text-sm leading-6">Les actions suivantes sont bloquées pour préserver l’ordre de vos pointages.</p>
          </section>
        ) : !state.online && state.shellReadiness !== 'ready' ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5" role="status">
            <h2 className="font-black">Pointage hors connexion indisponible</h2>
            <p className="mt-2 text-sm leading-6">
              La préparation de l’application hors connexion n’est pas terminée. Reconnectez-vous et attendez que le mode hors connexion soit prêt avant de fermer l’application.
            </p>
          </section>
        ) : (
          <EmployeeAttendanceActions
            canCheckIn={state.canCheckIn}
            canCheckOut={state.canCheckOut}
            employeeName={bootstrap.employeeName}
            offlineSessionBinding={bootstrap.sessionBinding}
            offlineQueueOwner={{
              employeeId: bootstrap.employeeId,
              organizationId: bootstrap.organizationId,
            }}
            offlineBootstrapSeed={{
              employeeId: bootstrap.employeeId,
              organizationId: bootstrap.organizationId,
              employeeName: bootstrap.employeeName,
              sessionBinding: bootstrap.sessionBinding,
              canCheckIn: bootstrap.canCheckIn,
              canCheckOut: bootstrap.canCheckOut,
              timeZone: bootstrap.timeZone,
              snapshotAt: bootstrap.snapshotAt,
            }}
            securityPolicy={bootstrap.securityPolicy}
            sessionMode="account"
            timeZone={bootstrap.timeZone}
          />
        )}
        {bootstrap ? <OfflineAttendanceStatus /> : null}
        <p className="px-1 text-xs leading-5 text-slate-500">
          Le pointage hors connexion est prévu pour l’appareil personnel préparé de l’employé. Les appareils partagés nécessitent une connexion.
        </p>
      </div>
    </main>
  );
}
