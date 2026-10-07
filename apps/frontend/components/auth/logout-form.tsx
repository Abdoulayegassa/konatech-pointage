'use client';

import { Button } from '@/components/ui/button';
import { clearActiveOfflineAttendanceBootstrap } from '@/lib/offline-attendance-queue';

export function LogoutForm() {
  return (
    <form
      action="/api/auth/logout"
      method="post"
      onSubmit={() => clearActiveOfflineAttendanceBootstrap(window.localStorage)}
    >
      <Button type="submit" variant="secondary">
        Se déconnecter
      </Button>
    </form>
  );
}
