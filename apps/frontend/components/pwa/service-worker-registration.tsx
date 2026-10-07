'use client';

import { useEffect, useState } from 'react';

type OfflineShellReadiness = 'preparing' | 'ready' | 'unavailable';

function publishOfflineShellReadiness(readiness: OfflineShellReadiness) {
  document.documentElement.dataset.offlineShellReadiness = readiness;
  window.dispatchEvent(new CustomEvent('inout:offline-shell-readiness', {
    detail: readiness,
  }));
}

function verifyOfflineShell(registration: ServiceWorkerRegistration) {
  const controller = navigator.serviceWorker.controller;
  if (!controller || !registration.active) {
    publishOfflineShellReadiness('preparing');
    return;
  }

  const channel = new MessageChannel();
  const timeout = window.setTimeout(() => {
    channel.port1.close();
    publishOfflineShellReadiness('unavailable');
  }, 3_000);
  channel.port1.onmessage = (event: MessageEvent<{ shellReady?: boolean }>) => {
    window.clearTimeout(timeout);
    channel.port1.close();
    publishOfflineShellReadiness(event.data?.shellReady ? 'ready' : 'unavailable');
  };
  try {
    controller.postMessage({ type: 'CHECK_OFFLINE_SHELL' }, [channel.port2]);
  } catch {
    window.clearTimeout(timeout);
    channel.port1.close();
    publishOfflineShellReadiness('unavailable');
  }
}

export function ServiceWorkerRegistration() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const onInstall = (event: Event) => {
        event.preventDefault();
        setInstallEvent(event as BeforeInstallPromptEvent);
      };
      window.addEventListener('beforeinstallprompt', onInstall);
      const scope = window.location.pathname.startsWith('/my-attendance')
        ? '/my-attendance'
        : '/attendance-entry';
      const onControllerChange = () => {
        void navigator.serviceWorker.getRegistration(scope).then((activeRegistration) => {
          if (activeRegistration) verifyOfflineShell(activeRegistration);
          else publishOfflineShellReadiness('unavailable');
        });
      };
      void navigator.serviceWorker.register('/sw.js', { scope, updateViaCache: 'none' }).then((registration) => {
        verifyOfflineShell(registration);
        if (registration.waiting) setUpdateAvailable(true);
        if (navigator.onLine) void registration.update().catch(() => undefined);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateAvailable(true);
            if (worker.state === 'activated') verifyOfflineShell(registration);
            if (worker.state === 'redundant') publishOfflineShellReadiness('unavailable');
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      }).catch(() => publishOfflineShellReadiness('unavailable'));
      return () => {
        window.removeEventListener('beforeinstallprompt', onInstall);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      };
    }
    publishOfflineShellReadiness('unavailable');
    return;
  }, []);

  if (!installEvent && !updateAvailable) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-soft">
      <p className="font-semibold text-slate-700">{updateAvailable ? 'Une nouvelle version est disponible.' : 'Installez InOut sur cet appareil.'}</p>
      {updateAvailable ? (
        <button className="rounded-xl bg-primary px-3 py-2 font-bold text-white" onClick={() => {
          void navigator.serviceWorker.getRegistration().then((registration) => registration?.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' }));
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        }} type="button">Actualiser</button>
      ) : (
        <button className="rounded-xl bg-accent px-3 py-2 font-bold text-white" onClick={() => { void installEvent?.prompt(); setInstallEvent(null); }} type="button">Installer</button>
      )}
    </div>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
