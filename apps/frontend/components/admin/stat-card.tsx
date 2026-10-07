import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  icon,
  supportingInformation,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  supportingInformation?: ReactNode;
}) {
  return (
    <article className="admin-stat-card min-w-0 rounded-xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <dl className="min-w-0">
          <dt className="text-sm font-medium leading-5 text-text-secondary">{label}</dt>
          <dd className="admin-kpi-value mt-1 text-2xl font-semibold leading-tight text-foreground">
            {value}
          </dd>
        </dl>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent [&_svg]:h-4 [&_svg]:w-4"
          >
            {icon}
          </span>
        ) : null}
      </div>
      {supportingInformation ? (
        <p className="mt-2 text-xs leading-4 text-text-secondary">
          {supportingInformation}
        </p>
      ) : null}
    </article>
  );
}
