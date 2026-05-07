import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidthClassName?: string;
};

type PageHeroStat = {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
};

type PageHeroProps = {
  actions?: ReactNode;
  aside?: ReactNode;
  badge?: string;
  dateLabel?: string;
  description?: string;
  eyebrow?: string;
  stats?: PageHeroStat[];
  title: string;
};

const heroStatToneMap = {
  default:
    'border-slate-200/80 bg-white/88 text-slate-600',
  success:
    'border-success/15 bg-[linear-gradient(180deg,rgba(240,253,244,0.88),rgba(255,255,255,0.96))] text-success',
  warning:
    'border-accent/15 bg-[linear-gradient(180deg,rgba(255,248,244,0.9),rgba(255,255,255,0.96))] text-accent',
  danger:
    'border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.92),rgba(255,255,255,0.98))] text-red-700',
} as const;

export function PageShell({
  children,
  className,
  contentClassName,
  maxWidthClassName = 'max-w-7xl',
}: PageShellProps) {
  return (
    <main
      className={cn(
        'relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8 lg:py-6',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />

      <div
        className={cn(
          'mx-auto flex flex-col gap-5 lg:gap-6',
          maxWidthClassName,
          contentClassName,
        )}
      >
        {children}
      </div>
    </main>
  );
}

export function PageHero({
  actions,
  aside,
  badge,
  dateLabel,
  description,
  eyebrow,
  stats,
  title,
}: PageHeroProps) {
  return (
    <header className="admin-reveal relative overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))] shadow-soft">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
      <div className="absolute -right-24 top-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:p-7">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {badge ? (
              <Badge className="bg-accent/15 text-accent" variant="warning">
                {badge}
              </Badge>
            ) : null}
            {dateLabel ? <Badge variant="outline">{dateLabel}</Badge> : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap gap-2 sm:items-center">{actions}</div>
          ) : null}
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div className="space-y-4">
            {eyebrow ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {eyebrow}
                </span>
              </div>
            ) : null}

            <div className="space-y-2.5">
              <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-balance text-slate-950 sm:text-[2.8rem] lg:text-[3.2rem]">
                {title}
              </h1>
              {description ? (
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {description}
                </p>
              ) : null}
            </div>

            {stats?.length ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className={cn(
                      'rounded-2xl border p-3.5 shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:shadow-soft',
                      heroStatToneMap[stat.tone ?? 'default'],
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {stat.label}
                    </p>
                    <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                      {stat.value}
                    </p>
                    {stat.meta ? (
                      <p className="mt-1.5 text-sm leading-5 text-slate-600">
                        {stat.meta}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {aside ? <div>{aside}</div> : null}
        </section>
      </div>
    </header>
  );
}
