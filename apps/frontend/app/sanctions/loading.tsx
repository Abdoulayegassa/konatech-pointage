import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function SanctionsLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />
      <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:gap-6">
        <Card className="rounded-[30px] border-white/70 bg-white/95">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
            <Skeleton className="h-9 w-64 rounded-2xl" />
            <Skeleton className="h-5 w-full max-w-xl rounded-full" />
          </CardHeader>
        </Card>
        <div className="flex flex-wrap gap-2 rounded-[24px] border border-white/70 bg-white/95 p-2">
          <Skeleton className="h-10 w-36 rounded-2xl" />
          <Skeleton className="h-10 w-44 rounded-2xl" />
        </div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-[22px]" />
          ))}
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-96 rounded-[28px]" />
          ))}
        </section>
        <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <Skeleton className="h-64 rounded-[28px]" />
          <Skeleton className="h-64 rounded-[28px]" />
        </section>
        <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 rounded-2xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
