import { PlatformShell } from '@/components/platform/platform-shell';

export default function PlatformSubscriptionsLoading() {
  return (
    <PlatformShell activeSection="subscriptions">
      <main
        aria-busy="true"
        aria-label="Chargement des abonnements"
        className="min-w-0 space-y-5"
      >
        <div role="status">
          <h1 className="text-2xl font-semibold tracking-tight text-[#25282D]">
            Abonnements
          </h1>
          <p className="mt-1 text-sm text-[#666D77]">
            Chargement du cycle de vie…
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton-shimmer h-20 rounded-xl" key={index} />
          ))}
        </div>
        <div className="skeleton-shimmer h-96 rounded-xl" />
      </main>
    </PlatformShell>
  );
}
