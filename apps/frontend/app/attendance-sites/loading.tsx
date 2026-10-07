import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function AttendanceSitesLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Skeleton className="h-44 w-full rounded-[30px]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <Card className="rounded-[28px]">
          <CardHeader>
            <Skeleton className="h-8 w-52" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton className="h-28 w-full rounded-[22px]" key={index} />
            ))}
          </CardContent>
        </Card>
        <Skeleton className="h-[520px] w-full rounded-[28px]" />
      </div>
    </main>
  );
}
