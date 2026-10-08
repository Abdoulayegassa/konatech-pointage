import { PlatformShell } from '@/components/platform/platform-shell';

export default function PlatformPlansLoading() {
  return (
    <PlatformShell activeSection="plans">
      <main
        aria-busy="true"
        aria-label="Chargement des plans"
        className="min-w-0 space-y-6"
      >
        <div role="status">
          <h1 className="text-2xl font-semibold tracking-tight text-[#25282D]">
            Plans
          </h1>
          <p className="mt-1 text-sm text-[#666D77]">
            Chargement des limites V1…
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="skeleton-shimmer h-72 rounded-xl" key={index} />
          ))}
        </div>
        <div className="skeleton-shimmer h-40 rounded-xl" />
      </main>
    </PlatformShell>
  );
}
