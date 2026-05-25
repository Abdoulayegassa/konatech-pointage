'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type AttendanceEntrySessionButtonProps = {
  className?: string;
  label?: string;
  onLoggedOut?: () => void;
  size?: 'default' | 'sm' | 'lg';
  variant?: 'default' | 'secondary' | 'ghost';
};

export function AttendanceEntrySessionButton({
  className,
  label = 'Se déconnecter',
  onLoggedOut,
  size = 'default',
  variant = 'secondary',
}: AttendanceEntrySessionButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setIsPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/attendance-entry-session', {
        method: 'DELETE',
      });

      if (!response.ok) {
        setError('Impossible de fermer cette session PIN.');
        return;
      }

      onLoggedOut?.();
      router.replace('/attendance-entry');
      router.refresh();
    } catch {
      setError('Impossible de fermer cette session PIN.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        disabled={isPending}
        onClick={handleLogout}
        size={size}
        type="button"
        variant={variant}
      >
        {isPending ? 'Deconnexion...' : label}
      </Button>
      {error ? (
        <p className="text-sm font-medium text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
