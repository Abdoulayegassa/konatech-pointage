import { PlatformShell } from '@/components/platform/platform-shell';

export default function PlatformSubscriptionsLoading() {
  return (
    <PlatformShell activeSection="subscriptions">
      <div className="skeleton-shimmer h-56 rounded-[30px]" />
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skeleton-shimmer h-28 rounded-2xl" key={index} />
        ))}
      </div>
      <div className="skeleton-shimmer h-96 rounded-[30px]" />
    </PlatformShell>
  );
}
