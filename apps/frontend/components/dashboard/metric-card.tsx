import { Card, CardContent } from '@/components/ui/card';

type MetricCardProps = {
  label: string;
  value: number | string;
  hint: string;
  periodLabel?: string;
  tone: 'default' | 'outline' | 'success' | 'warning' | 'danger' | 'purple';
};

const valueTone = {
  default: 'text-slate-950',
  outline: 'text-slate-950',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
  purple: 'text-purple-700',
};

export function MetricCard({ hint, label, periodLabel = "Aujourd'hui", tone, value }: MetricCardProps) {
  return (
    <Card className="rounded-xl border-slate-200 bg-white shadow-none">
      <CardContent className="p-3">
        <p className="text-xs font-medium text-slate-500">{label} · {periodLabel}</p>
        <p className={`mt-1 text-2xl font-bold leading-none ${valueTone[tone]}`}>{value}</p>
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      </CardContent>
    </Card>
  );
}
