import Link from 'next/link';
import type { DashboardOverview } from '@/lib/api';

type DashboardAnalyticsSectionProps = {
  analytics: DashboardOverview['analytics'];
};

function formatHours(value: number) {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
}

export function DashboardAnalyticsSection({
  analytics,
}: DashboardAnalyticsSectionProps) {
  const metrics = [
    { label: 'Absences', value: analytics.absenceCountThisMonth },
    { label: 'Heures supplémentaires', value: formatHours(analytics.overtimeHoursThisMonth) },
    { label: 'Départs anticipés', value: analytics.earlyExitCount },
  ];

  return (
    <section aria-labelledby="monthly-summary-title" className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-black text-slate-950" id="monthly-summary-title">Ce mois-ci</h2>
        <Link className="text-sm font-semibold text-primary underline underline-offset-2" href="/organization/reports">Voir les rapports</Link>
      </header>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt className="text-xs font-medium text-slate-500">{metric.label}</dt>
            <dd className="mt-0.5 text-lg font-bold text-slate-900">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
