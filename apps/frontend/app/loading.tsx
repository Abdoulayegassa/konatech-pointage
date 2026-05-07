import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function MetricSkeleton() {
  return (
    <Card className="overflow-hidden rounded-[24px] border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-end justify-between gap-4">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-14 w-14 rounded-[18px]" />
        </div>
        <Skeleton className="h-14 w-full rounded-[18px]" />
      </CardContent>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.9fr]">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-[20px]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full rounded-[20px]" />
          <Skeleton className="h-28 w-full rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_34%)]" />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:gap-8">
        <Card className="admin-reveal overflow-hidden rounded-[30px] border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))]">
          <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
          <CardHeader className="space-y-6 pb-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-9 w-44 rounded-full" />
                <Skeleton className="h-9 w-40 rounded-full" />
              </div>
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-11 w-28 rounded-2xl" />
                <Skeleton className="h-11 w-36 rounded-2xl" />
                <Skeleton className="h-11 w-36 rounded-2xl" />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
              <div className="space-y-6">
                <div className="space-y-4">
                  <Skeleton className="h-11 w-60 rounded-full" />
                  <Skeleton className="h-16 w-full max-w-4xl rounded-[24px]" />
                  <Skeleton className="h-6 w-full max-w-3xl rounded-[18px]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton
                      key={index}
                      className="h-36 w-full rounded-[24px]"
                    />
                  ))}
                </div>
              </div>

              <Card className="rounded-[28px] border-slate-200/80 bg-slate-950/95">
                <CardHeader className="space-y-4 pb-5">
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-8 w-32 rounded-full" />
                    <Skeleton className="h-8 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-7 w-52" />
                  <Skeleton className="h-4 w-full rounded-full" />
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <Skeleton className="h-24 w-full rounded-[22px]" />
                  <Skeleton className="h-24 w-full rounded-[22px]" />
                  <Skeleton className="h-24 w-full rounded-[22px]" />
                </CardContent>
              </Card>
            </div>
          </CardHeader>
        </Card>

        <section className="admin-reveal admin-reveal-delay-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <MetricSkeleton key={index} />
          ))}
        </section>

        <Card className="admin-reveal admin-reveal-delay-2 overflow-hidden border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-60" />
                <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
              </div>
              <Skeleton className="h-11 w-56 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-36 w-full rounded-[24px] lg:h-44"
              />
            ))}
          </CardContent>
        </Card>

        <section className="admin-reveal admin-reveal-delay-3">
          <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
            <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
              <Skeleton className="h-8 w-40 rounded-full" />
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <ActivitySkeleton key={index} />
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
