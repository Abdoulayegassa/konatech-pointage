import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';

type AdminEmptyStateProps = {
  badge: string;
  title: string;
  description: string;
  detail?: string;
  action?: ReactNode;
};

export function AdminEmptyState({
  action,
  badge,
  description,
  detail,
  title,
}: AdminEmptyStateProps) {
  return (
    <div className="admin-reveal rounded-[24px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-5 py-10 text-center shadow-sm sm:px-8">
      <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-accent/15 bg-white/85 px-3 py-2 shadow-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
          Etat vide premium
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <Badge variant="outline">{badge}</Badge>
        <p className="text-lg font-semibold text-slate-950 sm:text-xl">
          {title}
        </p>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-600">
          {description}
        </p>
        {detail ? (
          <p className="mx-auto max-w-xl text-sm font-medium leading-6 text-slate-500">
            {detail}
          </p>
        ) : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}
