import { PageShell } from '@/components/layout/page-shell';

export default function OrganizationSettingsLoading() {
  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <div className="rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-soft lg:p-6">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">
          Organisation
        </p>
        <h1 className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
          Chargement des paramètres…
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Récupération du profil et des règles de présence.
        </p>
      </div>
      <div className="skeleton-shimmer h-72 rounded-[28px]" />
      <div className="skeleton-shimmer h-96 rounded-[28px]" />
    </PageShell>
  );
}
