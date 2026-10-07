import { PageShell } from '@/components/layout/page-shell';

export default function SubscriptionLoading() {
  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <div className="rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-soft lg:p-6">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">
          Abonnement et quotas
        </p>
        <h1 className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
          Chargement de votre offre…
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Récupération du plan, des dates et de l’utilisation actuelle.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton-shimmer h-52 rounded-[28px]" />
        <div className="skeleton-shimmer h-52 rounded-[28px]" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton-shimmer h-48 rounded-[24px]" />
        <div className="skeleton-shimmer h-48 rounded-[24px]" />
        <div className="skeleton-shimmer h-48 rounded-[24px]" />
      </div>
    </PageShell>
  );
}
