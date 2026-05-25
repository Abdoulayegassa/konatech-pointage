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
      panel: 'border-primary/15 bg-primary/10 text-primary',
      surface: 'border-primary/10 bg-white/95',
      accent: 'bg-primary',
    },
    outline: {
      label: 'Coverage',
      panel: 'border-slate-200 bg-slate-100 text-slate-600',
      surface: 'border-slate-200 bg-white/95',
      accent: 'bg-slate-400',
    },
    success: {
      label: 'Healthy',
      panel: 'border-success/15 bg-success/10 text-success',
      surface: 'border-success/15 bg-white/95',
      accent: 'bg-success',
    },
    warning: {
      label: 'Attention',
      panel: 'border-accent/15 bg-accent/10 text-accent',
      surface: 'border-accent/15 bg-white/95',
      accent: 'bg-accent',
    },
  }[tone];

  return (
    <Card
      className={cn(
        'group overflow-hidden rounded-[22px] border shadow-[0_12px_28px_rgba(15,45,58,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,45,58,0.10)]',
        toneMeta.surface,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <CardTitle className="text-xs font-semibold leading-5 text-slate-500">
            Aujourd hui
          </CardTitle>
        </div>
        <Badge className={toneMeta.panel} variant="outline">
          {toneMeta.label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-2 px-4 pb-4 pt-0">
        <div className="text-3xl font-black tracking-tight text-slate-950">
          {value}
        </div>
        <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-200">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 group-hover:w-full',
              toneMeta.accent,
              tone === 'outline' ? 'w-5' : 'w-9',
            )}
          />
        </div>
        <p className="text-sm leading-5 text-slate-600">{hint}</p>
      </CardContent>
    </Card>
  );
}
