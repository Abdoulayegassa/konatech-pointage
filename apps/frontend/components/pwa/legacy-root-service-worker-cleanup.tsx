'use client';

import { useEffect } from 'react';

/** Removes the previously installed root-scope worker without registering a PWA on Admin pages. */
export function LegacyRootServiceWorkerCleanup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        if (registration.scope === `${window.location.origin}/` &&
          registration.active?.scriptURL === `${window.location.origin}/sw.js`) {
          void registration.unregister();
        }
      }
    });
  }, []);
  return null;
}
