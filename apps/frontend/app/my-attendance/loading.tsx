import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function MyAttendanceLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />

      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:gap-8">
        <Card className="admin-reveal overflow-hidden rounded-[30px] border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))]">
          <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
          <CardHeader className="space-y-6 pb-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-9 w-52 rounded-full" />
                <Skeleton className="h-9 w-40 rounded-full" />
              </div>
              <Skeleton className="h-11 w-36 rounded-2xl" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.22fr_0.78fr]">
              <div className="space-y-6">
                <div className="space-y-4">
                  <Skeleton className="h-11 w-64 rounded-full" />
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
                  <Skeleton className="h-8 w-36 rounded-full" />
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-full rounded-full" />
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <Skeleton className="h-44 w-full rounded-[24px]" />
                  <Skeleton className="h-24 w-full rounded-[22px]" />
                  <Skeleton className="h-24 w-full rounded-[22px]" />
                </CardContent>
              </Card>
            </div>
          </CardHeader>
        </Card>

        <section className="admin-reveal admin-reveal-delay-1 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card className="overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
            <CardHeader className="space-y-5 border-b border-slate-200/80 pb-5">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-28 rounded-full" />
                <Skeleton className="h-8 w-36 rounded-full" />
              </div>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
              <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-28 w-full rounded-[22px]"
                  />
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <Skeleton className="h-24 w-full rounded-[24px]" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-32 w-full rounded-[24px]" />
                <Skeleton className="h-32 w-full rounded-[24px]" />
              </div>
              <Skeleton className="h-32 w-full rounded-[24px]" />
              <Skeleton className="h-20 w-full rounded-[22px]" />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Skeleton className="h-40 w-full rounded-[24px]" />
              <Skeleton className="h-40 w-full rounded-[24px]" />
            </section>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-36 w-full rounded-[24px]" />
              ))}
            </section>
          </div>
        </section>

        <Card className="admin-reveal admin-reveal-delay-2 overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
            <Skeleton className="h-8 w-40 rounded-full" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-full" />
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-56 w-full rounded-[24px]" />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
