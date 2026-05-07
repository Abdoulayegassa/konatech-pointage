import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function AttendanceEntryLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Card className="admin-reveal overflow-hidden rounded-[28px] border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(247,250,252,0.92))]">
          <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />
          <CardHeader className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-9 w-36 rounded-full" />
              <Skeleton className="h-11 w-36 rounded-2xl" />
            </div>
            <Skeleton className="h-10 w-60 rounded-full" />
            <Skeleton className="h-6 w-full max-w-xl rounded-[18px]" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-28 w-full rounded-[22px]" />
              <Skeleton className="h-28 w-full rounded-[22px]" />
            </div>
          </CardHeader>
        </Card>

        <Card className="admin-reveal admin-reveal-delay-1 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-full max-w-xl rounded-full" />
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <Skeleton className="h-40 w-full rounded-[24px]" />
            <Skeleton className="h-24 w-full rounded-[22px]" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-[20px]" />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-[20px]" />
              ))}
            </div>
            <Skeleton className="h-32 w-full rounded-[24px]" />
          </CardContent>
        </Card>

        <Card className="admin-reveal admin-reveal-delay-2 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95">
          <CardHeader className="space-y-3 border-b border-slate-200/80 pb-5">
            <Skeleton className="h-8 w-40 rounded-full" />
            <Skeleton className="h-8 w-40" />
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full rounded-[22px]" />
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
