import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  success: 'border-success/20 bg-success-subtle text-success',
  warning: 'border-warning/20 bg-warning-subtle text-warning',
  danger: 'border-danger/20 bg-danger-subtle text-danger',
  info: 'border-info/20 bg-info-subtle text-info',
} as const;

export function AdminAlert({ tone, title, children, className }: { tone: keyof typeof tones; title?: string; children: ReactNode; className?: string }) {
  return <div className={cn('admin-alert rounded-card border px-3 py-2.5 text-sm', tones[tone], className)} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
    {title ? <p className="font-semibold">{title}</p> : null}<div className={title ? 'mt-0.5' : undefined}>{children}</div>
  </div>;
}
