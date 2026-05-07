import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type MetricCardProps = {
  label: string;
  value: number | string;
  hint: string;
  tone: 'default' | 'outline' | 'success' | 'warning';
};

export function MetricCard({ hint, label, tone, value }: MetricCardProps) {
  const toneMeta = {
    default: {
      label: 'Operations',
      icon: 'grid',
      panel: 'border-primary/15 bg-primary/10 text-primary',
      surface:
        'border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.05),rgba(255,255,255,0.98))]',
      accent: 'bg-primary',
      glow: 'from-primary/15 via-primary/5 to-transparent',
    },
    outline: {
      label: 'Coverage',
      icon: 'ring',
      panel: 'border-slate-200 bg-slate-100 text-slate-600',
      surface:
        'border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.95))]',
      accent: 'bg-slate-400',
      glow: 'from-slate-200/80 via-slate-100/20 to-transparent',
    },
    success: {
      label: 'Healthy',
      icon: 'pulse',
      panel: 'border-success/15 bg-success/10 text-success',
      surface:
        'border-success/15 bg-[linear-gradient(180deg,rgba(25,135,84,0.07),rgba(255,255,255,0.98))]',
      accent: 'bg-success',
      glow: 'from-success/15 via-success/5 to-transparent',
    },
    warning: {
      label: 'Attention',
      icon: 'spark',
      panel: 'border-accent/15 bg-accent/10 text-accent',
      surface:
        'border-accent/15 bg-[linear-gradient(180deg,rgba(244,110,40,0.09),rgba(255,255,255,0.98))]',
      accent: 'bg-accent',
      glow: 'from-accent/15 via-accent/5 to-transparent',
    },
  }[tone];

  return (
    <Card
      className={cn(
        'group relative overflow-hidden rounded-[24px] border shadow-[0_16px_36px_rgba(15,45,58,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,45,58,0.14)]',
        toneMeta.surface,
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-24 bg-gradient-to-r opacity-90',
          toneMeta.glow,
        )}
      />

      <CardHeader className="relative flex flex-row items-start justify-between gap-4 space-y-0 pb-1">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <CardTitle className="text-sm leading-5 text-slate-600">
            Aujourd hui
          </CardTitle>
        </div>
        <Badge className={toneMeta.panel} variant="outline">
          {toneMeta.label}
        </Badge>
      </CardHeader>

      <CardContent className="relative space-y-2 pt-1">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-[2.8rem]">
              {value}
            </div>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300 group-hover:w-full',
                  toneMeta.accent,
                  tone === 'outline' ? 'w-6' : 'w-10',
                )}
              />
            </div>
          </div>

          <div
            className={cn(
              'grid h-12 w-12 shrink-0 place-items-center rounded-2xl border shadow-sm transition duration-200 group-hover:-translate-y-0.5',
              toneMeta.panel,
            )}
          >
            {toneMeta.icon === 'pulse' ? (
              <div className="flex items-end gap-1">
                <span className="h-4 w-1.5 rounded-full bg-current/50" />
                <span className="h-6 w-1.5 rounded-full bg-current" />
                <span className="h-3 w-1.5 rounded-full bg-current/70" />
              </div>
            ) : null}
            {toneMeta.icon === 'spark' ? (
              <div className="relative h-6 w-6">
                <span className="absolute left-1/2 top-0 h-6 w-0.5 -translate-x-1/2 rounded-full bg-current" />
                <span className="absolute left-0 top-1/2 h-0.5 w-6 -translate-y-1/2 rounded-full bg-current" />
                <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current/20" />
              </div>
            ) : null}
            {toneMeta.icon === 'grid' ? (
              <div className="grid grid-cols-2 gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-current/40" />
                <span className="h-2.5 w-2.5 rounded-sm bg-current" />
                <span className="h-2.5 w-2.5 rounded-sm bg-current" />
                <span className="h-2.5 w-2.5 rounded-sm bg-current/40" />
              </div>
            ) : null}
            {toneMeta.icon === 'ring' ? (
              <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-current/70">
                <span className="h-2.5 w-2.5 rounded-full bg-current/70" />
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-sm leading-5 text-slate-600">{hint}</p>
      </CardContent>
    </Card>
  );
}
