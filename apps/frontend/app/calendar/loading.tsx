import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function CalendarLoading() {
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
        <Skeleton className="h-40 rounded-[28px]" />
        <section className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
          <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-[24px]" />
              <Skeleton className="h-48 w-full rounded-[24px]" />
              <Skeleton className="h-24 w-full rounded-[24px]" />
            </CardContent>
          </Card>
          <Card className="rounded-[28px] border-slate-200/80 bg-white/95">
            <CardContent className="space-y-3 p-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-[20px]" />
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
