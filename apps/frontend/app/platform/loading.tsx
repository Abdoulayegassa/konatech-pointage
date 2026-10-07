import { PlatformShell } from '@/components/platform/platform-shell';
import { Badge } from '@/components/ui/badge';

export default function PlatformLoading() {
  return (
    <PlatformShell activeSection="dashboard">
      <div className="rounded-[26px] border border-slate-800 bg-slate-950 p-4 text-white">
        <Badge
          className="border-white/15 bg-white/10 text-white"
          variant="outline"
        >
          Administration plateforme
        </Badge>
        <p className="mt-2 text-sm text-slate-300">
          Chargement de la vue SaaS globale…
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="skeleton-shimmer h-28 rounded-2xl" key={index} />
        ))}
      </div>
      <div className="skeleton-shimmer h-96 rounded-[30px]" />
    </PlatformShell>
  );
}
